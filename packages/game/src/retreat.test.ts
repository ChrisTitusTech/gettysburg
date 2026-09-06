import { describe, expect, it } from "vitest";
import { adjacentHexes, BOARD_HEXES } from "./coordinates";
import type { HexCoordinate } from "./coordinates";
import { MANDATORY_RULESET_VERSION } from "./protocol";
import type { GameState, HexTerrain, UnitState } from "./protocol";
import {
  retreatOptions,
  suggestedRetreat,
  validateRetreatPath,
} from "./retreat";

function unit(
  id: string,
  location: HexCoordinate,
  patch: Partial<UnitState> = {},
): UnitState {
  return {
    id,
    location,
    side: "confederate",
    kind: "artillery",
    combat: 5,
    movement: 5,
    movement_spent: 5,
    entry_hexes: [],
    entry_turn: null,
    label: id,
    organization: "fixture",
    status: "deployed",
    strength: "full",
    steps_remaining: 2,
    ...patch,
  };
}
function state(patch: Partial<GameState> = {}): GameState {
  return {
    game_id: "11111111-1111-4111-8111-111111111111",
    active_side: "confederate",
    phase: "combat",
    night: false,
    turn: 1,
    version: 0,
    event_sequence: 0,
    combats: {},
    objectives: {},
    content_revision: "mandatory-fixture",
    ruleset_version: MANDATORY_RULESET_VERSION,
    terrain: {},
    units: { a: unit("a", "L6") },
    victory: { confederate: 0, union: 0, status: "in-progress" },
    ...patch,
  };
}
function terrain(patch: Partial<HexTerrain>): HexTerrain {
  return {
    kind: "clear",
    defense: 0,
    hill_defense: 0,
    woods: false,
    forest_region: null,
    hill_region: null,
    ...patch,
  };
}
// Force artillery through explicit corridors; no source-map coordinates assumed.
function corridor(
  open: readonly HexCoordinate[],
  units: GameState["units"] = { a: unit("a", "L6") },
): GameState {
  return state({
    units,
    terrain: Object.fromEntries(
      BOARD_HEXES.filter((hex) => !open.includes(hex)).map((hex) => [
        hex,
        terrain({ kind: "rough_hill", woods: true }),
      ]),
    ),
  });
}

describe("mandatory retreat geometry", () => {
  it("prefers viable non-enemy-ZOC neighbors", () => {
    const current = state({
      units: {
        a: unit("a", "L6"),
        enemy: unit("enemy", "M5", { side: "union" }),
      },
    });
    expect(retreatOptions(current, ["a"])?.next_hexes).not.toContain("L5");
    expect(validateRetreatPath(current, ["a"], ["L6", "L7"])).toBe(true);
    expect(validateRetreatPath(current, ["a"], ["L6", "L5"])).toBe(false);
  });

  it("allows enemy ZOC when it is the only complete route, even at night", () => {
    const current = corridor(["L6", "L5"], {
      a: unit("a", "L6"),
      enemy: unit("enemy", "M5", { side: "union" }),
    });
    expect(
      validateRetreatPath({ ...current, night: true }, ["a"], ["L6", "L5"]),
    ).toBe(true);
    expect(current.units.a?.movement_spent).toBe(5);
  });

  it("continues through friendly stacks and stops at the first empty hex", () => {
    const current = corridor(["L6", "L5", "L4", "L3"], {
      a: unit("a", "L6"),
      friend: unit("friend", "L5"),
    });
    expect(validateRetreatPath(current, ["a"], ["L6", "L5"])).toBe(false);
    expect(validateRetreatPath(current, ["a"], ["L6", "L5", "L4"])).toBe(true);
    expect(validateRetreatPath(current, ["a"], ["L6", "L5", "L4", "L3"])).toBe(
      false,
    );
    expect(suggestedRetreat(current, ["a"])).toEqual({
      path: ["L6", "L5", "L4"],
      exit: false,
    });
  });

  it("does not mistake friendly dead ends for an escape", () => {
    const current = corridor(["L6", "L5"], {
      a: unit("a", "L6"),
      friend: unit("friend", "L5"),
    });
    expect(retreatOptions(current, ["a"])).toMatchObject({
      next_hexes: [],
      can_hold: true,
      can_exit: false,
    });
    expect(suggestedRetreat(current, ["a"])).toBeNull();
  });

  it("does not prioritize a safe dead end over the only viable unsafe route", () => {
    const current = corridor(["L6", "L5", "L7"], {
      a: unit("a", "L6"),
      friend: unit("friend", "L5"),
      enemy: unit("enemy", "M7", { side: "union" }),
    });
    expect(retreatOptions(current, ["a"])?.next_hexes).toEqual(["L7"]);
    expect(validateRetreatPath(current, ["a"], ["L6", "L7"])).toBe(true);
  });

  it("rejects cycles, jumps, wrong origins, and empty paths", () => {
    const current = corridor(["L6", "L5", "L4"], {
      a: unit("a", "L6"),
      friend: unit("friend", "L5"),
    });
    for (const path of [
      [],
      ["L5", "L4"],
      ["L6", "L4"],
      ["L6", "L5", "L6", "L5", "L4"],
    ] as HexCoordinate[][])
      expect(validateRetreatPath(current, ["a"], path)).toBe(false);
  });

  it("blocks enemies and wooded rough hills but not ordinary woods or hills", () => {
    const current = corridor(["L6", "L5"], {
      a: unit("a", "L6"),
      enemy: unit("enemy", "L5", { side: "union" }),
    });
    expect(retreatOptions(current, ["a"])?.can_hold).toBe(true);
    const trapped = corridor(["L6"]);
    expect(retreatOptions(trapped, ["a"])?.can_hold).toBe(true);
    for (const kind of ["woods", "rough_hill"] as const)
      expect(
        validateRetreatPath(
          {
            ...trapped,
            terrain: { ...trapped.terrain, L5: terrain({ kind }) },
          },
          ["a"],
          ["L6", "L5"],
        ),
      ).toBe(true);
    const infantry = {
      ...trapped,
      units: { a: unit("a", "L6", { kind: "infantry" }) },
    };
    expect(validateRetreatPath(infantry, ["a"], ["L6", "L5"])).toBe(true);
  });

  it("offers either extra loss or direct exit at a blocked edge", () => {
    const current = corridor(["A2"], { a: unit("a", "A2") });
    expect(retreatOptions(current, ["a"])).toMatchObject({
      can_hold: true,
      can_exit: true,
    });
    expect(validateRetreatPath(current, ["a"], ["A2"], true)).toBe(true);
    expect(validateRetreatPath(current, ["a"], ["A2"])).toBe(false);
    expect(suggestedRetreat(current, ["a"])).toEqual({
      path: ["A2"],
      exit: true,
    });
  });

  it("requires a legal on-board retreat before considering a direct edge exit", () => {
    const current = state({ units: { a: unit("a", "A2") } });
    expect(retreatOptions(current, ["a"])).toMatchObject({
      can_hold: false,
      can_exit: false,
    });
    expect(validateRetreatPath(current, ["a"], ["A2"], true)).toBe(false);
    expect(validateRetreatPath(current, ["a"], ["A2", "A1"])).toBe(true);
  });

  it("requires withdrawal through a friendly chain to an edge exit", () => {
    const current = corridor(["C2", "B2", "A2"], {
      a: unit("a", "C2"),
      b: unit("b", "B2"),
      c: unit("c", "A2"),
    });
    expect(retreatOptions(current, ["a"])?.can_hold).toBe(false);
    expect(validateRetreatPath(current, ["a"], ["C2", "B2", "A2"], true)).toBe(
      true,
    );
    expect(suggestedRetreat(current, ["a"])).toEqual({
      path: ["C2", "B2", "A2"],
      exit: true,
    });
    expect(validateRetreatPath(current, ["a"], ["C2"], true)).toBe(false);
  });

  it("does not continue off-board through an empty edge endpoint", () => {
    const current = corridor(["B2", "A2"], { a: unit("a", "B2") });
    expect(validateRetreatPath(current, ["a"], ["B2", "A2"])).toBe(true);
    expect(validateRetreatPath(current, ["a"], ["B2", "A2"], true)).toBe(false);
  });

  it("lets a legal whole stack retreat without budget or activation limits", () => {
    const current = state({
      units: {
        a: unit("a", "L6"),
        b: unit("b", "L6"),
        g: unit("g", "L6", { kind: "general", combat: null }),
      },
      normal_movement: {
        active_unit_ids: [],
        closed_unit_ids: ["a", "b", "g"],
        bonus_unit_ids: [],
      },
    });
    expect(validateRetreatPath(current, ["a", "b", "g"], ["L6", "L5"])).toBe(
      true,
    );
    expect(retreatOptions(current, ["a", "b"])).toBeNull();
  });

  it("permits capture of an unsupported enemy general but preserves supported blockers", () => {
    const current = corridor(["L6", "L5"], {
      a: unit("a", "L6"),
      g: unit("g", "L5", { side: "union", kind: "general", combat: null }),
    });
    expect(validateRetreatPath(current, ["a"], ["L6", "L5"])).toBe(true);
    expect(
      retreatOptions(
        {
          ...current,
          units: {
            ...current.units,
            support: unit("support", "L5", { side: "union" }),
          },
        },
        ["a"],
      )?.can_hold,
    ).toBe(true);
  });

  it("fails closed on unknown, split, duplicate, undeployed, or missing-bundle input", () => {
    const current = state({
      units: { a: unit("a", "L6"), b: unit("b", "L5") },
    });
    for (const ids of [[], ["missing"], ["a", "a"], ["a", "b"]])
      expect(retreatOptions(current, ids)).toBeNull();
    const { terrain: present, ...withoutTerrain } = current;
    expect(present).toBeDefined();
    expect(retreatOptions(withoutTerrain, ["a"])).toBeNull();
    expect(
      retreatOptions(
        { ...current, units: { a: unit("a", "L6", { status: "exited" }) } },
        ["a"],
      ),
    ).toBeNull();
  });

  it("terminates friendly cycles and produces a valid deterministic suggestion across the board", () => {
    const trapped = corridor(["L6", "L5", "M6"], {
      a: unit("a", "L6"),
      b: unit("b", "L5"),
      c: unit("c", "M6"),
    });
    expect(retreatOptions(trapped, ["a"])?.can_hold).toBe(true);
    for (const origin of BOARD_HEXES) {
      const current = state({
        units: Object.fromEntries([
          ["a", unit("a", origin)],
          ...adjacentHexes(origin).map((hex) => [hex, unit(hex, hex)]),
        ]),
      });
      const suggestion = suggestedRetreat(current, ["a"]);
      expect(suggestion).not.toBeNull();
      if (suggestion)
        expect(
          validateRetreatPath(current, ["a"], suggestion.path, suggestion.exit),
        ).toBe(true);
      expect(suggestedRetreat(current, ["a"])).toEqual(suggestion);
    }
  });
});
