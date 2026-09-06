import { describe, expect, it } from "vitest";

import type { HexCoordinate } from "./coordinates";
import { normalMovementRoute, normalMovementStep } from "./movement";
import type { MovementEdges } from "./movement";
import type { GameState, HexTerrain, UnitKind, UnitState } from "./protocol";

const emptyEdges: MovementEdges = { roads: [], railroads: [], streams: [] };
const clear: HexTerrain = {
  defense: 0,
  forest_region: null,
  hill_defense: 0,
  hill_region: null,
  kind: "clear",
  woods: false,
};
const enemy: UnitState = {
  combat: 3,
  entry_hexes: [],
  entry_turn: null,
  id: "enemy",
  kind: "infantry",
  label: "Enemy",
  location: "C2",
  movement: 5,
  organization: "fixture",
  side: "union",
  status: "deployed",
  steps_remaining: 2,
  strength: "full",
};
const base: GameState = {
  active_side: "confederate",
  combats: {},
  content_revision: "calculator-fixture",
  event_sequence: 0,
  game_id: "11111111-1111-4111-8111-111111111111",
  night: false,
  objectives: {},
  phase: "movement",
  ruleset_version: "calculator-fixture",
  turn: 1,
  units: {},
  version: 0,
  victory: { confederate: 0, status: "in-progress", union: 0 },
};

function step(
  terrain: Partial<HexTerrain> = {},
  edges = emptyEdges,
  state = base,
  kinds: readonly UnitKind[] = ["infantry"],
) {
  return normalMovementStep(
    { ...state, terrain: { B2: { ...clear, ...terrain } } },
    "confederate",
    kinds,
    edges,
    "A2",
    "B2",
  );
}

describe("mandatory movement step calculator (not yet activated)", () => {
  it.each(["clear", "hill", "town"] as const)(
    "charges one for ordinary %s",
    (kind) => expect(step({ kind })?.cost).toBe(1),
  );

  it("adds woods and rough-height costs independently", () => {
    expect(step({ kind: "woods", woods: true })?.cost).toBe(2);
    expect(step({ kind: "rough_hill" })?.cost).toBe(2);
    expect(step({ kind: "rough_hill", woods: true })?.cost).toBe(3);
  });

  it("adds stream and enemy-control surcharges to wooded rough terrain", () => {
    expect(
      step(
        { kind: "rough_hill", woods: true },
        { ...emptyEdges, streams: [["B2", "A2"]] },
        { ...base, units: { enemy } },
      ),
    ).toEqual({ cost: 5, road: false, terrain: 3, stream: 1, zoc: 1 });
  });

  it.each(["roads", "railroads"] as const)(
    "charges half a point on connected %s in either direction",
    (kind) => {
      const edges = {
        ...emptyEdges,
        [kind]: [["B2", "A2"]],
        streams: [["A2", "B2"]],
      } as MovementEdges;
      expect(step({ kind: "rough_hill", woods: true }, edges)).toEqual({
        cost: 0.5,
        road: true,
        terrain: 0.5,
        stream: 0,
        zoc: 0,
      });
      expect(
        normalMovementStep(base, "confederate", ["infantry"], edges, "B2", "A2")
          ?.cost,
      ).toBe(0.5);
    },
  );

  it("does not infer a connection from unrelated roads or town terrain", () => {
    const edges: MovementEdges = {
      ...emptyEdges,
      roads: [
        ["A1", "A2"],
        ["B2", "B3"],
      ],
    };
    expect(step({ kind: "town" }, edges)?.cost).toBe(1);
    expect(step({ woods: true }, edges)?.cost).toBe(2);
  });

  it("disables road savings both entering and leaving enemy control", () => {
    const state = { ...base, units: { enemy } };
    const edges: MovementEdges = {
      ...emptyEdges,
      roads: [["A2", "B2"]],
      streams: [["A2", "B2"]],
    };
    expect(step({ woods: true }, edges, state)?.cost).toBe(4);
    expect(
      normalMovementStep(state, "confederate", ["infantry"], edges, "B2", "A2")
        ?.cost,
    ).toBe(2);
  });

  it("rejects direct enemy-ZOC transitions and all night entry", () => {
    const state = { ...base, units: { enemy } };
    expect(
      normalMovementStep(
        state,
        "confederate",
        ["infantry"],
        emptyEdges,
        "B1",
        "B2",
      ),
    ).toBeNull();
    expect(step({}, emptyEdges, { ...state, night: true })).toBeNull();
    expect(
      normalMovementStep(
        { ...state, night: true },
        "confederate",
        ["infantry"],
        emptyEdges,
        "B2",
        "A2",
      )?.cost,
    ).toBe(1);
  });

  it("ignores generals, off-board enemies, and friendly units for enemy ZOC", () => {
    for (const unit of [
      { ...enemy, kind: "general" as const },
      { ...enemy, status: "reinforcement" as const, location: null },
      { ...enemy, side: "confederate" as const },
    ])
      expect(
        step({}, emptyEdges, { ...base, units: { enemy: unit } })?.cost,
      ).toBe(1);
  });

  it("prohibits artillery on wooded rough hills even on roads", () => {
    const edges: MovementEdges = { ...emptyEdges, roads: [["A2", "B2"]] };
    expect(
      step({ kind: "rough_hill", woods: true }, edges, base, [
        "general",
        "artillery",
      ]),
    ).toBeNull();
    expect(
      step({ kind: "rough_hill" }, emptyEdges, base, ["artillery"])?.cost,
    ).toBe(2);
    expect(step({ woods: true }, emptyEdges, base, ["artillery"])?.cost).toBe(
      2,
    );
  });

  it("allows friendly transit but not enemy occupancy", () => {
    expect(
      step({}, emptyEdges, {
        ...base,
        units: { enemy: { ...enemy, location: "B2" } },
      }),
    ).toBeNull();
    expect(
      step({}, emptyEdges, {
        ...base,
        units: { enemy: { ...enemy, location: "B2", side: "confederate" } },
      })?.cost,
    ).toBe(1);
  });

  it("rejects jumps, no-op steps, empty movers, and malformed coordinates", () => {
    for (const destination of ["C4", "A2", "Z99"] as HexCoordinate[]) {
      expect(
        normalMovementStep(
          base,
          "confederate",
          ["infantry"],
          emptyEdges,
          "A2",
          destination,
        ),
      ).toBeNull();
    }
    expect(step({}, emptyEdges, base, [])).toBeNull();
  });
});

describe("least-cost movement routes", () => {
  it("chooses a longer cheap road over a one-step wooded rough hill entry", () => {
    const state = {
      ...base,
      terrain: { B2: { ...clear, kind: "rough_hill" as const, woods: true } },
    };
    const edges: MovementEdges = {
      ...emptyEdges,
      roads: [
        ["A2", "A3"],
        ["A3", "B2"],
      ],
    };
    expect(
      normalMovementRoute(
        state,
        "confederate",
        ["infantry"],
        edges,
        "A2",
        "B2",
      ),
    ).toEqual({ cost: 1, path: ["A2", "A3", "B2"] });
  });

  it("selects equal-cost paths deterministically regardless of edge order", () => {
    const roads: MovementEdges["roads"] = [
      ["A1", "A2"],
      ["A2", "B2"],
      ["A1", "B1"],
      ["B1", "B2"],
    ];
    const first = normalMovementRoute(
      base,
      "confederate",
      ["infantry"],
      { ...emptyEdges, roads },
      "A1",
      "B2",
    );
    const second = normalMovementRoute(
      base,
      "confederate",
      ["infantry"],
      { ...emptyEdges, roads: [...roads].reverse() },
      "A1",
      "B2",
    );
    expect(first).toEqual({ cost: 1, path: ["A1", "B1", "B2"] });
    expect(second).toEqual(first);
  });

  it("returns no route to occupied, prohibited, or night-controlled targets", () => {
    const state = { ...base, night: true, units: { enemy } };
    for (const target of ["C2", "B2"] as const) {
      expect(
        normalMovementRoute(
          state,
          "confederate",
          ["infantry"],
          emptyEdges,
          "A2",
          target,
        ),
      ).toBeNull();
    }
    expect(
      normalMovementRoute(
        {
          ...base,
          terrain: { B2: { ...clear, kind: "rough_hill", woods: true } },
        },
        "confederate",
        ["artillery"],
        emptyEdges,
        "A2",
        "B2",
      ),
    ).toBeNull();
  });

  it("can leave enemy control through safe ground before re-entering", () => {
    const state = { ...base, units: { enemy } };
    const route = normalMovementRoute(
      state,
      "confederate",
      ["infantry"],
      emptyEdges,
      "B1",
      "B2",
    );
    expect(route?.cost).toBe(3);
    expect(route?.path.length).toBe(3);
    expect(
      normalMovementStep(
        state,
        "confederate",
        ["infantry"],
        emptyEdges,
        "B1",
        "B2",
      ),
    ).toBeNull();
  });

  it("returns an exact zero-cost no-op and rejects invalid endpoints", () => {
    expect(
      normalMovementRoute(
        base,
        "confederate",
        ["infantry"],
        emptyEdges,
        "A2",
        "A2",
      ),
    ).toEqual({ cost: 0, path: ["A2"] });
    expect(
      normalMovementRoute(
        base,
        "confederate",
        ["infantry"],
        emptyEdges,
        "Z99" as HexCoordinate,
        "A2",
      ),
    ).toBeNull();
    expect(
      normalMovementRoute(base, "confederate", [], emptyEdges, "A2", "A2"),
    ).toBeNull();
  });

  it("is immutable and reports the sum of its legal steps", () => {
    const state = { ...base, terrain: { A2: { ...clear, woods: true } } };
    const before = JSON.stringify(state);
    const route = normalMovementRoute(
      state,
      "confederate",
      ["infantry"],
      emptyEdges,
      "A1",
      "C4",
    );
    expect(route).not.toBeNull();
    const total = route!.path
      .slice(1)
      .reduce(
        (cost, coordinate, index) =>
          cost +
          normalMovementStep(
            state,
            "confederate",
            ["infantry"],
            emptyEdges,
            route!.path[index]!,
            coordinate,
          )!.cost,
        0,
      );
    expect(route!.cost).toBe(total);
    expect(JSON.stringify(state)).toBe(before);
  });
});
