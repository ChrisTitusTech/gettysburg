import { describe, expect, it } from "vitest";

import type { HexCoordinate } from "./coordinates";
import { prepareNormalMovement } from "./movement-validation";
import {
  COMMAND_SCHEMA_VERSION,
  MANDATORY_RULESET_VERSION,
  RULESET_VERSION,
} from "./protocol";
import type {
  GameState,
  GameplayCommand,
  HexTerrain,
  UnitState,
} from "./protocol";
import { reduceGameplayCommand } from "./reducer";

const woods: HexTerrain = {
  kind: "woods",
  woods: true,
  defense: 2,
  hill_defense: 0,
  forest_region: "test",
  hill_region: null,
};
function unit(id: string, patch: Partial<UnitState> = {}): UnitState {
  return {
    combat: 3,
    entry_hexes: [],
    entry_turn: null,
    id,
    kind: "infantry",
    label: id,
    location: "A2",
    movement: 5,
    organization: "fixture",
    side: "confederate",
    status: "deployed",
    steps_remaining: 2,
    strength: "full",
    ...patch,
  };
}
function state(patch: Partial<GameState> = {}): GameState {
  return {
    active_side: "confederate",
    combats: {},
    content_revision: "mandatory-fixture",
    event_sequence: 0,
    game_id: "11111111-1111-4111-8111-111111111111",
    night: false,
    objectives: {},
    phase: "movement",
    ruleset_version: MANDATORY_RULESET_VERSION,
    terrain: {},
    movement_edges: { roads: [], railroads: [], streams: [] },
    turn: 1,
    units: { a: unit("a") },
    version: 0,
    victory: { confederate: 0, union: 0, status: "in-progress" },
    ...patch,
  };
}
function move(current: GameState, ids: string[], destination: HexCoordinate) {
  return reduceGameplayCommand(current, "confederate", {
    command_id: "22222222-2222-4222-8222-222222222222",
    command_name: ids.length === 1 ? "moveUnit" : "moveStack",
    expected_version: current.version,
    game_id: current.game_id,
    schema: COMMAND_SCHEMA_VERSION,
    payload:
      ids.length === 1
        ? { unit_id: ids[0]!, destination }
        : { unit_ids: ids, destination },
  } as GameplayCommand);
}
function accepted(
  current: GameState,
  ids: string[],
  destination: HexCoordinate,
) {
  const result = move(current, ids, destination);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.failure.message);
  return result.state;
}

describe("mandatory movement authoritative/preview integration", () => {
  it("uses the exact preview patch and increments state/event once", () => {
    const current = state({ terrain: { B2: woods } });
    const before = JSON.stringify(current);
    const preview = prepareNormalMovement(current, "confederate", ["a"], "B2");
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const next = accepted(current, ["a"], "B2");
    expect(next).toMatchObject({
      ...preview.patch,
      version: 1,
      event_sequence: 1,
    });
    expect(next.units.a?.movement_spent).toBe(2);
    expect(JSON.stringify(current)).toBe(before);
  });

  it("spends exact half points and accumulates repeated drags", () => {
    const current = state({
      movement_edges: {
        roads: [
          ["A2", "B2"],
          ["B2", "C3"],
        ],
        railroads: [],
        streams: [],
      },
    });
    const first = accepted(current, ["a"], "B2");
    const second = accepted(first, ["a"], "C3");
    expect(second.units.a?.movement_spent).toBe(1);
    expect(second.normal_movement?.closed_unit_ids).toEqual([]);
  });

  it("uses the general bonus for the entire atomic stack move", () => {
    const current = state({
      units: {
        a: unit("a"),
        general: unit("general", {
          kind: "general",
          combat: null,
          movement: 10,
        }),
      },
    });
    const next = accepted(current, ["a", "general"], "A8");
    expect(next.units.a?.movement_spent).toBe(6);
    expect(next.units.general?.movement_spent).toBe(6);
    expect(move(next, ["general", "a"], "A9")).toMatchObject({
      ok: false,
      failure: { error: "movement_exceeded" },
    });
  });

  it("does not close the previous group after a rejected different move", () => {
    const current = state({
      units: { a: unit("a"), b: unit("b", { location: "D7" }) },
    });
    const first = accepted(current, ["a"], "A3");
    expect(move(first, ["b"], "W11").ok).toBe(false);
    const next = accepted(first, ["a"], "A4");
    expect(next.units.a?.movement_spent).toBe(2);
  });

  it("preserves a completed move boundary through saved-state serialization", () => {
    const current = state({
      units: { a: unit("a"), b: unit("b", { location: "D7" }) },
    });
    const first = accepted(current, ["a"], "A3");
    const second = accepted(first, ["b"], "D8");
    const restored = JSON.parse(JSON.stringify(second)) as GameState;
    expect(move(restored, ["a"], "A4")).toMatchObject({
      ok: false,
      failure: { error: "phase_invalid" },
    });
    expect(restored.normal_movement?.closed_unit_ids).toEqual(["a"]);
  });

  it("resets movement and activation when the next side begins", () => {
    const moved = accepted(state(), ["a"], "A3");
    const end = reduceGameplayCommand(moved, "confederate", {
      command_id: "33333333-3333-4333-8333-333333333333",
      command_name: "endPhase",
      payload: {},
      expected_version: moved.version,
      game_id: moved.game_id,
      schema: COMMAND_SCHEMA_VERSION,
    });
    expect(end).toMatchObject({
      ok: true,
      state: {
        active_side: "union",
        normal_movement: {
          active_unit_ids: [],
          closed_unit_ids: [],
          bonus_unit_ids: [],
        },
      },
    });
  });

  it("keeps source/destination stacks legal while permitting friendly transit", () => {
    const stacked = state({
      units: {
        a: unit("a"),
        b: unit("b"),
        general: unit("general", { kind: "general", combat: null }),
      },
    });
    expect(move(stacked, ["general"], "A3")).toMatchObject({
      ok: false,
      failure: { error: "occupied" },
    });
    const blocked = state({
      units: { a: unit("a"), b: unit("b", { location: "A3" }) },
    });
    expect(move(blocked, ["a"], "A3")).toMatchObject({
      ok: false,
      failure: { error: "occupied" },
    });
    expect(accepted(blocked, ["a"], "A4").units.a?.movement_spent).toBe(2);
  });

  it("captures traversed objectives identically for one drag or repeated drags", () => {
    const current = state({
      objectives: { A3: { controlled_by: "union", value: 2 } },
    });
    const one = accepted(current, ["a"], "A4");
    const two = accepted(accepted(current, ["a"], "A3"), ["a"], "A4");
    expect(one.units).toEqual(two.units);
    expect(one.objectives).toEqual(two.objectives);
    expect(one.victory.confederate).toBe(2);
  });

  it("rejects artillery-prohibited and night-controlled destinations", () => {
    const rough = { ...woods, kind: "rough_hill" as const };
    const artillery = state({
      terrain: { B2: rough },
      units: { a: unit("a", { kind: "artillery" }) },
    });
    expect(move(artillery, ["a"], "B2").ok).toBe(false);
    const night = state({
      night: true,
      units: {
        a: unit("a"),
        enemy: unit("enemy", { side: "union", location: "C2" }),
      },
    });
    expect(move(night, ["a"], "B2").ok).toBe(false);
  });

  it("fails closed without a pinned movement bundle", () => {
    const { movement_edges: omittedEdges, ...missingEdges } = state();
    const { terrain: omittedTerrain, ...missingTerrain } = state();
    expect(omittedEdges).toBeDefined();
    expect(omittedTerrain).toBeDefined();
    for (const current of [missingEdges, missingTerrain]) {
      expect(move(current, ["a"], "B2")).toMatchObject({
        ok: false,
        failure: { error: "version_unavailable" },
      });
    }
  });

  it("validates authority, identifiers, coordinates, and non-no-op movement", () => {
    expect(prepareNormalMovement(state(), "union", ["a"], "B2")).toMatchObject({
      ok: false,
      error: "wrong_seat",
    });
    expect(
      prepareNormalMovement(
        state({ phase: "combat" }),
        "confederate",
        ["a"],
        "B2",
      ),
    ).toMatchObject({ ok: false, error: "phase_invalid" });
    for (const ids of [[], ["a", "a"], ["missing"]])
      expect(prepareNormalMovement(state(), "confederate", ids, "B2").ok).toBe(
        false,
      );
    expect(move(state(), ["a"], "A2").ok).toBe(false);
    expect(move(state(), ["a"], "Z99" as HexCoordinate).ok).toBe(false);
  });

  it("leaves the current terrain ruleset interpretation unchanged", () => {
    const current = state({
      ruleset_version: RULESET_VERSION,
      terrain: { B2: woods },
      units: { a: unit("a"), b: unit("b", { location: "D7" }) },
    });
    const first = accepted(current, ["a"], "B2");
    expect(first.units.a?.movement_spent).toBe(1);
    expect(first.normal_movement).toBeUndefined();
    const second = accepted(first, ["b"], "D8");
    expect(accepted(second, ["a"], "B3").units.a?.movement_spent).toBe(2);
  });
});
