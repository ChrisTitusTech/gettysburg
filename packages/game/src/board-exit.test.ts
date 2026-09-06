import { describe, expect, it } from "vitest";

import { prepareBoardExit } from "./board-exit";
import { adjacentHexes } from "./coordinates";
import { prepareNormalMovement } from "./movement-validation";
import { planNormalMove } from "./normal-move";
import {
  COMMAND_SCHEMA_VERSION,
  MANDATORY_RULESET_VERSION,
  RULESET_VERSION,
  gameplayCommandSchema,
} from "./protocol";
import type { GameState, GameplayCommand, UnitState } from "./protocol";
import { reduceGameplayCommand } from "./reducer";
import { prepareReinforcement } from "./reinforcements";

function unit(id: string, patch: Partial<UnitState> = {}): UnitState {
  return {
    combat: 5,
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
    turn: 1,
    version: 0,
    units: { a: unit("a") },
    movement_edges: { roads: [], railroads: [], streams: [] },
    victory: { confederate: 0, union: 0, status: "in-progress" },
    ...patch,
  };
}
function command(current: GameState, ids = ["a"]): GameplayCommand {
  return {
    command_id: "22222222-2222-4222-8222-222222222222",
    command_name: "exitBoard",
    expected_version: current.version,
    game_id: current.game_id,
    schema: COMMAND_SCHEMA_VERSION,
    payload: { unit_ids: ids },
  };
}

describe("mandatory permanent board exit", () => {
  it("requires an affordable edge exit when enemies block every on-board night withdrawal", () => {
    const units = {
      a: unit("a"),
      ...Object.fromEntries(
        adjacentHexes("A2").map((location) => [
          location,
          unit(location, { side: "union", location }),
        ]),
      ),
    };
    const current = state({ night: true, units });
    const end = (source: GameState) =>
      reduceGameplayCommand(source, "confederate", {
        ...command(source),
        command_name: "endPhase",
        payload: {},
      });
    expect(end(current)).toMatchObject({
      ok: false,
      failure: {
        error: "phase_invalid",
        message: expect.stringContaining("can withdraw"),
      },
    });
    // Without a legal exit, this reaches combat generation instead of falsely
    // demanding an impossible withdrawal (server dice deliberately omitted).
    const exhausted = {
      ...current,
      units: { ...units, a: unit("a", { movement_spent: 5 }) },
    };
    expect(end(exhausted)).toMatchObject({
      ok: false,
      failure: { error: "combat_invalid" },
    });
    expect(end({ ...current, ruleset_version: RULESET_VERSION })).toMatchObject(
      { ok: false, failure: { error: "combat_invalid" } },
    );
  });

  it("recognizes a night exit that needs the active stack and its general bonus", () => {
    const movers = [
      unit("a"),
      unit("b"),
      unit("g", { kind: "general", combat: null, movement: 10 }),
    ];
    const plan = planNormalMove(undefined, movers);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const current = state({
      night: true,
      normal_movement: plan.activation,
      units: Object.fromEntries([
        ...movers.map(
          (mover) => [mover.id, { ...mover, movement_spent: 5 }] as const,
        ),
        ...adjacentHexes("A2").map(
          (location) =>
            [location, unit(location, { side: "union", location })] as const,
        ),
      ]),
    });
    expect(prepareBoardExit(current, "confederate", ["a"]).ok).toBe(false);
    expect(
      reduceGameplayCommand(current, "confederate", {
        ...command(current),
        command_name: "endPhase",
        payload: {},
      }),
    ).toMatchObject({
      ok: false,
      failure: { message: expect.stringContaining("a (A2), b (A2), g (A2)") },
    });
  });

  it("spends one point, preserves strength, and atomically applies the preview", () => {
    const current = state();
    const preview = prepareBoardExit(current, "confederate", ["a"]);
    const result = reduceGameplayCommand(
      current,
      "confederate",
      command(current),
    );
    expect(preview.ok && result.ok).toBe(true);
    if (!preview.ok || !result.ok) return;
    expect(result.state).toMatchObject({
      ...preview.patch,
      version: 1,
      event_sequence: 1,
    });
    expect(result.state.units.a).toMatchObject({
      status: "exited",
      location: null,
      strength: "full",
      steps_remaining: 2,
      movement_spent: 1,
    });
    expect(result.state.victory.union).toBe(0);
    expect(current.units.a?.status).toBe("deployed");
  });

  it("scores neither elimination nor an off-board reduced counter", () => {
    const current = state({
      units: { a: unit("a", { strength: "reduced", steps_remaining: 1 }) },
    });
    const result = reduceGameplayCommand(
      current,
      "confederate",
      command(current),
    );
    expect(result).toMatchObject({
      ok: true,
      state: {
        units: { a: { strength: "reduced", status: "exited" } },
        victory: { union: 0 },
      },
    });
  });

  it("cannot move, enter as a reinforcement, or exit again after serialization", () => {
    const current = state();
    const exit = prepareBoardExit(current, "confederate", ["a"]);
    expect(exit.ok).toBe(true);
    if (!exit.ok) return;
    const restored = JSON.parse(
      JSON.stringify({ ...current, ...exit.patch }),
    ) as GameState;
    expect(prepareNormalMovement(restored, "confederate", ["a"], "A3").ok).toBe(
      false,
    );
    expect(
      prepareReinforcement(restored, "confederate", ["a"], "A2"),
    ).toMatchObject({ ok: false, error: "already_entered" });
    expect(prepareBoardExit(restored, "confederate", ["a"]).ok).toBe(false);
  });

  it("requires a full point even at a road edge and rejects interior exits", () => {
    const current = state({
      units: { a: unit("a", { movement_spent: 4.5 }) },
      movement_edges: {
        entry_roads: ["A2"],
        roads: [],
        railroads: [],
        streams: [],
      },
    });
    expect(prepareBoardExit(current, "confederate", ["a"])).toMatchObject({
      ok: false,
      error: "movement_exceeded",
    });
    expect(
      prepareBoardExit(
        state({ units: { a: unit("a", { location: "L6" }) } }),
        "confederate",
        ["a"],
      ),
    ).toMatchObject({ ok: false, error: "invalid_hex" });
  });

  it("permits a full stack to use its previously earned general bonus", () => {
    const movers = [
      unit("a"),
      unit("general", { kind: "general", combat: null, movement: 10 }),
    ];
    const plan = planNormalMove(undefined, movers);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const current = state({
      normal_movement: plan.activation,
      units: Object.fromEntries(
        movers.map((mover) => [mover.id, { ...mover, movement_spent: 5 }]),
      ),
    });
    const exit = prepareBoardExit(current, "confederate", ["general", "a"]);
    expect(exit.ok).toBe(true);
    if (exit.ok) expect(exit.patch.units.a?.movement_spent).toBe(6);
  });

  it("cannot resume closed movers or split the active group to get another move", () => {
    const current = state({
      normal_movement: {
        active_unit_ids: ["b"],
        closed_unit_ids: ["a"],
        bonus_unit_ids: [],
      },
    });
    expect(prepareBoardExit(current, "confederate", ["a"]).ok).toBe(false);
    expect(
      prepareBoardExit(
        state({
          normal_movement: {
            active_unit_ids: ["a", "b"],
            closed_unit_ids: [],
            bonus_unit_ids: [],
          },
        }),
        "confederate",
        ["a"],
      ).ok,
    ).toBe(false);
  });

  it("keeps the source stack legal and captures abandoned generals", () => {
    const stacked = state({
      units: {
        a: unit("a"),
        b: unit("b"),
        general: unit("general", { kind: "general", combat: null }),
      },
    });
    expect(prepareBoardExit(stacked, "confederate", ["general"])).toMatchObject(
      { ok: false, error: "occupied" },
    );
    const threatened = state({
      units: {
        a: unit("a"),
        general: unit("general", { kind: "general", combat: null }),
        enemy: unit("enemy", { side: "union", location: "B2" }),
      },
    });
    const exit = prepareBoardExit(threatened, "confederate", ["a"]);
    expect(exit.ok).toBe(true);
    if (exit.ok) expect(exit.patch.units.general?.status).toBe("eliminated");
  });

  it("does not let an already-captured lone general escape off-board", () => {
    const current = state({
      units: {
        a: unit("a", { kind: "general", combat: null }),
        enemy: unit("enemy", { side: "union", location: "B2" }),
      },
    });
    expect(prepareBoardExit(current, "confederate", ["a"]).ok).toBe(false);
  });

  it("allows night withdrawal by exit without changing objective ownership", () => {
    const current = state({
      night: true,
      objectives: { A2: { controlled_by: "confederate", value: 2 } },
    });
    const result = reduceGameplayCommand(
      current,
      "confederate",
      command(current),
    );
    expect(result).toMatchObject({
      ok: true,
      state: {
        units: { a: { status: "exited" } },
        objectives: current.objectives,
        victory: { confederate: 2 },
      },
    });
  });

  it("checks authority and protocol shape and isolates old rulesets", () => {
    const current = state();
    expect(prepareBoardExit(current, "union", ["a"]).ok).toBe(false);
    expect(
      prepareBoardExit(state({ phase: "combat" }), "confederate", ["a"]).ok,
    ).toBe(false);
    expect(prepareBoardExit(current, "confederate", ["a", "a"]).ok).toBe(false);
    expect(prepareBoardExit(current, "confederate", ["missing"]).ok).toBe(
      false,
    );
    expect(gameplayCommandSchema.safeParse(command(current)).success).toBe(
      true,
    );
    expect(gameplayCommandSchema.safeParse(command(current, [])).success).toBe(
      false,
    );
    expect(
      reduceGameplayCommand(
        { ...current, ruleset_version: RULESET_VERSION },
        "confederate",
        command(current),
      ),
    ).toMatchObject({ ok: false, failure: { error: "phase_invalid" } });
  });
});
