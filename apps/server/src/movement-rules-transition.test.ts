import { randomBytes, randomUUID } from "node:crypto";
import { createMandatoryInitialState } from "@gettysburg/content";
import {
  COMMAND_SCHEMA_VERSION,
  MANDATORY_RULESET_VERSION,
  WHOLE_POINT_RULESET_VERSION,
  type HexCoordinate,
} from "@gettysburg/game";
import { describe, expect, it } from "vitest";
import { InMemoryGameService, type StoredAction } from "./game-service.js";
import { publicActionLog } from "./public-action-log.js";

function fixture() {
  const pepper = randomBytes(32);
  const initial = new InMemoryGameService({ pepper });
  const host = initial.createGame("union");
  const snapshot = initial.exportSnapshot();
  const service = new InMemoryGameService({
    pepper,
    snapshot: {
      ...snapshot,
      games: snapshot.games.map(([id, record]) => [
        id,
        { ...record, state: createMandatoryInitialState(id) },
      ]),
    },
  });
  const move = (destination: HexCoordinate) =>
    service.executeCommand(service.authenticate(host.credential, host.gameId), {
      schema: COMMAND_SCHEMA_VERSION,
      command_id: randomUUID(),
      command_name: "moveUnit",
      game_id: host.gameId,
      expected_version: service.getGameState(host.gameId).version,
      payload: { unit_id: "u-devin", destination },
    });
  return { service, host, pepper, move };
}

describe("explicit whole-point rules transition", () => {
  it("preserves saves, half-point history, activation, credentials, and exact replay across the boundary", () => {
    const { service, host, pepper, move } = fixture();
    expect(move("P7")).toMatchObject({ ok: true });
    const before = service.getGameState(host.gameId);
    expect(before.units["u-devin"]!.movement_spent).toBe(0.5);
    const request = randomUUID();
    const after = service.transitionWholePointMovement(
      host.gameId,
      1,
      "owner-approved-maintenance",
      request,
    );
    expect(after).toMatchObject({
      version: 2,
      event_sequence: 2,
      ruleset_version: WHOLE_POINT_RULESET_VERSION,
    });
    expect(after.units).toEqual(before.units);
    expect(after.normal_movement).toEqual(before.normal_movement);
    expect(
      service.transitionWholePointMovement(
        host.gameId,
        1,
        "owner-approved-maintenance",
        request,
      ),
    ).toEqual(after);
    expect(service.getActions(host.gameId)).toHaveLength(2);
    expect(move("O7")).toMatchObject({ ok: true });
    const final = service.getGameState(host.gameId);
    expect(final.units["u-devin"]!.movement_spent).toBe(1.5);
    const restored = new InMemoryGameService({
      pepper,
      snapshot: service.exportSnapshot(),
    });
    expect(restored.getReplay(host.credential, host.gameId, 0).state).toEqual(
      createMandatoryInitialState(host.gameId),
    );
    expect(restored.getReplay(host.credential, host.gameId, 1).state).toEqual(
      before,
    );
    expect(restored.getReplay(host.credential, host.gameId, 2).state).toEqual(
      after,
    );
    expect(restored.getReplay(host.credential, host.gameId).state).toEqual(
      final,
    );
    expect(publicActionLog(service.getActions(host.gameId))[1]).toMatchObject({
      kind: "operator_audit",
      command_name: "adoptWholePointMovement",
      state_version: 2,
    });
  });

  it("rejects stale versions, missing operator identity, reused identities, and duplicate upgrades", () => {
    const { service, host } = fixture();
    const request = randomUUID();
    expect(() =>
      service.transitionWholePointMovement(host.gameId, 1, "owner", request),
    ).toThrow("Game changed");
    expect(() =>
      service.transitionWholePointMovement(host.gameId, 0, "", request),
    ).toThrow("named operator");
    expect(() =>
      service.transitionWholePointMovement(host.gameId, 0, "owner", "bad"),
    ).toThrow("UUID");
    expect(service.getActions(host.gameId)).toHaveLength(0);
    service.transitionWholePointMovement(host.gameId, 0, "owner", request);
    expect(() =>
      service.transitionWholePointMovement(host.gameId, 0, "other", request),
    ).toThrow("identity conflict");
    expect(() =>
      service.transitionWholePointMovement(
        host.gameId,
        1,
        "owner",
        randomUUID(),
      ),
    ).toThrow("pinned v4");
    expect(service.getActions(host.gameId)).toHaveLength(1);
  });

  it.each<Partial<StoredAction>>([
    { payload: {} },
    { authorizingType: "seat" },
    { operatorRequestId: "invalid" },
    { resultingVersion: 0 },
    { rulesetVersion: WHOLE_POINT_RULESET_VERSION },
    { commandName: null },
    { canonicalRequestHash: "unexpected" },
  ])("rejects forged transition metadata in replay: %j", (patch) => {
    const { service, host, pepper } = fixture();
    service.transitionWholePointMovement(host.gameId, 0, "owner", randomUUID());
    const snapshot = service.exportSnapshot();
    const restored = new InMemoryGameService({
      pepper,
      snapshot: {
        ...snapshot,
        games: snapshot.games.map(([id, record]) => [
          id,
          {
            ...record,
            actions: record.actions.map((action) => ({ ...action, ...patch })),
          },
        ]),
      },
    });
    expect(() => restored.getReplay(host.credential, host.gameId)).toThrow();
  });

  it("creates v5 games and replays cursor zero without inferring v4", () => {
    const service = new InMemoryGameService();
    const host = service.createGame("union");
    expect(host.state.ruleset_version).toBe(WHOLE_POINT_RULESET_VERSION);
    expect(host.state.ruleset_version).not.toBe(MANDATORY_RULESET_VERSION);
    expect(service.getReplay(host.credential, host.gameId, 0).state).toEqual(
      host.state,
    );
  });
});
