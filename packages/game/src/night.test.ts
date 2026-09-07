import { describe, expect, it } from "vitest";
import { adjacentHexes, BOARD_HEXES } from "./coordinates";
import { normalMovementRange, normalMovementRoute } from "./movement";
import { mandatoryNightWithdrawals } from "./night";
import { planNormalMove } from "./normal-move";
import {
  COMMAND_SCHEMA_VERSION,
  MANDATORY_RULESET_VERSION,
  RULESET_VERSION,
} from "./protocol";
import type { GameState, HexTerrain, UnitState } from "./protocol";
import { reduceGameplayCommand } from "./reducer";

function unit(id: string, patch: Partial<UnitState> = {}): UnitState {
  return {
    id,
    location: "L6",
    side: "confederate",
    kind: "infantry",
    combat: 3,
    movement: 5,
    movement_spent: 4,
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
    phase: "movement",
    night: true,
    turn: 8,
    version: 0,
    event_sequence: 0,
    content_revision: "mandatory-fixture",
    ruleset_version: MANDATORY_RULESET_VERSION,
    objectives: {},
    combats: {},
    terrain: {},
    movement_edges: { roads: [], railroads: [], streams: [] },
    units: {
      a: unit("a"),
      enemy: unit("enemy", { side: "union", location: "L7" }),
    },
    victory: { confederate: 0, union: 0, status: "in-progress" },
    ...patch,
  };
}
function allTerrain(
  kind: HexTerrain["kind"],
  woods: boolean,
): NonNullable<GameState["terrain"]> {
  return Object.fromEntries(
    BOARD_HEXES.map((hex) => [
      hex,
      {
        kind,
        woods,
        defense: 2,
        hill_defense: 0,
        forest_region: null,
        hill_region: null,
      },
    ]),
  );
}
function ids(current: GameState) {
  return mandatoryNightWithdrawals(current, "confederate")?.map(
    (unit) => unit.id,
  );
}
function end(current: GameState) {
  return reduceGameplayCommand(
    current,
    "confederate",
    {
      command_id: "22222222-2222-4222-8222-222222222222",
      expected_version: current.version,
      game_id: current.game_id,
      schema: COMMAND_SCHEMA_VERSION,
      command_name: "endPhase",
      payload: {},
    },
    {
      automaticCombats: [
        {
          combat_id: "33333333-3333-4333-8333-333333333333",
          dice: { attacker: 5, defender: 5 },
        },
      ],
    },
  );
}

describe("mandatory night withdrawal", () => {
  it("requires affordable safe movement and permits combat when terrain makes it unaffordable", () => {
    expect(ids(state())).toEqual(["a"]);
    expect(end(state())).toMatchObject({
      ok: false,
      failure: { error: "phase_invalid" },
    });
    const wooded = state({ terrain: allTerrain("woods", true) });
    expect(ids(wooded)).toEqual([]);
    expect(end(wooded)).toMatchObject({ ok: true, state: { phase: "combat" } });
    expect(
      ids({
        ...wooded,
        units: { ...wooded.units, a: unit("a", { movement_spent: 3 }) },
      }),
    ).toEqual(["a"]);
    expect(end({ ...wooded, ruleset_version: RULESET_VERSION })).toMatchObject({
      ok: false,
      failure: { error: "phase_invalid" },
    });
  });

  it("charges streams and does not use road discounts to leave enemy ZOC", () => {
    const current = state({
      movement_edges: {
        roads: adjacentHexes("L6").map((hex) => ["L6", hex]),
        railroads: [],
        streams: adjacentHexes("L6").map((hex) => ["L6", hex]),
      },
    });
    expect(ids(current)).toEqual([]);
    expect(
      ids({
        ...current,
        units: { ...current.units, a: unit("a", { movement_spent: 3 }) },
      }),
    ).toEqual(["a"]);
  });

  it("distinguishes artillery impassability from affordable infantry movement", () => {
    const current = state({
      terrain: allTerrain("rough_hill", true),
      units: {
        ...state().units,
        a: unit("a", { kind: "artillery", movement_spent: 0 }),
      },
    });
    expect(ids(current)).toEqual([]);
    expect(
      ids({
        ...current,
        units: { ...current.units, a: unit("a", { movement_spent: 0 }) },
      }),
    ).toEqual(["a"]);
  });

  it("finds a complete withdrawal through friendly occupied neighboring hexes", () => {
    const current = state();
    const congested = state({
      units: {
        ...current.units,
        ...Object.fromEntries(
          ["L5", "M6", "K6"].map((location) => [
            location,
            unit(location, { location: location as "L5" | "M6" | "K6" }),
          ]),
        ),
      },
    });
    expect(ids(congested)).toEqual([]);
    expect(
      ids({
        ...congested,
        units: { ...congested.units, a: unit("a", { movement_spent: 3 }) },
      }),
    ).toEqual(["a"]);
  });

  it("uses the exact active stack and its whole-move general bonus", () => {
    const movers = [
      unit("a", { movement: 1, movement_spent: 0 }),
      unit("b", { movement: 1, movement_spent: 0 }),
      unit("g", { kind: "general", combat: null, movement_spent: 0 }),
    ];
    const plan = planNormalMove(undefined, movers);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const current = state({
      terrain: allTerrain("woods", true),
      normal_movement: plan.activation,
      units: {
        enemy: state().units.enemy!,
        ...Object.fromEntries(movers.map((unit) => [unit.id, unit])),
      },
    });
    expect(ids(current)).toEqual(["a", "b", "g"]);
    expect(end(current)).toMatchObject({
      ok: false,
      failure: { message: expect.stringContaining("a (L6), b (L6), g (L6)") },
    });
  });

  it("does not revive closed activations, exhausted counters, or captured generals", () => {
    const current = state({
      normal_movement: {
        active_unit_ids: [],
        closed_unit_ids: ["a"],
        bonus_unit_ids: [],
      },
    });
    expect(ids(current)).toEqual([]);
    expect(
      ids(
        state({
          units: { ...current.units, a: unit("a", { movement_spent: 5 }) },
        }),
      ),
    ).toEqual([]);
    expect(
      ids(
        state({
          units: {
            ...current.units,
            a: unit("a", { kind: "general", combat: null }),
          },
        }),
      ),
    ).toEqual([]);
  });

  it("requires a legal edge exit but cannot count one without its full cost", () => {
    const current = state({
      terrain: allTerrain("rough_hill", true),
      units: {
        a: unit("a", { kind: "artillery", location: "A2" }),
        enemy: unit("enemy", { side: "union", location: "B2" }),
      },
    });
    expect(ids(current)).toEqual(["a"]);
    expect(
      ids({
        ...current,
        units: {
          ...current.units,
          a: { ...current.units.a!, movement_spent: 4.5 },
        },
      }),
    ).toEqual([]);
  });

  it("fails closed on a missing bundle and ignores non-night checks", () => {
    const { movement_edges, ...missing } = state();
    expect(movement_edges).toBeDefined();
    expect(mandatoryNightWithdrawals(missing, "confederate")).toBeNull();
    expect(end(missing)).toMatchObject({
      ok: false,
      failure: { error: "version_unavailable" },
    });
    expect(ids({ ...missing, night: false })).toEqual([]);
  });
});

describe("shared bounded movement range", () => {
  it("agrees with point-to-point weighted routes at every board coordinate", () => {
    const current = state({
      night: false,
      units: { a: unit("a", { movement_spent: 0 }) },
      movement_edges: {
        roads: [
          ["L6", "L5"],
          ["L5", "L4"],
        ],
        railroads: [],
        streams: [["L6", "M6"]],
      },
    });
    const range = normalMovementRange(
      current,
      "confederate",
      ["infantry"],
      current.movement_edges!,
      "L6",
      3,
    );
    for (const destination of BOARD_HEXES) {
      const route = normalMovementRoute(
        current,
        "confederate",
        ["infantry"],
        current.movement_edges!,
        "L6",
        destination,
      );
      expect(range.get(destination)).toBe(
        route && route.cost <= 3 ? route.cost : undefined,
      );
    }
    expect(range.get("L4")).toBe(1);
    expect(range.get("L6")).toBe(0);
  });

  it("rejects invalid budgets and does not exceed half-point boundaries", () => {
    const current = state({
      night: false,
      units: {},
      movement_edges: { roads: [["L6", "L5"]], railroads: [], streams: [] },
    });
    for (const budget of [-1, NaN, Infinity])
      expect(
        normalMovementRange(
          current,
          "confederate",
          ["infantry"],
          current.movement_edges!,
          "L6",
          budget,
        ).size,
      ).toBe(0);
    expect([
      ...normalMovementRange(
        current,
        "confederate",
        ["infantry"],
        current.movement_edges!,
        "L6",
        0.5,
      ),
    ]).toEqual([
      ["L6", 0],
      ["L5", 0.5],
    ]);
  });
});
