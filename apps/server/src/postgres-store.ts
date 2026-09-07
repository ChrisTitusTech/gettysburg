import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Pool, type PoolClient } from "pg";
import { DeliverySlots } from "./delivery-slots.js";
import type { PushDeliveryOutcome } from "./push-outbox.js";

import {
  InMemoryGameService,
  type ClaimResult,
  type CreateGameResult,
  type DeletionReceipt,
  type GameAuthorization,
  type GameView,
  type SpectatorClaimResult,
  type SpectatorView,
  type SpectatorAuthorization,
  type HostManagementCommitOptions,
  type SpectatorGrantSummary,
  type PushSubscriptionStatus,
  type PushDelivery,
  type GameServiceSnapshot,
  type HostAuthorization,
  type HostManagementResult,
  type HostRecoveryClaimResult,
  type RecoveryExport,
  type ReplaySnapshot,
  type RecoveryIssueResult,
  type StoredAction,
} from "./game-service.js";
import type {
  CommandResult,
  AuditEvent,
  GameState,
  ManagementEvent,
  Side,
} from "@gettysburg/game";

const migrationsDirectory = fileURLToPath(
  new URL("../migrations", import.meta.url),
);

export interface GameService {
  claimPushDelivery(): Promise<PushDelivery | undefined>;
  finishPushDelivery(
    id: string,
    leaseToken: string,
    outcome: PushDeliveryOutcome,
  ): Promise<void>;
  setPushSubscription(
    credential: string | undefined,
    gameId: string,
    input: unknown,
  ): Promise<PushSubscriptionStatus>;
  getPushSubscriptionStatus(
    credential: string | undefined,
    gameId: string,
  ): Promise<PushSubscriptionStatus>;
  removePushSubscription(
    credential: string | undefined,
    gameId: string,
  ): Promise<PushSubscriptionStatus>;
  verifyRoomGame(gameId: string, signal: AbortSignal): Promise<void>;
  deliverAuthorizedState(
    authorization: GameAuthorization | SpectatorAuthorization,
    deliver: (state: GameState) => void,
    signal: AbortSignal,
  ): Promise<void>;
  deliverAuthorizedSpectators(
    authorizations: readonly SpectatorAuthorization[],
    deliver: (permitted: readonly string[]) => void,
    signal: AbortSignal,
  ): Promise<void>;
  authenticateSpectator(
    credential: string | undefined,
    gameId: string,
  ): Promise<SpectatorAuthorization>;
  getAuthorizedSpectatorState(
    authorization: SpectatorAuthorization,
  ): Promise<GameState>;
  getSpectatorGrants(
    credential: string | undefined,
    gameId: string,
  ): Promise<readonly SpectatorGrantSummary[]>;
  claimSpectatorInvitation(
    input: Parameters<InMemoryGameService["claimSpectatorInvitation"]>[0],
  ): Promise<SpectatorClaimResult>;
  getSpectatorView(
    credential: string | undefined,
    gameId: string,
  ): Promise<SpectatorView>;
  canRetryTerminalDelete(
    credential: string | undefined,
    gameId: string,
    commandId: string,
  ): Promise<boolean>;
  authenticate(
    credential: string | undefined,
    gameId: string,
  ): Promise<GameAuthorization>;
  authenticateHost(
    credential: string | undefined,
    gameId: string,
    options?: { terminalCommandId?: string },
  ): Promise<HostAuthorization>;
  claimInvitation(input: {
    claimId?: string;
    credential?: string;
    lookupId: string;
    requestedGameId?: string;
    requestedSeat?: Side;
    secret: string;
  }): Promise<ClaimResult>;
  claimSeatRecovery(
    input: {
      claimId?: string;
      credential?: string;
      lookupId: string;
      secret: string;
    },
    options?: { afterCommit?: (event: AuditEvent) => void },
  ): Promise<ClaimResult>;
  claimHostRecovery(
    input: {
      claimId?: string;
      credential?: string;
      lookupId: string;
      secret: string;
    },
    options?: { afterCommit?: (event: AuditEvent) => void },
  ): Promise<HostRecoveryClaimResult>;
  createGame(
    side: Side,
    existingCredential?: string,
    creationId?: string,
    creationCredential?: string,
  ): Promise<CreateGameResult>;
  executeCommand(
    authorization: GameAuthorization,
    input: unknown,
    options?: { afterCommit?: () => void },
  ): Promise<CommandResult>;
  executeHostCommand(
    authorization: HostAuthorization,
    input: unknown,
    options?: HostManagementCommitOptions,
  ): Promise<HostManagementResult>;
  getActions(gameId: string): Promise<readonly StoredAction[]>;
  getActiveInvitations(
    gameId: string,
  ): Promise<readonly { lookup_id: string; seat: Side }[]>;
  getDeletionLedger(): Promise<readonly DeletionReceipt[]>;
  getAuthorizedState(authorization: GameAuthorization): Promise<GameState>;
  getGameState(gameId: string): Promise<GameState>;
  getGameView(
    credential: string | undefined,
    gameId: string,
  ): Promise<GameView>;
  getReplay(
    credential: string | undefined,
    gameId: string,
    sequence?: number,
  ): Promise<ReplaySnapshot>;
  getRecoveryExport(
    credential: string | undefined,
    gameId: string,
  ): Promise<RecoveryExport>;
  issueSeatRecovery(
    gameId: string,
    side: Side,
    operatorIdentity: string,
  ): Promise<RecoveryIssueResult>;
  issueHostRecovery(
    gameId: string,
    operatorIdentity: string,
  ): Promise<RecoveryIssueResult>;
  purgeDeletedGames(): Promise<readonly DeletionReceipt[]>;
  synchronizeDeletionLedger(
    receipts: readonly DeletionReceipt[],
  ): Promise<readonly DeletionReceipt[]>;
}

export class InMemoryAsyncGameService implements GameService {
  async claimPushDelivery(): Promise<PushDelivery | undefined> {
    return this.service.claimPushDelivery();
  }
  async finishPushDelivery(
    id: string,
    leaseToken: string,
    outcome: PushDeliveryOutcome,
  ): Promise<void> {
    this.service.finishPushDelivery(id, leaseToken, outcome);
  }
  constructor(readonly service = new InMemoryGameService()) {}
  async setPushSubscription(
    credential: string | undefined,
    gameId: string,
    input: unknown,
  ) {
    return this.service.setPushSubscription(credential, gameId, input);
  }
  async getPushSubscriptionStatus(
    credential: string | undefined,
    gameId: string,
  ) {
    return this.service.getPushSubscriptionStatus(credential, gameId);
  }
  async removePushSubscription(credential: string | undefined, gameId: string) {
    return this.service.removePushSubscription(credential, gameId);
  }
  async verifyRoomGame(gameId: string, signal: AbortSignal) {
    if (!signal.aborted) this.service.getGameState(gameId);
  }
  async deliverAuthorizedState(
    authorization: GameAuthorization | SpectatorAuthorization,
    deliver: (state: GameState) => void,
    signal: AbortSignal,
  ) {
    if (signal.aborted) return;
    deliver(
      "kind" in authorization
        ? this.service.getAuthorizedSpectatorState(authorization)
        : this.service.getAuthorizedState(authorization),
    );
  }
  async deliverAuthorizedSpectators(
    authorizations: readonly SpectatorAuthorization[],
    deliver: (permitted: readonly string[]) => void,
    signal: AbortSignal,
  ) {
    if (!signal.aborted)
      deliver(this.service.authorizeSpectatorDelivery(authorizations));
  }
  async authenticateSpectator(credential: string | undefined, gameId: string) {
    return this.service.authenticateSpectator(credential, gameId);
  }
  async getAuthorizedSpectatorState(authorization: SpectatorAuthorization) {
    return this.service.getAuthorizedSpectatorState(authorization);
  }
  async getSpectatorGrants(credential: string | undefined, gameId: string) {
    return this.service.getSpectatorGrants(credential, gameId);
  }
  async claimSpectatorInvitation(
    input: Parameters<InMemoryGameService["claimSpectatorInvitation"]>[0],
  ) {
    return this.service.claimSpectatorInvitation(input);
  }
  async getSpectatorView(credential: string | undefined, gameId: string) {
    return this.service.getSpectatorView(credential, gameId);
  }

  async authenticate(credential: string | undefined, gameId: string) {
    return this.service.authenticate(credential, gameId);
  }
  async authenticateHost(
    credential: string | undefined,
    gameId: string,
    options: { terminalCommandId?: string } = {},
  ) {
    return this.service.authenticateHost(credential, gameId, options);
  }
  async claimHostRecovery(
    input: Parameters<InMemoryGameService["claimHostRecovery"]>[0],
    options: { afterCommit?: (event: AuditEvent) => void } = {},
  ) {
    return this.service.claimHostRecovery(input, options);
  }
  async canRetryTerminalDelete(
    credential: string | undefined,
    gameId: string,
    commandId: string,
  ) {
    return this.service.canRetryTerminalDelete(credential, gameId, commandId);
  }
  async claimInvitation(
    input: Parameters<InMemoryGameService["claimInvitation"]>[0],
  ) {
    return this.service.claimInvitation(input);
  }
  async claimSeatRecovery(
    input: Parameters<InMemoryGameService["claimSeatRecovery"]>[0],
    options: { afterCommit?: (event: AuditEvent) => void } = {},
  ) {
    return this.service.claimSeatRecovery(input, options);
  }
  async createGame(
    side: Side,
    credential?: string,
    creationId?: string,
    creationCredential?: string,
  ) {
    return this.service.createGame(
      side,
      credential,
      creationId,
      creationCredential,
    );
  }
  async executeCommand(
    authorization: GameAuthorization,
    input: unknown,
    options: { afterCommit?: () => void } = {},
  ) {
    return this.service.executeCommand(authorization, input, options);
  }
  async executeHostCommand(
    authorization: HostAuthorization,
    input: unknown,
    options: HostManagementCommitOptions = {},
  ) {
    return this.service.executeHostCommand(authorization, input, options);
  }
  async getActions(gameId: string) {
    return this.service.getActions(gameId);
  }
  async getActiveInvitations(gameId: string) {
    return this.service.getActiveInvitations(gameId);
  }
  async getDeletionLedger() {
    return this.service.getDeletionLedger();
  }
  async getAuthorizedState(authorization: GameAuthorization) {
    return this.service.getAuthorizedState(authorization);
  }
  async getGameState(gameId: string) {
    return this.service.getGameState(gameId);
  }
  async getGameView(credential: string | undefined, gameId: string) {
    return this.service.getGameView(credential, gameId);
  }
  async getReplay(
    credential: string | undefined,
    gameId: string,
    sequence?: number,
  ) {
    return this.service.getReplay(credential, gameId, sequence);
  }
  async getRecoveryExport(credential: string | undefined, gameId: string) {
    return this.service.getRecoveryExport(credential, gameId);
  }
  async issueSeatRecovery(
    gameId: string,
    side: Side,
    operatorIdentity: string,
  ) {
    return this.service.issueSeatRecovery(gameId, side, operatorIdentity);
  }
  async issueHostRecovery(gameId: string, operatorIdentity: string) {
    return this.service.issueHostRecovery(gameId, operatorIdentity);
  }
  async purgeDeletedGames() {
    return this.service.purgeDeletedGames();
  }
  async synchronizeDeletionLedger(receipts: readonly DeletionReceipt[]) {
    return this.service.synchronizeDeletionLedger(receipts);
  }
}

export class PostgresGameService implements GameService {
  async claimPushDelivery(): Promise<PushDelivery | undefined> {
    return this.#mutate((service) => service.claimPushDelivery());
  }
  async finishPushDelivery(
    id: string,
    leaseToken: string,
    outcome: PushDeliveryOutcome,
  ): Promise<void> {
    return this.#mutate((service) =>
      service.finishPushDelivery(id, leaseToken, outcome),
    );
  }
  async setPushSubscription(
    credential: string | undefined,
    gameId: string,
    input: unknown,
  ) {
    return this.#mutate((service) =>
      service.setPushSubscription(credential, gameId, input),
    );
  }
  async getPushSubscriptionStatus(
    credential: string | undefined,
    gameId: string,
  ) {
    return this.#read((service) =>
      service.getPushSubscriptionStatus(credential, gameId),
    );
  }
  async removePushSubscription(credential: string | undefined, gameId: string) {
    return this.#mutate((service) =>
      service.removePushSubscription(credential, gameId),
    );
  }
  readonly #pool: Pool;
  readonly #deliveryPool: Pool;
  readonly #deliverySlots = new DeliverySlots();
  readonly #pepper: Uint8Array;
  async verifyRoomGame(gameId: string, signal: AbortSignal) {
    await this.#readForDelivery((service) => {
      service.getGameState(gameId);
    }, signal);
  }
  async deliverAuthorizedState(
    authorization: GameAuthorization | SpectatorAuthorization,
    deliver: (state: GameState) => void,
    signal: AbortSignal,
  ) {
    await this.#readForDelivery(
      (service) =>
        deliver(
          "kind" in authorization
            ? service.getAuthorizedSpectatorState(authorization)
            : service.getAuthorizedState(authorization),
        ),
      signal,
    );
  }
  async deliverAuthorizedSpectators(
    authorizations: readonly SpectatorAuthorization[],
    deliver: (permitted: readonly string[]) => void,
    signal: AbortSignal,
  ) {
    await this.#readForDelivery(
      (service) => deliver(service.authorizeSpectatorDelivery(authorizations)),
      signal,
    );
  }
  async authenticateSpectator(credential: string | undefined, gameId: string) {
    return this.#read((service) =>
      service.authenticateSpectator(credential, gameId),
    );
  }
  async getAuthorizedSpectatorState(authorization: SpectatorAuthorization) {
    return this.#read((service) =>
      service.getAuthorizedSpectatorState(authorization),
    );
  }
  async getSpectatorGrants(credential: string | undefined, gameId: string) {
    return this.#read((service) =>
      service.getSpectatorGrants(credential, gameId),
    );
  }
  async claimSpectatorInvitation(
    input: Parameters<InMemoryGameService["claimSpectatorInvitation"]>[0],
  ) {
    return this.#mutate((service) => service.claimSpectatorInvitation(input));
  }
  async getSpectatorView(credential: string | undefined, gameId: string) {
    return this.#read((service) =>
      service.getSpectatorView(credential, gameId),
    );
  }

  constructor(options: { connectionString: string; pepper: Uint8Array }) {
    this.#pool = new Pool({
      connectionString: options.connectionString,
      max: 10,
    });
    // Bound queued room reads without timing out ordinary gameplay checkouts.
    this.#deliveryPool = new Pool({
      connectionString: options.connectionString,
      max: 2,
      connectionTimeoutMillis: 2_000,
    });
    this.#pepper = options.pepper;
  }

  async migrate(): Promise<void> {
    const filenames = (await readdir(migrationsDirectory))
      .filter((name) => /^\d+.*\.sql$/.test(name))
      .sort();
    const client = await this.#pool.connect();
    let lockAcquired = false;
    let operationError: unknown;
    try {
      await client.query(
        "SELECT pg_advisory_lock(hashtext('gettysburg-schema-migrations'))",
      );
      lockAcquired = true;
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
      await client.query("BEGIN");
      try {
        const storedState = await client.query<{
          snapshot: GameServiceSnapshot;
        }>(
          "SELECT snapshot FROM service_state WHERE singleton = true FOR UPDATE",
        );
        const snapshot = storedState.rows[0]?.snapshot;
        if (snapshot !== undefined) {
          const service = new InMemoryGameService({
            pepper: this.#pepper,
            snapshot,
          });
          const snapshotLedger = service.getDeletionLedger();
          service.synchronizeDeletionLedger(snapshotLedger);
          for (const receipt of snapshotLedger) {
            await client.query(
              `INSERT INTO deletion_ledger
                (position, game_id, deleted_at, purged_at, actor)
               VALUES ($1, $2::uuid, $3, $4, $5)
               ON CONFLICT (position) DO NOTHING`,
              [
                receipt.position,
                receipt.gameId,
                new Date(receipt.deletedAt),
                receipt.purgedAt === null ? null : new Date(receipt.purgedAt),
                receipt.actor,
              ],
            );
          }
          const storedLedger = await client.query<{
            actor: string;
            deleted_at: string;
            game_id: string;
            position: string;
            purged_at: string | null;
          }>(
            `SELECT actor,
                    (extract(epoch FROM deleted_at) * 1000)::bigint::text AS deleted_at,
                    game_id::text AS game_id,
                    position::text,
                    CASE WHEN purged_at IS NULL THEN NULL
                      ELSE (extract(epoch FROM purged_at) * 1000)::bigint::text
                    END AS purged_at
             FROM deletion_ledger
             ORDER BY deletion_ledger.position`,
          );
          const receipts = storedLedger.rows.map((row) => ({
            actor: row.actor,
            deletedAt: Number(row.deleted_at),
            gameId: row.game_id,
            position: Number(row.position),
            purgedAt: row.purged_at === null ? null : Number(row.purged_at),
          }));
          const applied = service.synchronizeDeletionLedger(receipts);
          if (applied.length > 0) {
            await client.query(
              "UPDATE service_state SET snapshot = $1::jsonb, updated_at = now() WHERE singleton = true",
              [JSON.stringify(service.exportSnapshot())],
            );
          }
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    } catch (error) {
      operationError = error;
    }
    let unlockError: unknown;
    if (lockAcquired) {
      try {
        await client.query(
          "SELECT pg_advisory_unlock(hashtext('gettysburg-schema-migrations'))",
        );
      } catch (error) {
        unlockError = error;
      }
    }
    client.release(unlockError instanceof Error ? unlockError : undefined);
    if (operationError !== undefined) throw operationError;
    if (unlockError !== undefined) throw unlockError;
  }

  async close(): Promise<void> {
    await Promise.all([this.#pool.end(), this.#deliveryPool.end()]);
  }

  async canRetryTerminalDelete(
    credential: string | undefined,
    gameId: string,
    commandId: string,
  ): Promise<boolean> {
    return await this.#read((service) =>
      service.canRetryTerminalDelete(credential, gameId, commandId),
    );
  }

  async isReady(): Promise<boolean> {
    try {
      const result = await this.#pool.query<{
        count: string;
        snapshot: GameServiceSnapshot;
      }>(
        `SELECT
           (SELECT count(*)::text FROM schema_migrations WHERE version IN (1, 2, 3)) AS count,
           snapshot
         FROM service_state WHERE singleton = true`,
      );
      const row = result.rows[0];
      return (
        row?.count === "3" &&
        new InMemoryGameService({
          pepper: this.#pepper,
          snapshot: row.snapshot,
        }).isVersionRegistryReady()
      );
    } catch {
      return false;
    }
  }

  async authenticate(credential: string | undefined, gameId: string) {
    return this.#read((service) => service.authenticate(credential, gameId));
  }
  async authenticateHost(
    credential: string | undefined,
    gameId: string,
    options: { terminalCommandId?: string } = {},
  ) {
    return this.#read((service) =>
      service.authenticateHost(credential, gameId, options),
    );
  }

  async claimHostRecovery(
    input: Parameters<InMemoryGameService["claimHostRecovery"]>[0],
    options: { afterCommit?: (event: AuditEvent) => void } = {},
  ) {
    const execution = await this.#mutate((service) => {
      let committedEvent: AuditEvent | undefined;
      const result = service.claimHostRecovery(input, {
        afterCommit: (event) => {
          committedEvent = event;
        },
      });
      return { committedEvent, result };
    });
    if (execution.committedEvent !== undefined) {
      options.afterCommit?.(execution.committedEvent);
    }
    return execution.result;
  }

  async claimInvitation(
    input: Parameters<InMemoryGameService["claimInvitation"]>[0],
  ) {
    return this.#mutate((service) => service.claimInvitation(input));
  }

  async claimSeatRecovery(
    input: Parameters<InMemoryGameService["claimSeatRecovery"]>[0],
    options: { afterCommit?: (event: AuditEvent) => void } = {},
  ) {
    const execution = await this.#mutate((service) => {
      let committedEvent: AuditEvent | undefined;
      const result = service.claimSeatRecovery(input, {
        afterCommit: (event) => {
          committedEvent = event;
        },
      });
      return { committedEvent, result };
    });
    if (execution.committedEvent !== undefined) {
      options.afterCommit?.(execution.committedEvent);
    }
    return execution.result;
  }

  async createGame(
    side: Side,
    existingCredential?: string,
    creationId?: string,
    creationCredential?: string,
  ) {
    return this.#mutate((service) =>
      service.createGame(
        side,
        existingCredential,
        creationId,
        creationCredential,
      ),
    );
  }

  async executeCommand(
    authorization: GameAuthorization,
    input: unknown,
    options: { afterCommit?: () => void } = {},
  ) {
    const execution = await this.#mutate((service) => {
      let committed = false;
      const result = service.executeCommand(authorization, input, {
        afterCommit: () => {
          committed = true;
        },
      });
      return { committed, result };
    });
    if (execution.committed) options.afterCommit?.();
    return execution.result;
  }

  async executeHostCommand(
    authorization: HostAuthorization,
    input: unknown,
    options: HostManagementCommitOptions = {},
  ) {
    const execution = await this.#mutate((service) => {
      let committedEvent: ManagementEvent | undefined;
      let revokedSpectatorBindingId: string | undefined;
      const result = service.executeHostCommand(authorization, input, {
        afterCommit: (event, bindingId) => {
          committedEvent = event;
          revokedSpectatorBindingId = bindingId;
        },
      });
      return { committedEvent, result, revokedSpectatorBindingId };
    });
    if (execution.committedEvent !== undefined) {
      options.afterCommit?.(
        execution.committedEvent,
        execution.revokedSpectatorBindingId,
      );
    }
    return execution.result;
  }

  async getActions(gameId: string) {
    return this.#read((service) => service.getActions(gameId));
  }
  async getActiveInvitations(gameId: string) {
    return this.#read((service) => service.getActiveInvitations(gameId));
  }

  async getDeletionLedger() {
    return this.#read((service) => service.getDeletionLedger());
  }

  async getAuthorizedState(authorization: GameAuthorization) {
    return this.#read((service) => service.getAuthorizedState(authorization));
  }

  async getGameState(gameId: string) {
    return this.#read((service) => service.getGameState(gameId));
  }
  async getGameView(credential: string | undefined, gameId: string) {
    return this.#read((service) => service.getGameView(credential, gameId));
  }
  async getReplay(
    credential: string | undefined,
    gameId: string,
    sequence?: number,
  ) {
    return this.#read((service) =>
      service.getReplay(credential, gameId, sequence),
    );
  }
  async getRecoveryExport(credential: string | undefined, gameId: string) {
    return this.#read((service) =>
      service.getRecoveryExport(credential, gameId),
    );
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

  async issueHostRecovery(gameId: string, operatorIdentity: string) {
    return this.#mutate((service) =>
      service.issueHostRecovery(gameId, operatorIdentity),
    );
  }

  async purgeDeletedGames() {
    return this.#mutate((service) => service.purgeDeletedGames());
  }

  async synchronizeDeletionLedger(receipts: readonly DeletionReceipt[]) {
    return this.#mutate((service) =>
      service.synchronizeDeletionLedger(receipts),
    );
  }

  async #readForDelivery(
    operation: (service: InMemoryGameService) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const release = await this.#deliverySlots.acquire(signal);
    try {
      await this.#readInDeliverySlot(operation, signal);
    } finally {
      release();
    }
  }

  async #readInDeliverySlot(
    operation: (service: InMemoryGameService) => void,
    signal: AbortSignal,
  ): Promise<void> {
    if (signal.aborted) throw new Error("Room delivery was cancelled.");
    const client = await this.#deliveryPool.connect();
    // A connection establishment can outlive cancellation (bounded by the
    // pool's connect timeout). No query ran, so return it healthy, not destroyed.
    if (signal.aborted) {
      client.release();
      throw new Error("Room delivery was cancelled.");
    }
    let released = false;
    const discard = () => {
      if (!released) {
        released = true;
        client.release(true);
      }
    };
    signal.addEventListener("abort", discard, { once: true });
    try {
      if (signal.aborted) throw new Error("Room delivery was cancelled.");
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout = '2000ms'");
      const result = await client.query<{ snapshot: GameServiceSnapshot }>(
        "SELECT snapshot FROM service_state WHERE singleton = true FOR SHARE",
      );
      const snapshot = result.rows[0]?.snapshot;
      if (snapshot === undefined || signal.aborted)
        throw new Error("Room delivery snapshot is unavailable.");
      // The synchronous send occurs while this lock prevents a revocation from
      // committing. Returning authorization and sending later would race again.
      operation(new InMemoryGameService({ pepper: this.#pepper, snapshot }));
      await client.query("COMMIT");
    } catch (error) {
      discard(); // Closing the connection also rolls back any held read lock.
      throw error;
    } finally {
      signal.removeEventListener("abort", discard);
      if (!released) {
        released = true;
        client.release();
      }
    }
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
    let released = false;
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
      await this.#mirrorSnapshot(client, nextSnapshot, snapshot);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        client.release(
          rollbackError instanceof Error
            ? rollbackError
            : new Error("PostgreSQL rollback failed"),
        );
        released = true;
      }
      throw error;
    } finally {
      if (!released) client.release();
    }
  }

  async #mirrorSnapshot(
    client: PoolClient,
    snapshot: GameServiceSnapshot,
    previous?: GameServiceSnapshot,
  ) {
    const previousGames = new Map(previous?.games ?? []);
    const deletedGameIds = new Set(
      snapshot.games.flatMap(([gameId, game]) =>
        game.deletedAt === null || game.deletedAt === undefined ? [] : [gameId],
      ),
    );
    const changed = (current: unknown, prior: unknown) =>
      JSON.stringify(current) !== JSON.stringify(prior);
    const newReceipts = (snapshot.deletionLedger ?? []).slice(
      previous?.deletionLedger?.length ?? 0,
    );
    for (const receipt of newReceipts) {
      await client.query(
        `INSERT INTO deletion_ledger
          (position, game_id, deleted_at, purged_at, actor)
         VALUES ($1, $2::uuid, $3, $4, $5)
         ON CONFLICT (position) DO NOTHING`,
        [
          receipt.position,
          receipt.gameId,
          new Date(receipt.deletedAt),
          receipt.purgedAt === null ? null : new Date(receipt.purgedAt),
          receipt.actor,
        ],
      );
      if (receipt.purgedAt === null) continue;
      await client.query("DELETE FROM actions WHERE game_id = $1::uuid", [
        receipt.gameId,
      ]);
      await client.query("DELETE FROM snapshots WHERE game_id = $1::uuid", [
        receipt.gameId,
      ]);
      await client.query(
        "DELETE FROM recovery_grants WHERE game_id = $1::uuid",
        [receipt.gameId],
      );
      await client.query("DELETE FROM invitations WHERE game_id = $1::uuid", [
        receipt.gameId,
      ]);
      await client.query("DELETE FROM seat_bindings WHERE game_id = $1::uuid", [
        receipt.gameId,
      ]);
      await client.query("DELETE FROM host_bindings WHERE game_id = $1::uuid", [
        receipt.gameId,
      ]);
      await client.query("DELETE FROM games WHERE id = $1::uuid", [
        receipt.gameId,
      ]);
    }
    for (const [gameId, game] of snapshot.games) {
      if (!changed(game, previousGames.get(gameId))) continue;
      if (game.deletedAt === null || game.deletedAt === undefined) continue;
      await client.query(
        "DELETE FROM recovery_grants WHERE game_id = $1::uuid",
        [gameId],
      );
      await client.query("DELETE FROM invitations WHERE game_id = $1::uuid", [
        gameId,
      ]);
      await client.query("DELETE FROM seat_bindings WHERE game_id = $1::uuid", [
        gameId,
      ]);
      await client.query("DELETE FROM host_bindings WHERE game_id = $1::uuid", [
        gameId,
      ]);
    }
    const spectatorSessionIds = new Set(
      (snapshot.spectatorBindings ?? []).map((binding) => binding.sessionId),
    );
    await client.query(
      `DELETE FROM browser_sessions AS session
       WHERE NOT EXISTS (
         SELECT 1 FROM host_bindings WHERE browser_session_id = session.id
       ) AND NOT EXISTS (
         SELECT 1 FROM seat_bindings WHERE browser_session_id = session.id
       ) AND NOT (session.id = ANY($1::uuid[]))`,
      [[...spectatorSessionIds]],
    );

    for (const [gameId, game] of snapshot.games) {
      const previousGame = previousGames.get(gameId);
      if (!changed(game, previousGame)) continue;
      const state = game.state;
      await client.query(
        `INSERT INTO games
          (id, status, turn, phase, active_side, state_version, event_sequence,
           ruleset_version, content_revision, state, deleted_at)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status, turn = EXCLUDED.turn, phase = EXCLUDED.phase,
           active_side = EXCLUDED.active_side, state_version = EXCLUDED.state_version,
           event_sequence = EXCLUDED.event_sequence,
           ruleset_version = EXCLUDED.ruleset_version,
           content_revision = EXCLUDED.content_revision, state = EXCLUDED.state,
           deleted_at = EXCLUDED.deleted_at,
           updated_at = now()`,
        [
          gameId,
          game.deletedAt !== null
            ? "deleted"
            : state.phase === "completed"
              ? "completed"
              : "active",
          state.turn,
          state.phase,
          state.active_side,
          state.version,
          state.event_sequence,
          state.ruleset_version,
          state.content_revision,
          JSON.stringify(state),
          game.deletedAt == null ? null : new Date(game.deletedAt),
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
      for (const action of game.actions.slice(
        previousGame?.actions.length ?? 0,
      ))
        await this.#insertAction(client, gameId, action);
    }

    const previousSessions = new Map(
      (previous?.sessions ?? []).map((session) => [session.id, session]),
    );
    for (const session of snapshot.sessions) {
      // Also repair missing observer-only mirror rows from older cleanup logic.
      if (
        !spectatorSessionIds.has(session.id) &&
        !changed(session, previousSessions.get(session.id))
      )
        continue;
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
    const previousHostBindings = new Map(
      (previous?.hostBindings ?? []).map((binding) => [binding.id, binding]),
    );
    for (const binding of snapshot.hostBindings) {
      if (deletedGameIds.has(binding.gameId)) continue;
      if (!changed(binding, previousHostBindings.get(binding.id))) continue;
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
    const previousSeatBindings = new Map(
      (previous?.seatBindings ?? []).map((binding) => [binding.id, binding]),
    );
    for (const binding of snapshot.seatBindings) {
      if (deletedGameIds.has(binding.gameId)) continue;
      if (!changed(binding, previousSeatBindings.get(binding.id))) continue;
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
    const previousInvitations = new Map(previous?.invitations ?? []);
    for (const [, invitation] of snapshot.invitations) {
      if (deletedGameIds.has(invitation.gameId)) continue;
      if (!changed(invitation, previousInvitations.get(invitation.lookupId)))
        continue;
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
    const previousGrants = new Map(previous?.recoveryGrants ?? []);
    for (const [, grant] of snapshot.recoveryGrants) {
      if (deletedGameIds.has(grant.gameId)) continue;
      if (!changed(grant, previousGrants.get(grant.lookupId))) continue;
      await client.query(
        `INSERT INTO recovery_grants
          (lookup_id, game_id, target_binding_type, side, target_binding_id,
           target_binding_version, token_hash, operator_identity, expires_at,
           consumed_at, revoked_at)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (lookup_id) DO UPDATE SET
           consumed_at = EXCLUDED.consumed_at, revoked_at = EXCLUDED.revoked_at`,
        [
          grant.lookupId,
          grant.gameId,
          grant.targetBindingType,
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
