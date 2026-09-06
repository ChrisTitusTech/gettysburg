import { describe, expect, it } from "vitest";

import { BOARD_EDGE_HEXES, BOARD_HEXES } from "./coordinates";
import { prepareNormalMovement } from "./movement-validation";
import {
  COMMAND_SCHEMA_VERSION,
  MANDATORY_RULESET_VERSION,
  RULESET_VERSION,
  gameplayCommandSchema,
} from "./protocol";
import type { GameState, GameplayCommand, UnitState } from "./protocol";
import { reduceGameplayCommand } from "./reducer";
import {
  prepareReinforcement,
  reinforcementEntryHexes,
} from "./reinforcements";

function unit(id: string, patch: Partial<UnitState> = {}): UnitState {
  return {
    combat: 3,
    entry_hexes: ["S1"],
    entry_turn: 2,
    id,
    kind: "infantry",
    label: id,
    location: null,
    movement: 5,
    organization: "fixture",
    side: "confederate",
    status: "reinforcement",
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
    turn: 2,
    version: 0,
    units: { r: unit("r") },
    movement_edges: { roads: [], railroads: [], streams: [] },
    victory: { confederate: 0, union: 0, status: "in-progress" },
    ...patch,
  };
}
function enemy(location: UnitState["location"]): UnitState {
  return unit("enemy", { status: "deployed", side: "union", location });
}
function command(current: GameState, ids: string[]): GameplayCommand {
  return {
    command_id: "22222222-2222-4222-8222-222222222222",
    expected_version: current.version,
    game_id: current.game_id,
    schema: COMMAND_SCHEMA_VERSION,
    ...(ids.length === 1
      ? {
          command_name: "enterReinforcement",
          payload: { unit_id: ids[0]!, destination: "S1" },
        }
      : {
          command_name: "enterReinforcementStack",
          payload: { unit_ids: ids, destination: "S1" },
        }),
  };
}

describe("mandatory reinforcement entry", () => {
  it("enumerates all 253 board hexes and 64 boundary hexes", () => {
    expect(new Set(BOARD_HEXES).size).toBe(253);
    expect(new Set(BOARD_EDGE_HEXES).size).toBe(64);
    expect(BOARD_EDGE_HEXES).toEqual(
      expect.arrayContaining(["A1", "A11", "W1", "W11", "S1", "I11"]),
    );
    expect(BOARD_EDGE_HEXES).not.toContain("L6");
  });

  it("uses the scheduled entry on time or later and spends its terrain cost", () => {
    const current = state({
      turn: 5,
      terrain: {
        S1: {
          kind: "woods",
          woods: true,
          defense: 2,
          hill_defense: 0,
          forest_region: "test",
          hill_region: null,
        },
      },
    });
    const entry = prepareReinforcement(current, "confederate", ["r"], "S1");
    expect(entry).toMatchObject({
      ok: true,
      cost: 2,
      patch: {
        units: { r: { status: "deployed", location: "S1", movement_spent: 2 } },
        normal_movement: { active_unit_ids: ["r"] },
      },
    });
    expect(current.units.r?.status).toBe("reinforcement");
  });

  it("charges half a point only on explicitly recorded off-board road links", () => {
    const current = state({
      movement_edges: {
        entry_roads: ["S1"],
        roads: [],
        railroads: [],
        streams: [],
      },
    });
    expect(
      prepareReinforcement(current, "confederate", ["r"], "S1"),
    ).toMatchObject({ ok: true, cost: 0.5 });
    const touching = state({
      movement_edges: { roads: [["R1", "S1"]], railroads: [], streams: [] },
    });
    expect(
      prepareReinforcement(touching, "confederate", ["r"], "S1"),
    ).toMatchObject({ ok: true, cost: 1 });
  });

  it.each([false, true])(
    "uses nearest safe edges when the entry is enemy occupied (night=%s)",
    (night) => {
      const current = state({
        night,
        units: { r: unit("r"), enemy: enemy("S1") },
      });
      expect(reinforcementEntryHexes(current, current.units.r!)).toEqual([
        "Q1",
        "U1",
      ]);
      expect(prepareReinforcement(current, "confederate", ["r"], "Q1").ok).toBe(
        true,
      );
      expect(prepareReinforcement(current, "confederate", ["r"], "P1").ok).toBe(
        false,
      );
      expect(prepareReinforcement(current, "confederate", ["r"], "S1").ok).toBe(
        false,
      );
    },
  );

  it("also substitutes a nearest edge when the scheduled entry is only in enemy ZOC", () => {
    const current = state({ units: { r: unit("r"), enemy: enemy("R1") } });
    expect(reinforcementEntryHexes(current, current.units.r!)).toEqual(["T1"]);
    expect(prepareReinforcement(current, "confederate", ["r"], "T1").ok).toBe(
      true,
    );
  });

  it("waits for a friendly blocked entry rather than inventing an alternative", () => {
    const current = state({
      units: {
        r: unit("r"),
        friendly: unit("friendly", { status: "deployed", location: "S1" }),
      },
    });
    expect(reinforcementEntryHexes(current, current.units.r!)).toEqual(["S1"]);
    expect(
      prepareReinforcement(current, "confederate", ["r"], "S1"),
    ).toMatchObject({ ok: false, error: "occupied" });
    expect(prepareReinforcement(current, "confederate", ["r"], "T1").ok).toBe(
      false,
    );
  });

  it("waits when every edge is enemy occupied", () => {
    const current = state({
      units: {
        r: unit("r"),
        ...Object.fromEntries(
          BOARD_EDGE_HEXES.map((hex) => [hex, { ...enemy(hex), id: hex }]),
        ),
      },
    });
    expect(reinforcementEntryHexes(current, current.units.r!)).toEqual([]);
  });

  it("prohibits artillery in wooded rough terrain even with a road entry", () => {
    const current = state({
      units: { r: unit("r", { kind: "artillery" }) },
      terrain: {
        S1: {
          kind: "rough_hill",
          woods: true,
          defense: 4,
          hill_defense: 2,
          forest_region: "test",
          hill_region: "test",
        },
      },
      movement_edges: {
        entry_roads: ["S1"],
        roads: [],
        railroads: [],
        streams: [],
      },
    });
    expect(prepareReinforcement(current, "confederate", ["r"], "S1").ok).toBe(
      false,
    );
  });

  it("enters a general and combat units atomically with full-move accompaniment", () => {
    const current = state({
      units: {
        r: unit("r"),
        general: unit("general", {
          kind: "general",
          combat: null,
          movement: 10,
        }),
      },
    });
    const result = reduceGameplayCommand(
      current,
      "confederate",
      command(current, ["r", "general"]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state).toMatchObject({
      version: 1,
      event_sequence: 1,
      normal_movement: {
        active_unit_ids: ["general", "r"],
        bonus_unit_ids: ["r"],
      },
    });
    expect(
      prepareNormalMovement(
        result.state,
        "confederate",
        ["general", "r"],
        "S6",
      ),
    ).toMatchObject({ ok: true, allowance: 5 });
    expect(
      prepareNormalMovement(result.state, "confederate", ["general", "r"], "S7")
        .ok,
    ).toBe(false);
    expect(current.units.r?.status).toBe("reinforcement");
  });

  it("counts a different reinforcement entry as a different movement activation", () => {
    const current = state({
      units: { r: unit("r"), b: unit("b", { entry_hexes: ["A1"] }) },
    });
    const first = prepareReinforcement(current, "confederate", ["r"], "S1");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = prepareReinforcement(
      { ...current, ...first.patch },
      "confederate",
      ["b"],
      "A1",
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(
      prepareNormalMovement(
        { ...current, ...second.patch },
        "confederate",
        ["r"],
        "S2",
      ).ok,
    ).toBe(false);
    expect(second.patch.normal_movement?.closed_unit_ids).toEqual(["r"]);
  });

  it("rejects early, hostile, duplicate, already-entered, overstacked and unaffordable entry", () => {
    expect(
      prepareReinforcement(state({ turn: 1 }), "confederate", ["r"], "S1"),
    ).toMatchObject({ ok: false, error: "reinforcement_early" });
    expect(prepareReinforcement(state(), "union", ["r"], "S1").ok).toBe(false);
    expect(
      prepareReinforcement(state(), "confederate", ["r", "r"], "S1").ok,
    ).toBe(false);
    expect(
      prepareReinforcement(
        state({
          units: { r: unit("r", { status: "deployed", location: "S1" }) },
        }),
        "confederate",
        ["r"],
        "S1",
      ),
    ).toMatchObject({ ok: false, error: "already_entered" });
    expect(
      prepareReinforcement(
        state({ units: { r: unit("r"), b: unit("b") } }),
        "confederate",
        ["r", "b"],
        "S1",
      ),
    ).toMatchObject({ ok: false, error: "occupied" });
    expect(
      prepareReinforcement(
        state({ units: { r: unit("r", { movement: 0 }) } }),
        "confederate",
        ["r"],
        "S1",
      ),
    ).toMatchObject({ ok: false, error: "movement_exceeded" });
  });

  it("validates the new command shape and refuses it on the old ruleset", () => {
    const current = state({
      units: { r: unit("r"), general: unit("general", { kind: "general" }) },
    });
    const joint = command(current, ["r", "general"]);
    expect(gameplayCommandSchema.safeParse(joint).success).toBe(true);
    expect(
      gameplayCommandSchema.safeParse({
        ...joint,
        payload: { unit_ids: ["r"], destination: "S1" },
      }).success,
    ).toBe(false);
    expect(
      reduceGameplayCommand(
        { ...current, ruleset_version: RULESET_VERSION },
        "confederate",
        joint,
      ),
    ).toMatchObject({ ok: false, failure: { error: "phase_invalid" } });
    const legacy = reduceGameplayCommand(
      { ...current, ruleset_version: RULESET_VERSION },
      "confederate",
      command(current, ["r"]),
    );
    expect(legacy.ok).toBe(true);
    if (legacy.ok) expect(legacy.state.units.r?.movement_spent).toBeUndefined();
  });

  it("previews capture and objective control identically to the accepted entry", () => {
    const current = state({
      units: {
        r: unit("r"),
        general: unit("general", {
          kind: "general",
          combat: null,
          side: "union",
          status: "deployed",
          location: "R1",
        }),
      },
      objectives: { S1: { controlled_by: "union", value: 1 } },
    });
    const preview = prepareReinforcement(current, "confederate", ["r"], "S1");
    const result = reduceGameplayCommand(
      current,
      "confederate",
      command(current, ["r"]),
    );
    expect(preview.ok && result.ok).toBe(true);
    if (!preview.ok || !result.ok) return;
    expect(result.state.units).toEqual(preview.patch.units);
    expect(preview.patch.units.general?.status).toBe("eliminated");
    expect(result.state.objectives).toEqual(preview.patch.objectives);
    expect(result.state.victory.confederate).toBe(1);
  });
});
