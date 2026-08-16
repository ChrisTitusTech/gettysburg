import { randomBytes, randomUUID } from "node:crypto";

import { COMMAND_SCHEMA_VERSION } from "@gettysburg/game";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PostgresGameService } from "./postgres-store.js";

const connectionString = process.env.GETTYSBURG_POSTGRES_TEST_URL;
const postgres = connectionString === undefined ? describe.skip : describe;

postgres("PostgreSQL durability", () => {
  const pepper = randomBytes(32);
  let administration: Pool;

  beforeAll(async () => {
    const target = new URL(connectionString!);
    const allowedHosts = new Set(["127.0.0.1", "::1", "localhost"]);
    if (
      target.pathname !== "/gettysburg_test" ||
      !allowedHosts.has(target.hostname)
    ) {
      throw new Error(
        "PostgreSQL integration tests require a local gettysburg_test database",
      );
    }
    administration = new Pool({ connectionString });
    await administration.query("DROP SCHEMA public CASCADE");
    await administration.query("CREATE SCHEMA public");
  });

  afterAll(async () => {
    await administration.end();
  });

  it("runs migrations idempotently and reconstructs credentials, state, and actions", async () => {
    const first = new PostgresGameService({
      connectionString: connectionString!,
      pepper,
    });
    await first.migrate();
    await first.migrate();
    const creationId = randomUUID();
    const creationCredential = "A".repeat(43);
    const created = await first.createGame(
      "union",
      undefined,
      creationId,
      creationCredential,
    );
    const authorization = await first.authenticate(
      created.credential,
      created.gameId,
    );
    const accepted = await first.executeCommand(authorization, {
      command_id: "22222222-2222-4222-8222-222222222222",
      command_name: "endPhase",
      expected_version: 0,
      game_id: created.gameId,
      payload: {},
      schema: COMMAND_SCHEMA_VERSION,
    });
    expect(accepted).toMatchObject({
      ok: true,
      state: {
        active_side: "confederate",
        phase: "movement",
        turn: 2,
        version: 1,
      },
    });
    await first.close();

    const restarted = new PostgresGameService({
      connectionString: connectionString!,
      pepper,
    });
    await restarted.migrate();
    expect(
      await restarted.createGame(
        "union",
        undefined,
        creationId,
        creationCredential,
      ),
    ).toMatchObject({
      credential: created.credential,
      gameId: created.gameId,
      invitation: created.invitation,
      seat: created.seat,
      sessionId: created.sessionId,
      state: { version: 1 },
    });
    const resumedAuthorization = await restarted.authenticate(
      created.credential,
      created.gameId,
    );
    expect(
      await restarted.getAuthorizedState(resumedAuthorization),
    ).toMatchObject({
      active_side: "confederate",
      event_sequence: 1,
      phase: "movement",
      turn: 2,
      version: 1,
    });
    expect(await restarted.getActions(created.gameId)).toHaveLength(1);

    const rows = await administration.query<{
      action_count: string;
      content_revision: string;
      ruleset_version: string;
      snapshot_count: string;
    }>(
      `SELECT
         (SELECT count(*) FROM actions WHERE game_id = $1)::text AS action_count,
         (SELECT count(*) FROM snapshots WHERE game_id = $1)::text AS snapshot_count,
         ruleset_version,
         content_revision
       FROM games WHERE id = $1`,
      [created.gameId],
    );
    expect(rows.rows[0]).toMatchObject({
      action_count: "1",
      content_revision: "gettysburg-source-cards-v1",
      ruleset_version: "phase-2-tabletop-v2",
      snapshot_count: "2",
    });
    await restarted.close();
  });

  it("rolls state, action, and snapshot back together on a persistence failure", async () => {
    const service = new PostgresGameService({
      connectionString: connectionString!,
      pepper,
    });
    await service.migrate();
    const created = await service.createGame("union");
    const authorization = await service.authenticate(
      created.credential,
      created.gameId,
    );
    await administration.query(`
      CREATE OR REPLACE FUNCTION gettysburg_reject_action() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected action failure'; END $$;
      CREATE TRIGGER reject_gettysburg_action BEFORE INSERT ON actions
      FOR EACH ROW EXECUTE FUNCTION gettysburg_reject_action();
    `);
    try {
      await expect(
        service.executeCommand(authorization, {
          command_id: "33333333-3333-4333-8333-333333333333",
          command_name: "endPhase",
          expected_version: 0,
          game_id: created.gameId,
          payload: {},
          schema: COMMAND_SCHEMA_VERSION,
        }),
      ).rejects.toThrow("injected action failure");
    } finally {
      await administration.query(
        "DROP TRIGGER IF EXISTS reject_gettysburg_action ON actions",
      );
      await administration.query(
        "DROP FUNCTION IF EXISTS gettysburg_reject_action()",
      );
    }

    expect(await service.getGameState(created.gameId)).toMatchObject({
      event_sequence: 0,
      phase: "movement",
      version: 0,
    });
    expect(await service.getActions(created.gameId)).toHaveLength(0);
    const persisted = await administration.query<{
      action_count: string;
      snapshot_count: string;
      state_version: string;
    }>(
      `SELECT state_version::text,
        (SELECT count(*) FROM actions WHERE game_id = $1)::text AS action_count,
        (SELECT count(*) FROM snapshots WHERE game_id = $1)::text AS snapshot_count
       FROM games WHERE id = $1`,
      [created.gameId],
    );
    expect(persisted.rows[0]).toEqual({
      action_count: "0",
      snapshot_count: "1",
      state_version: "0",
    });
    await service.close();
  });

  it("persists host invitation retry and seat surrender across restart", async () => {
    const first = new PostgresGameService({
      connectionString: connectionString!,
      pepper,
    });
    await first.migrate();
    const created = await first.createGame("union");
    const hostAuthorization = await first.authenticateHost(
      created.credential,
      created.gameId,
    );
    const issueCommand = {
      command_id: "44444444-4444-4444-8444-444444444444",
      command_name: "issueInvitation",
      expected_version: 0,
      game_id: created.gameId,
      payload: { seat: "confederate" },
      schema: COMMAND_SCHEMA_VERSION,
    };
    const issued = await first.executeHostCommand(
      hostAuthorization,
      issueCommand,
    );
    expect(issued).toMatchObject({
      invitation: { secret: expect.any(String) },
      ok: true,
    });
    await first.close();

    const restarted = new PostgresGameService({
      connectionString: connectionString!,
      pepper,
    });
    await restarted.migrate();
    const resumedHost = await restarted.authenticateHost(
      created.credential,
      created.gameId,
    );
    const retried = await restarted.executeHostCommand(
      resumedHost,
      issueCommand,
    );
    expect(retried).toEqual(issued);
    if (!retried.ok || retried.invitation === undefined)
      throw new Error("Persisted invitation secret was not recoverable");
    const guest = await restarted.claimInvitation({
      lookupId: retried.invitation.lookup_id,
      secret: retried.invitation.secret,
    });
    const guestAuthorization = await restarted.authenticate(
      guest.credential,
      created.gameId,
    );
    expect(
      await restarted.executeCommand(guestAuthorization, {
        command_id: "55555555-5555-4555-8555-555555555555",
        command_name: "surrenderSeat",
        expected_version: 0,
        game_id: created.gameId,
        payload: {},
        schema: COMMAND_SCHEMA_VERSION,
      }),
    ).toMatchObject({ ok: true, state: { version: 1 } });
    await restarted.close();

    const resumedAgain = new PostgresGameService({
      connectionString: connectionString!,
      pepper,
    });
    await resumedAgain.migrate();
    await expect(
      resumedAgain.authenticate(guest.credential, created.gameId),
    ).rejects.toMatchObject({ code: "unauthorized" });
    expect(await resumedAgain.getActions(created.gameId)).toMatchObject([
      { kind: "host_management", sequence: 1 },
      { kind: "gameplay", sequence: 2 },
    ]);
    await resumedAgain.close();
  });

  it("persists soft deletion and terminal host retry across restart", async () => {
    const first = new PostgresGameService({
      connectionString: connectionString!,
      pepper,
    });
    await first.migrate();
    const created = await first.createGame("union");
    const authorization = await first.authenticateHost(
      created.credential,
      created.gameId,
    );
    const command = {
      command_id: "66666666-6666-4666-8666-666666666666",
      command_name: "deleteGame",
      expected_version: 0,
      game_id: created.gameId,
      payload: { confirm: true },
      schema: COMMAND_SCHEMA_VERSION,
    };
    const publishedEvents: number[] = [];
    const deleted = await first.executeHostCommand(authorization, command, {
      afterCommit: (event) => publishedEvents.push(event.event_sequence),
    });
    await first.close();

    const restarted = new PostgresGameService({
      connectionString: connectionString!,
      pepper,
    });
    await restarted.migrate();
    await expect(restarted.getGameState(created.gameId)).rejects.toMatchObject({
      code: "game_deleted",
    });
    const retryAuthorization = await restarted.authenticateHost(
      created.credential,
      created.gameId,
      { terminalCommandId: command.command_id },
    );
    expect(
      await restarted.executeHostCommand(retryAuthorization, command, {
        afterCommit: (event) => publishedEvents.push(event.event_sequence),
      }),
    ).toEqual(deleted);
    expect(publishedEvents).toEqual([1]);
    const persisted = await administration.query<{
      deleted_at: Date | null;
      status: string;
    }>("SELECT status, deleted_at FROM games WHERE id = $1", [created.gameId]);
    expect(persisted.rows[0]).toMatchObject({
      deleted_at: expect.any(Date),
      status: "deleted",
    });
    const credentials = await administration.query<{
      bindings: string;
      sessions: string;
    }>(
      `SELECT
         ((SELECT count(*) FROM host_bindings WHERE game_id = $1) +
          (SELECT count(*) FROM seat_bindings WHERE game_id = $1))::text AS bindings,
         (SELECT count(*) FROM browser_sessions WHERE id = $2::uuid)::text AS sessions`,
      [created.gameId, created.sessionId],
    );
    expect(credentials.rows[0]).toEqual({ bindings: "0", sessions: "0" });
    await restarted.close();
  });

  it("hard-purges expired game rows and preserves an append-only receipt", async () => {
    const first = new PostgresGameService({
      connectionString: connectionString!,
      pepper,
    });
    await first.migrate();
    const deletedGame = await first.createGame("union");
    const retainedGame = await first.createGame(
      "confederate",
      deletedGame.credential,
    );
    const authorization = await first.authenticateHost(
      deletedGame.credential,
      deletedGame.gameId,
    );
    await first.executeHostCommand(authorization, {
      command_id: "77777777-7777-4777-8777-777777777777",
      command_name: "deleteGame",
      expected_version: 0,
      game_id: deletedGame.gameId,
      payload: { confirm: true },
      schema: COMMAND_SCHEMA_VERSION,
    });
    await first.close();

    const stored = await administration.query<{
      snapshot: {
        deletionLedger: {
          deletedAt: number;
          gameId: string;
          position: number;
        }[];
        games: [string, { deletedAt: number | null }][];
      };
    }>("SELECT snapshot FROM service_state WHERE singleton = true");
    const expired = structuredClone(stored.rows[0]!.snapshot);
    const record = expired.games.find(
      ([gameId]) => gameId === deletedGame.gameId,
    );
    if (record === undefined) throw new Error("Deleted game was not persisted");
    record[1].deletedAt = Date.now() - 31 * 24 * 60 * 60 * 1_000;
    const deletionReceipt = expired.deletionLedger.find(
      (receipt) => receipt.gameId === deletedGame.gameId,
    );
    if (deletionReceipt === undefined)
      throw new Error("Deletion receipt was not persisted");
    deletionReceipt.deletedAt = record[1].deletedAt;
    const expectedPurgePosition = expired.deletionLedger.at(-1)!.position + 1;
    await administration.query(
      "UPDATE service_state SET snapshot = $1::jsonb WHERE singleton = true",
      [JSON.stringify(expired)],
    );
    await administration.query(
      "UPDATE deletion_ledger SET deleted_at = $1 WHERE game_id = $2::uuid AND purged_at IS NULL",
      [new Date(record[1].deletedAt), deletedGame.gameId],
    );

    const purger = new PostgresGameService({
      connectionString: connectionString!,
      pepper,
    });
    expect(await purger.purgeDeletedGames()).toMatchObject([
      {
        actor: authorization.bindingId,
        gameId: deletedGame.gameId,
        position: expectedPurgePosition,
      },
    ]);
    await expect(purger.getActions(deletedGame.gameId)).rejects.toMatchObject({
      code: "game_purged",
    });
    await expect(
      purger.authenticateHost(deletedGame.credential, retainedGame.gameId),
    ).resolves.toMatchObject({ gameId: retainedGame.gameId });
    expect(await purger.getDeletionLedger()).toHaveLength(
      expectedPurgePosition,
    );
    await purger.close();

    const persisted = await administration.query<{
      game_count: string;
      ledger_count: string;
      related_count: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM games WHERE id = $1) AS game_count,
         (SELECT count(*)::text FROM deletion_ledger WHERE game_id = $1) AS ledger_count,
         ((SELECT count(*) FROM actions WHERE game_id = $1) +
          (SELECT count(*) FROM snapshots WHERE game_id = $1) +
          (SELECT count(*) FROM host_bindings WHERE game_id = $1) +
          (SELECT count(*) FROM seat_bindings WHERE game_id = $1) +
          (SELECT count(*) FROM invitations WHERE game_id = $1) +
          (SELECT count(*) FROM recovery_grants WHERE game_id = $1))::text AS related_count`,
      [deletedGame.gameId],
    );
    expect(persisted.rows[0]).toEqual({
      game_count: "0",
      ledger_count: "2",
      related_count: "0",
    });
  });

  it("fails PostgreSQL readiness for an unavailable saved version pair", async () => {
    const service = new PostgresGameService({
      connectionString: connectionString!,
      pepper,
    });
    await service.migrate();
    const created = await service.createGame("union");
    await service.close();

    const stored = await administration.query<{
      snapshot: Record<string, unknown>;
    }>("SELECT snapshot FROM service_state WHERE singleton = true");
    const original = structuredClone(stored.rows[0]!.snapshot) as {
      games: [string, { state: { ruleset_version: string } }][];
    };
    const unavailable = structuredClone(original);
    const record = unavailable.games.find(
      ([gameId]) => gameId === created.gameId,
    );
    if (record === undefined) throw new Error("Created game was not persisted");
    record[1].state.ruleset_version = "missing-v99";
    await administration.query(
      "UPDATE service_state SET snapshot = $1::jsonb WHERE singleton = true",
      [JSON.stringify(unavailable)],
    );

    const unavailableService = new PostgresGameService({
      connectionString: connectionString!,
      pepper,
    });
    expect(await unavailableService.isReady()).toBe(false);
    await unavailableService.close();
    await administration.query(
      "UPDATE service_state SET snapshot = $1::jsonb WHERE singleton = true",
      [JSON.stringify(original)],
    );
  });

  it("backfills the deletion ledger for a legacy soft-deleted game", async () => {
    const service = new PostgresGameService({
      connectionString: connectionString!,
      pepper,
    });
    await service.migrate();
    const created = await service.createGame("union");
    const authorization = await service.authenticateHost(
      created.credential,
      created.gameId,
    );
    await service.executeHostCommand(authorization, {
      command_id: "77777777-7777-4777-8777-777777777777",
      command_name: "deleteGame",
      expected_version: 0,
      game_id: created.gameId,
      payload: { confirm: true },
      schema: COMMAND_SCHEMA_VERSION,
    });
    const ledger = await service.getDeletionLedger();
    const deletedReceipt = ledger.at(-1);
    if (deletedReceipt === undefined)
      throw new Error("Deletion receipt was not persisted");
    await service.close();

    const stored = await administration.query<{
      snapshot: { deletionLedger: unknown[] };
    }>("SELECT snapshot FROM service_state WHERE singleton = true");
    const legacySnapshot = structuredClone(stored.rows[0]!.snapshot);
    legacySnapshot.deletionLedger.pop();
    await administration.query(
      `UPDATE service_state
       SET snapshot = $1::jsonb
       WHERE singleton = true`,
      [JSON.stringify(legacySnapshot)],
    );
    await administration.query(
      "DELETE FROM deletion_ledger WHERE game_id = $1::uuid",
      [created.gameId],
    );

    const upgraded = new PostgresGameService({
      connectionString: connectionString!,
      pepper,
    });
    await upgraded.migrate();
    await expect(upgraded.getDeletionLedger()).resolves.toEqual(ledger);
    await expect(upgraded.getGameState(created.gameId)).rejects.toMatchObject({
      code: "game_deleted",
    });
    await upgraded.close();

    const normalized = await administration.query<{
      actor: string;
      purged_at: Date | null;
    }>(
      "SELECT actor, purged_at FROM deletion_ledger WHERE game_id = $1::uuid",
      [created.gameId],
    );
    expect(normalized.rows).toEqual([
      { actor: deletedReceipt.actor, purged_at: null },
    ]);
  });

  it("restores normalized ledger rows when the service snapshot is ahead", async () => {
    const service = new PostgresGameService({
      connectionString: connectionString!,
      pepper,
    });
    await service.migrate();
    const created = await service.createGame("confederate");
    const authorization = await service.authenticateHost(
      created.credential,
      created.gameId,
    );
    await service.executeHostCommand(authorization, {
      command_id: "66666666-6666-4666-8666-666666666666",
      command_name: "deleteGame",
      expected_version: 0,
      game_id: created.gameId,
      payload: { confirm: true },
      schema: COMMAND_SCHEMA_VERSION,
    });
    const expectedLedger = await service.getDeletionLedger();
    await service.close();
    await administration.query(
      "DELETE FROM deletion_ledger WHERE game_id = $1::uuid",
      [created.gameId],
    );

    const reconciled = new PostgresGameService({
      connectionString: connectionString!,
      pepper,
    });
    await reconciled.migrate();
    await expect(reconciled.getDeletionLedger()).resolves.toEqual(
      expectedLedger,
    );
    await reconciled.close();
    const normalized = await administration.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM deletion_ledger WHERE game_id = $1::uuid",
      [created.gameId],
    );
    expect(normalized.rows[0]?.count).toBe("1");
  });

  it("reconstructs more than nine receipts in numeric ledger order", async () => {
    const service = new PostgresGameService({
      connectionString: connectionString!,
      pepper,
    });
    await service.migrate();
    const existingLedger = await service.getDeletionLedger();
    const additions = Array.from({ length: 11 }, (_, index) => ({
      actor: "off-host-recovery:ordering-test",
      deletedAt: Date.UTC(2026, 7, 15) + index,
      gameId: randomUUID(),
      position: existingLedger.length + index + 1,
      purgedAt: null,
    }));
    await service.synchronizeDeletionLedger([...existingLedger, ...additions]);
    await service.close();

    await administration.query(
      `UPDATE service_state
       SET snapshot = jsonb_set(snapshot, '{deletionLedger}', '[]'::jsonb)
       WHERE singleton = true`,
    );
    const reconstructed = new PostgresGameService({
      connectionString: connectionString!,
      pepper,
    });
    await reconstructed.migrate();
    await expect(reconstructed.getDeletionLedger()).resolves.toEqual([
      ...existingLedger,
      ...additions,
    ]);
    await reconstructed.close();
  });

  it("persists an externally synchronized deletion receipt atomically", async () => {
    const service = new PostgresGameService({
      connectionString: connectionString!,
      pepper,
    });
    await service.migrate();
    const created = await service.createGame("union");
    const existingLedger = await service.getDeletionLedger();
    const deletionReceipt = {
      actor: "off-host-recovery:test",
      deletedAt: Date.UTC(2026, 7, 15),
      gameId: created.gameId,
      position: existingLedger.length + 1,
      purgedAt: null,
    };
    const purgeReceipt = {
      ...deletionReceipt,
      position: existingLedger.length + 2,
      purgedAt: Date.UTC(2026, 8, 15),
    };

    await expect(
      service.synchronizeDeletionLedger([
        ...existingLedger,
        deletionReceipt,
        purgeReceipt,
      ]),
    ).resolves.toEqual([deletionReceipt, purgeReceipt]);
    await expect(service.getGameState(created.gameId)).rejects.toMatchObject({
      code: "game_purged",
    });
    await service.close();

    const persisted = await administration.query<{
      game_count: string;
      ledger_count: string;
      related_count: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM games WHERE id = $1) AS game_count,
         (SELECT count(*)::text FROM deletion_ledger WHERE game_id = $1) AS ledger_count,
         ((SELECT count(*) FROM actions WHERE game_id = $1) +
          (SELECT count(*) FROM snapshots WHERE game_id = $1) +
          (SELECT count(*) FROM host_bindings WHERE game_id = $1) +
          (SELECT count(*) FROM seat_bindings WHERE game_id = $1) +
          (SELECT count(*) FROM invitations WHERE game_id = $1) +
          (SELECT count(*) FROM recovery_grants WHERE game_id = $1))::text AS related_count`,
      [created.gameId],
    );
    expect(persisted.rows[0]).toEqual({
      game_count: "0",
      ledger_count: "2",
      related_count: "0",
    });
  });
});
