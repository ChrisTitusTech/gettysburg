import { describe, expect, it } from "vitest";
import {
  COMMAND_SCHEMA_VERSION,
  MANDATORY_RULESET_VERSION,
  RULESET_VERSION,
} from "./protocol";
import type {
  GameState,
  GameplayCommand,
  HexTerrain,
  UnitKind,
  UnitState,
} from "./protocol";
import { reduceGameplayCommand } from "./reducer";

const combatId = "33333333-3333-4333-8333-333333333333";
function unit(id: string, kind: UnitKind = "artillery"): UnitState {
  return {
    id,
    kind,
    combat: kind === "general" ? null : 3,
    location: "L6",
    side: "confederate",
    movement: 5,
    movement_spent: 5,
    entry_hexes: [],
    entry_turn: null,
    label: id,
    organization: "fixture",
    status: "deployed",
    strength: "full",
    steps_remaining: 2,
  };
}
function state(
  kind: HexTerrain["kind"] = "rough_hill",
  woods = true,
): GameState {
  return {
    game_id: "11111111-1111-4111-8111-111111111111",
    active_side: "confederate",
    phase: "combat",
    night: false,
    turn: 1,
    version: 0,
    event_sequence: 0,
    content_revision: "mandatory-fixture",
    ruleset_version: MANDATORY_RULESET_VERSION,
    objectives: { M6: { controlled_by: "union", value: 2 } },
    units: { a: unit("a") },
    terrain: {
      M6: {
        kind,
        woods,
        defense: 4,
        hill_defense: 4,
        forest_region: null,
        hill_region: null,
      },
    },
    combats: {
      [combatId]: {
        id: combatId,
        attackers: ["a"],
        defenders: [],
        attacker_hexes: ["L6"],
        defender_hexes: ["M6"],
        attacker_loss_allocated: true,
        defender_loss_allocated: true,
        attacker_retreated: false,
        defender_retreated: true,
        rolls: null,
        confirmation: null,
        status: "pending_choice",
        pending_choice: {
          kind: "advance",
          side: "confederate",
          eligible_unit_ids: ["a", "g"],
          destination_hexes: ["M6"],
        },
      },
    },
    victory: { confederate: 0, union: 2, status: "in-progress" },
  };
}
function advance(
  current: GameState,
  ids = ["a"],
  decline = false,
  side: "confederate" | "union" = "confederate",
) {
  const command: GameplayCommand = {
    command_id: "22222222-2222-4222-8222-222222222222",
    expected_version: current.version,
    game_id: current.game_id,
    schema: COMMAND_SCHEMA_VERSION,
    command_name: "advanceAfterCombat",
    payload: decline
      ? { combat_id: combatId, decline: true }
      : {
          combat_id: combatId,
          decline: false,
          destination: "M6",
          unit_ids: ids,
        },
  };
  return reduceGameplayCommand(current, side, command);
}

describe("mandatory artillery-safe advance", () => {
  it("requires a victorious combat attacker, not a general-only selection", () => {
    const current = {
      ...state("clear", false),
      units: { a: unit("a", "infantry"), g: unit("g", "general") },
    };
    expect(advance(current, ["g"]).ok).toBe(false);
    expect(advance(current, ["a", "g"]).ok).toBe(true);
    expect(
      advance({ ...current, ruleset_version: RULESET_VERSION }, ["g"]).ok,
    ).toBe(true);
  });

  it("rejects a missing destination entry even when the terrain map exists", () => {
    expect(advance({ ...state(), terrain: {} }).ok).toBe(false);
  });

  it("rejects wooded rough hills, including roads, but allows declining", () => {
    const current = {
      ...state(),
      movement_edges: {
        roads: [["L6", "M6"]] as const,
        railroads: [],
        streams: [],
      },
    };
    expect(advance(current)).toMatchObject({
      ok: false,
      failure: { error: "invalid_hex" },
    });
    expect(current.units.a?.location).toBe("L6");
    expect(advance(current, ["a"], true)).toMatchObject({
      ok: true,
      state: { combats: { [combatId]: { status: "resolved" } } },
    });
  });

  it.each(["woods", "hill", "rough_hill", "clear", "town"] as const)(
    "allows artillery to enter %s without the prohibited combination",
    (kind) => {
      const result = advance(state(kind, kind === "woods"));
      expect(result).toMatchObject({
        ok: true,
        state: {
          units: { a: { location: "M6", movement_spent: 5 } },
          victory: { confederate: 2, union: 0 },
        },
      });
    },
  );

  it("allows infantry with a general into wooded rough terrain in enemy ZOC at night", () => {
    const current = state();
    const result = advance(
      {
        ...current,
        night: true,
        units: {
          a: unit("a", "infantry"),
          g: unit("g", "general"),
          enemy: {
            ...unit("enemy", "infantry"),
            side: "union",
            location: "N6",
          },
        },
      },
      ["a", "g"],
    );
    expect(result).toMatchObject({
      ok: true,
      state: {
        units: {
          a: { location: "M6", movement_spent: 5 },
          g: { location: "M6", status: "deployed" },
        },
      },
    });
  });

  it("fails closed without terrain and rejects non-adjacent or wrong-seat advances", () => {
    const { terrain, ...withoutTerrain } = state();
    expect(terrain).toBeDefined();
    expect(advance(withoutTerrain).ok).toBe(false);
    const current = state("clear", false);
    expect(
      advance({ ...current, units: { a: { ...unit("a"), location: "A1" } } })
        .ok,
    ).toBe(false);
    expect(advance(current, ["a"], false, "union").ok).toBe(false);
  });

  it("preserves old-ruleset advance interpretation", () => {
    expect(advance({ ...state(), ruleset_version: RULESET_VERSION }).ok).toBe(
      true,
    );
  });
});
