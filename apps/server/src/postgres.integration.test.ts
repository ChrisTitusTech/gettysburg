import { randomBytes } from "node:crypto";

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
    const created = await first.createGame("union");
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
      ruleset_version: "phase-2-tabletop-v1",
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
    await administration.query(
      "DROP TRIGGER reject_gettysburg_action ON actions",
    );
    await administration.query("DROP FUNCTION gettysburg_reject_action()");

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
});
