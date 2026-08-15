import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Pool, type PoolClient } from "pg";

import {
  InMemoryGameService,
  type ClaimResult,
  type CreateGameResult,
  type GameAuthorization,
  type GameServiceSnapshot,
  type RecoveryIssueResult,
  type StoredAction,
} from "./game-service.js";
import type { CommandResult, GameState, Side } from "@gettysburg/game";

const migrationsDirectory = fileURLToPath(
  new URL("../migrations", import.meta.url),
);

export interface GameService {
  authenticate(
    credential: string | undefined,
    gameId: string,
  ): Promise<GameAuthorization>;
  claimInvitation(input: {
    credential?: string;
    lookupId: string;
    requestedGameId?: string;
    requestedSeat?: Side;
    secret: string;
  }): Promise<ClaimResult>;
  claimSeatRecovery(input: {
    credential?: string;
    lookupId: string;
    secret: string;
  }): Promise<ClaimResult>;
  createGame(
    side: Side,
    existingCredential?: string,
  ): Promise<CreateGameResult>;
  executeCommand(
    authorization: GameAuthorization,
    input: unknown,
    options?: { afterCommit?: () => void },
  ): Promise<CommandResult>;
  getActions(gameId: string): Promise<readonly StoredAction[]>;
  getAuthorizedState(authorization: GameAuthorization): Promise<GameState>;
  getGameState(gameId: string): Promise<GameState>;
  issueSeatRecovery(
    gameId: string,
    side: Side,
    operatorIdentity: string,
  ): Promise<RecoveryIssueResult>;
}

export class InMemoryAsyncGameService implements GameService {
  constructor(readonly service = new InMemoryGameService()) {}

  async authenticate(credential: string | undefined, gameId: string) {
    return this.service.authenticate(credential, gameId);
  }
  async claimInvitation(
    input: Parameters<InMemoryGameService["claimInvitation"]>[0],
  ) {
    return this.service.claimInvitation(input);
  }
  async claimSeatRecovery(
    input: Parameters<InMemoryGameService["claimSeatRecovery"]>[0],
  ) {
    return this.service.claimSeatRecovery(input);
  }
  async createGame(side: Side, credential?: string) {
    return this.service.createGame(side, credential);
  }
  async executeCommand(
    authorization: GameAuthorization,
    input: unknown,
    options: { afterCommit?: () => void } = {},
  ) {
    return this.service.executeCommand(authorization, input, options);
  }
  async getActions(gameId: string) {
    return this.service.getActions(gameId);
  }
  async getAuthorizedState(authorization: GameAuthorization) {
    return this.service.getAuthorizedState(authorization);
  }
  async getGameState(gameId: string) {
    return this.service.getGameState(gameId);
  }
  async issueSeatRecovery(
    gameId: string,
    side: Side,
    operatorIdentity: string,
  ) {
    return this.service.issueSeatRecovery(gameId, side, operatorIdentity);
  }
}

export class PostgresGameService implements GameService {
  readonly #pool: Pool;
  readonly #pepper: Uint8Array;

  constructor(options: { connectionString: string; pepper: Uint8Array }) {
    this.#pool = new Pool({
      connectionString: options.connectionString,
      max: 10,
    });
    this.#pepper = options.pepper;
  }

  async migrate(): Promise<void> {
    const filenames = (await readdir(migrationsDirectory))
      .filter((name) => /^\d+.*\.sql$/.test(name))
      .sort();
    const client = await this.#pool.connect();
    try {
      await client.query(
        "SELECT pg_advisory_lock(hashtext('gettysburg-schema-migrations'))",
      );
      for (const filename of filenames) {
        await client.query(
          await readFile(join(migrationsDirectory, filename), "utf8"),
        );
      }
      const initial = new InMemoryGameService({
        pepper: this.#pepper,
      }).exportSnapshot();
      await client.query(
        "INSERT INTO service_state(singleton, snapshot) VALUES (true, $1::jsonb) ON CONFLICT DO NOTHING",
        [JSON.stringify(initial)],
      );
    } finally {
      await client.query(
        "SELECT pg_advisory_unlock(hashtext('gettysburg-schema-migrations'))",
      );
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }

  async isReady(): Promise<boolean> {
    try {
      const result = await this.#pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM schema_migrations WHERE version = 1",
      );
      return result.rows[0]?.count === "1";
    } catch {
      return false;
    }
  }

  async authenticate(credential: string | undefined, gameId: string) {
    return this.#read((service) => service.authenticate(credential, gameId));
  }

  async claimInvitation(
    input: Parameters<InMemoryGameService["claimInvitation"]>[0],
  ) {
    return this.#mutate((service) => service.claimInvitation(input));
  }

  async claimSeatRecovery(
    input: Parameters<InMemoryGameService["claimSeatRecovery"]>[0],
  ) {
    return this.#mutate((service) => service.claimSeatRecovery(input));
  }

  async createGame(side: Side, existingCredential?: string) {
    return this.#mutate((service) =>
      service.createGame(side, existingCredential),
    );
  }

  async executeCommand(
    authorization: GameAuthorization,
    input: unknown,
    options: { afterCommit?: () => void } = {},
  ) {
    const result = await this.#mutate((service) =>
      service.executeCommand(authorization, input),
    );
    options.afterCommit?.();
    return result;
  }

  async getActions(gameId: string) {
    return this.#read((service) => service.getActions(gameId));
  }

  async getAuthorizedState(authorization: GameAuthorization) {
    return this.#read((service) => service.getAuthorizedState(authorization));
  }

  async getGameState(gameId: string) {
    return this.#read((service) => service.getGameState(gameId));
  }

  async issueSeatRecovery(
    gameId: string,
    side: Side,
    operatorIdentity: string,
  ) {
    return this.#mutate((service) =>
      service.issueSeatRecovery(gameId, side, operatorIdentity),
    );
  }

  async #read<T>(operation: (service: InMemoryGameService) => T): Promise<T> {
    const result = await this.#pool.query<{ snapshot: GameServiceSnapshot }>(
      "SELECT snapshot FROM service_state WHERE singleton = true",
    );
    const snapshot = result.rows[0]?.snapshot;
    if (snapshot === undefined)
      throw new Error("PostgreSQL service state is unavailable");
    return operation(
      new InMemoryGameService({ pepper: this.#pepper, snapshot }),
    );
  }

  async #mutate<T>(operation: (service: InMemoryGameService) => T): Promise<T> {
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<{ snapshot: GameServiceSnapshot }>(
        "SELECT snapshot FROM service_state WHERE singleton = true FOR UPDATE",
      );
      const snapshot = result.rows[0]?.snapshot;
      if (snapshot === undefined)
        throw new Error("PostgreSQL service state is unavailable");
      const service = new InMemoryGameService({
        pepper: this.#pepper,
        snapshot,
      });
      const value = operation(service);
      const nextSnapshot = service.exportSnapshot();
      await client.query(
        "UPDATE service_state SET snapshot = $1::jsonb, updated_at = now() WHERE singleton = true",
        [JSON.stringify(nextSnapshot)],
      );
      await this.#mirrorSnapshot(client, nextSnapshot);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async #mirrorSnapshot(client: PoolClient, snapshot: GameServiceSnapshot) {
    for (const [gameId, game] of snapshot.games) {
      const state = game.state;
      await client.query(
        `INSERT INTO games
          (id, status, turn, phase, active_side, state_version, event_sequence,
           ruleset_version, content_revision, state)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status, turn = EXCLUDED.turn, phase = EXCLUDED.phase,
           active_side = EXCLUDED.active_side, state_version = EXCLUDED.state_version,
           event_sequence = EXCLUDED.event_sequence,
           ruleset_version = EXCLUDED.ruleset_version,
           content_revision = EXCLUDED.content_revision, state = EXCLUDED.state,
           updated_at = now()`,
        [
          gameId,
          state.phase === "completed" ? "completed" : "active",
          state.turn,
          state.phase,
          state.active_side,
          state.version,
          state.event_sequence,
          state.ruleset_version,
          state.content_revision,
          JSON.stringify(state),
        ],
      );
      await client.query(
        `INSERT INTO snapshots
          (game_id, event_sequence, state_version, ruleset_version, content_revision, state)
         VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb)
         ON CONFLICT (game_id, event_sequence) DO NOTHING`,
        [
          gameId,
          state.event_sequence,
          state.version,
          state.ruleset_version,
          state.content_revision,
          JSON.stringify(state),
        ],
      );
      for (const action of game.actions)
        await this.#insertAction(client, gameId, action);
    }

    for (const session of snapshot.sessions) {
      await client.query(
        `INSERT INTO browser_sessions (id, credential_hash, expires_at, revoked_at)
         VALUES ($1::uuid, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET
           expires_at = EXCLUDED.expires_at, revoked_at = EXCLUDED.revoked_at`,
        [
          session.id,
          session.credentialHash,
          new Date(session.expiresAt),
          session.revokedAt === null ? null : new Date(session.revokedAt),
        ],
      );
    }
    for (const binding of snapshot.hostBindings) {
      await client.query(
        `INSERT INTO host_bindings
          (id, game_id, browser_session_id, binding_version, revoked_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5)
         ON CONFLICT (id) DO UPDATE SET revoked_at = EXCLUDED.revoked_at`,
        [
          binding.id,
          binding.gameId,
          binding.sessionId,
          binding.version,
          binding.revokedAt === null ? null : new Date(binding.revokedAt),
        ],
      );
    }
    for (const binding of snapshot.seatBindings) {
      await client.query(
        `INSERT INTO seat_bindings
          (id, game_id, side, browser_session_id, binding_version, revoked_at)
         VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6)
         ON CONFLICT (id) DO UPDATE SET revoked_at = EXCLUDED.revoked_at`,
        [
          binding.id,
          binding.gameId,
          binding.side,
          binding.sessionId,
          binding.version,
          binding.revokedAt === null ? null : new Date(binding.revokedAt),
        ],
      );
    }
    for (const [, invitation] of snapshot.invitations) {
      await client.query(
        `INSERT INTO invitations
          (lookup_id, game_id, allowed_side, token_hash, expires_at, claimed_at, revoked_at)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7)
         ON CONFLICT (lookup_id) DO UPDATE SET
           claimed_at = EXCLUDED.claimed_at, revoked_at = EXCLUDED.revoked_at`,
        [
          invitation.lookupId,
          invitation.gameId,
          invitation.allowedSeat,
          invitation.tokenHash,
          new Date(invitation.expiresAt),
          invitation.claimedAt === null ? null : new Date(invitation.claimedAt),
          invitation.revokedAt === null ? null : new Date(invitation.revokedAt),
        ],
      );
    }
    for (const [, grant] of snapshot.recoveryGrants) {
      await client.query(
        `INSERT INTO recovery_grants
          (lookup_id, game_id, target_binding_type, side, target_binding_id,
           target_binding_version, token_hash, operator_identity, expires_at,
           consumed_at, revoked_at)
         VALUES ($1::uuid, $2::uuid, 'seat', $3, $4::uuid, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (lookup_id) DO UPDATE SET
           consumed_at = EXCLUDED.consumed_at, revoked_at = EXCLUDED.revoked_at`,
        [
          grant.lookupId,
          grant.gameId,
          grant.side,
          grant.oldBindingId,
          grant.oldBindingVersion,
          grant.tokenHash,
          grant.operatorIdentity,
          new Date(grant.expiresAt),
          grant.consumedAt === null ? null : new Date(grant.consumedAt),
          grant.revokedAt === null ? null : new Date(grant.revokedAt),
        ],
      );
    }
  }

  async #insertAction(
    client: PoolClient,
    gameId: string,
    action: StoredAction,
  ) {
    await client.query(
      `INSERT INTO actions
        (game_id, sequence, kind, command_id, operator_request_id,
         authorizing_type, authorizing_id, authorizing_version,
         canonicalization_version, canonical_request_hash, expected_version,
         resulting_version, ruleset_version, content_revision, command_name,
         payload, result)
       VALUES ($1::uuid, $2, $3, $4::uuid, $5::uuid, $6, $7, $8, $9, $10,
               $11, $12, $13, $14, $15, $16::jsonb, $17::jsonb)
       ON CONFLICT (game_id, sequence) DO NOTHING`,
      [
        gameId,
        action.sequence,
        action.kind,
        action.commandId,
        action.operatorRequestId,
        action.authorizingType,
        action.authorizingId,
        action.authorizingVersion,
        action.canonicalizationVersion,
        action.canonicalRequestHash,
        action.expectedVersion,
        action.resultingVersion,
        action.rulesetVersion,
        action.contentRevision,
        action.commandName,
        action.payload === null ? null : JSON.stringify(action.payload),
        action.result === null ? null : JSON.stringify(action.result),
      ],
    );
  }
}
