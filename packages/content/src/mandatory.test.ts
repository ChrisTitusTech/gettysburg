import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  BOARD_EDGE_HEXES,
  BOARD_HEXES,
  MANDATORY_RULESET_VERSION,
  prepareReinforcement,
  type HexCoordinate,
} from "@gettysburg/game";
import {
  createMandatoryInitialState,
  MANDATORY_CONTENT_REVISION,
  MANDATORY_MOVEMENT_EDGES,
  OFF_BOARD_ROUTE_ENTRIES,
} from "./mandatory";
import { SCENARIO_CONTENT_REVISION, SCENARIO_UNITS } from "./scenario";
import { BOARD_TERRAIN } from "./terrain";

describe("pinned mandatory Scenario Five content", () => {
  it("has a distinct revision and complete initial state", () => {
    const state = createMandatoryInitialState("fixture");
    expect(state.ruleset_version).toBe(MANDATORY_RULESET_VERSION);
    expect(state.content_revision).toBe(MANDATORY_CONTENT_REVISION);
    expect(state.content_revision).not.toBe(SCENARIO_CONTENT_REVISION);
    expect(Object.keys(state.terrain!).sort()).toEqual([...BOARD_HEXES].sort());
    expect(Object.keys(state.units)).toHaveLength(82);
    expect(
      Object.values(state.units).filter((u) => u.status === "deployed"),
    ).toHaveLength(5);
    expect(state).toMatchObject({
      active_side: "union",
      phase: "movement",
      turn: 1,
      night: false,
      event_sequence: 0,
      version: 0,
      normal_movement: {
        active_unit_ids: [],
        closed_unit_ids: [],
        bonus_unit_ids: [],
      },
      victory: { union: 16, confederate: 0, status: "in-progress" },
    });
    expect(Object.keys(state.objectives)).toHaveLength(8);
    for (const source of SCENARIO_UNITS) {
      expect(state.units[source.id]).toMatchObject({
        entry_hexes: source.entry_hexes,
        entry_turn: source.entry_turn,
        location: source.setup_hex,
        combat: source.combat,
        movement: source.movement,
        movement_spent: 0,
        reduced_combat: source.reduced_combat,
      });
    }
  });

  it("pins every terrain, route, setup, schedule, factor, and objective", () => {
    const hash = createHash("sha256")
      .update(
        JSON.stringify(createMandatoryInitialState("content-fingerprint")),
      )
      .digest("hex");
    // Deliberately not an updateable snapshot: investigate changes and introduce
    // a new immutable revision instead of reinterpreting existing games.
    expect(hash).toBe(
      "25654bccdce6a2a6c8deb4e0ec160eb7763453bf1cc3f6cedeb2a1216e87e31b",
    );
  });

  it("shares no mutable state with another game or the content exports", () => {
    const first = createMandatoryInitialState("one");
    const baseline = structuredClone(first);
    Object.assign(first.terrain!.A1!, { woods: false });
    Object.assign(first.movement_edges!.roads[0]!, { 0: "W11" });
    Object.assign(first.units["u-barlow"]!.entry_hexes, { 0: "W11" });
    Object.assign(first.normal_movement!.active_unit_ids, { 0: "u-barlow" });
    expect(createMandatoryInitialState("one")).toEqual(baseline);
    expect(BOARD_TERRAIN.A1.woods).toBe(true);
    expect(MANDATORY_MOVEMENT_EDGES.roads[0]).toEqual(["A2", "B2"]);
  });

  it("records only unique boundary crossings attached to an on-board route", () => {
    expect(new Set(OFF_BOARD_ROUTE_ENTRIES).size).toBe(9);
    for (const hex of OFF_BOARD_ROUTE_ENTRIES) {
      expect(BOARD_EDGE_HEXES).toContain(hex);
      expect(
        [
          ...MANDATORY_MOVEMENT_EDGES.roads,
          ...MANDATORY_MOVEMENT_EDGES.railroads,
        ].some(([a, b]) => a === hex || b === hex),
      ).toBe(true);
    }
    // These scheduled entries have not been relocated to fit the artwork.
    expect(OFF_BOARD_ROUTE_ENTRIES).not.toContain("I11");
    expect(OFF_BOARD_ROUTE_ENTRIES).not.toContain("W10");
  });

  it.each([
    ["A1", 2],
    ["A8", 1],
    ["I11", 2],
    ["S1", 0.5],
    ["W7", 0.5],
    ["W10", 2],
  ] as const)("charges the actual scheduled %s entry cost", (hex, cost) => {
    const initial = createMandatoryInitialState("fixture");
    const arrival = {
      ...initial.units["u-barlow"]!,
      entry_hexes: [hex],
      entry_turn: 1,
    };
    const state = { ...initial, units: { [arrival.id]: arrival } };
    const result = prepareReinforcement(state, "union", [arrival.id], hex);
    expect(result).toMatchObject({ ok: true, cost });
  });

  it.each(OFF_BOARD_ROUTE_ENTRIES)(
    "discounts a legal alternate road/rail entry at %s",
    (hex) => {
      const initial = createMandatoryInitialState("fixture");
      const arrival = {
        ...initial.units["u-barlow"]!,
        entry_hexes: [hex as HexCoordinate],
        entry_turn: 1,
      };
      expect(
        prepareReinforcement(
          { ...initial, units: { [arrival.id]: arrival } },
          "union",
          [arrival.id],
          hex,
        ),
      ).toMatchObject({ ok: true, cost: 0.5 });
    },
  );
});
