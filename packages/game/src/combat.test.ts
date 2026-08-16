import { describe, expect, it } from "vitest";

import {
  LEGACY_RULESET_VERSION,
  RULESET_VERSION,
  type GameState,
  type Side,
  type UnitState,
} from "./protocol";
import {
  combatFactorModifier,
  combatOpportunities,
  combatSkirmishes,
  currentCombatValue,
  separateOpportunity,
} from "./combat";

function unit(
  id: string,
  side: Side,
  location: UnitState["location"],
  combat: number | null,
): UnitState {
  return {
    combat,
    entry_hexes: [],
    entry_turn: null,
    id,
    kind: combat === null ? "general" : "infantry",
    label: id,
    location,
    movement: 5,
    organization: "test",
    side,
    status: "deployed",
    steps_remaining: 2,
    strength: "full",
  };
}

function state(units: Record<string, UnitState>): GameState {
  return {
    active_side: "confederate",
    combats: {},
    content_revision: "test-content-v1",
    event_sequence: 0,
    game_id: "11111111-1111-4111-8111-111111111111",
    night: false,
    objectives: {},
    phase: "combat",
    ruleset_version: RULESET_VERSION,
    turn: 4,
    units,
    version: 0,
    victory: { confederate: 0, status: "in-progress", union: 0 },
  };
}

describe("combat discovery", () => {
  it("groups same-hex combat units across an adjacent hex pair", () => {
    const current = state({
      heth: unit("heth", "confederate", "L8", 5),
      hill: unit("hill", "confederate", "L8", null),
      pegram: unit("pegram", "confederate", "L8", 2),
      buford: unit("buford", "union", "M9", null),
      devin: unit("devin", "union", "M9", 1),
      gamble: unit("gamble", "union", "M9", 1),
      distant: unit("distant", "union", "A1", 9),
    });

    expect(combatOpportunities(current, "confederate")).toEqual([
      {
        attacker_hexes: ["L8"],
        attacker_modifier: 7,
        attackers: ["heth", "pegram"],
        defender_hexes: ["M9"],
        defender_modifier: 2,
        defenders: ["devin", "gamble"],
        id: "L8-M9",
        requires_separation: false,
      },
    ]);
  });

  it("combines every adjacent attacker stack against one defending hex", () => {
    const current = state({
      heth: unit("heth", "confederate", "L8", 5),
      pegram: unit("pegram", "confederate", "L8", 2),
      mcintosh: unit("mcintosh", "confederate", "N8", 2),
      pender: unit("pender", "confederate", "N8", 4),
      devin: unit("devin", "union", "M9", 1),
      gamble: unit("gamble", "union", "M9", 1),
    });

    expect(combatOpportunities(current, "confederate")).toEqual([
      {
        attacker_hexes: ["L8", "N8"],
        attacker_modifier: 10,
        attackers: ["heth", "pegram", "mcintosh", "pender"],
        defender_hexes: ["M9"],
        defender_modifier: 2,
        defenders: ["devin", "gamble"],
        id: "L8+N8-M9",
        requires_separation: false,
      },
    ]);
  });

  it("separates a dense contact network into independent mandatory battles", () => {
    const current = state({
      k6: unit("k6", "confederate", "K6", 2),
      l6: unit("l6", "confederate", "L6", 1),
      l8: unit("l8", "confederate", "L8", 7),
      m6: unit("m6", "confederate", "M6", 9),
      m8: unit("m8", "confederate", "M8", 6),
      n6: unit("n6", "confederate", "N6", 1),
      n7: unit("n7", "confederate", "N7", 10),
      k7: unit("k7", "union", "K7", 3),
      k8: unit("k8", "union", "K8", 6),
      l7: unit("l7", "union", "L7", 6),
      m7: unit("m7", "union", "M7", 4),
    });

    const skirmishes = combatSkirmishes(current, "confederate");
    expect(skirmishes.map((skirmish) => skirmish.id)).toEqual([
      "K6+L6-K7",
      "L8-K8+L7",
      "M6+M8+N6+N7-M7",
    ]);
    expect(skirmishes.flatMap((skirmish) => skirmish.attackers).sort()).toEqual(
      ["k6", "l6", "l8", "m6", "m8", "n6", "n7"],
    );
    expect(skirmishes.flatMap((skirmish) => skirmish.defenders).sort()).toEqual(
      ["k7", "k8", "l7", "m7"],
    );
    expect(
      skirmishes.every(
        (skirmish) =>
          skirmish.attacker_hexes.length === 1 ||
          skirmish.defender_hexes.length === 1,
      ),
    ).toBe(true);
  });

  it("falls back deterministically when the exact-cover state budget is exhausted", () => {
    const current = state({
      firstAttacker: unit("firstAttacker", "confederate", "K6", 2),
      secondAttacker: unit("secondAttacker", "confederate", "L6", 2),
      firstDefender: unit("firstDefender", "union", "K7", 2),
      secondDefender: unit("secondDefender", "union", "L7", 2),
    });
    const opportunity = combatOpportunities(current, "confederate")[0]!;
    expect(opportunity.requires_separation).toBe(true);
    expect(separateOpportunity(current, opportunity, 0)).toEqual([opportunity]);
  });

  it("keeps one attacker in one battle with every touching defender", () => {
    const current = state({
      attacker: unit("attacker", "confederate", "L7", 4),
      first: unit("first", "union", "K7", 2),
      second: unit("second", "union", "L8", 2),
      third: unit("third", "union", "M7", 2),
    });

    expect(combatSkirmishes(current, "confederate")).toMatchObject([
      {
        attacker_hexes: ["L7"],
        attackers: ["attacker"],
        defender_hexes: ["K7", "L8", "M7"],
        defenders: ["first", "second", "third"],
      },
    ]);
  });

  it("bounds separation work for a long alternating contact line", () => {
    const coordinates = [
      "A1",
      "B1",
      "C1",
      "D1",
      "E1",
      "F1",
      "G1",
      "H1",
      "I1",
      "J1",
      "K1",
      "L1",
      "M1",
      "N1",
      "O1",
      "P1",
      "Q1",
      "R1",
      "S1",
      "T1",
      "U1",
      "U2",
      "T2",
      "S2",
      "R2",
      "Q2",
    ] as const;
    const units = Object.fromEntries(
      coordinates.map((coordinate, index) => [
        `unit-${index}`,
        unit(
          `unit-${index}`,
          index % 2 === 0 ? "confederate" : "union",
          coordinate,
          1,
        ),
      ]),
    );

    const started = performance.now();
    const skirmishes = combatSkirmishes(state(units), "confederate");
    expect(performance.now() - started).toBeLessThan(250);
    expect(
      skirmishes.flatMap((skirmish) => [
        ...skirmish.attackers,
        ...skirmish.defenders,
      ]),
    ).toHaveLength(coordinates.length);
    expect(
      new Set(
        skirmishes.flatMap((skirmish) => [
          ...skirmish.attackers,
          ...skirmish.defenders,
        ]),
      ).size,
    ).toBe(coordinates.length);
    expect(
      skirmishes.every(
        (skirmish) =>
          skirmish.attacker_hexes.length === 1 ||
          skirmish.defender_hexes.length === 1,
      ),
    ).toBe(true);
  });

  it("keeps the exact minimum cover for a contact network above 20 hexes", () => {
    const attackers = [
      "E9",
      "F8",
      "F9",
      "G4",
      "G5",
      "G7",
      "H6",
      "H8",
      "I5",
      "J4",
      "J8",
      "K4",
      "K5",
      "K9",
    ] as const;
    const defenders = [
      "E10",
      "F3",
      "G8",
      "G9",
      "H4",
      "H7",
      "I6",
      "I9",
      "J3",
      "J5",
      "K8",
    ] as const;
    const units = Object.fromEntries([
      ...attackers.map((hex) => [
        `attacker-${hex}`,
        unit(`attacker-${hex}`, "confederate", hex, 1),
      ]),
      ...defenders.map((hex) => [
        `defender-${hex}`,
        unit(`defender-${hex}`, "union", hex, 1),
      ]),
    ]);

    const skirmishes = combatSkirmishes(state(units), "confederate");
    expect(skirmishes).toHaveLength(9);
    expect(
      new Set(
        skirmishes.flatMap((skirmish) => [
          ...skirmish.attackers,
          ...skirmish.defenders,
        ]),
      ).size,
    ).toBe(25);
  });

  it("caps printed combat-factor modifiers at ten", () => {
    const current = state({
      first: unit("first", "confederate", "A1", 6),
      second: unit("second", "confederate", "A1", 5),
    });
    expect(combatFactorModifier(current, ["first", "second"])).toBe(10);
  });

  it.each([
    [2, 1],
    [3, 2],
    [4, 2],
    [5, 3],
    [6, 3],
  ] as const)("reduces combat %i to %i", (full, reduced) => {
    const counter = {
      ...unit("counter", "union", "A1", full),
      reduced_combat: reduced,
      steps_remaining: 1,
      strength: "reduced" as const,
    };
    expect(currentCombatValue(counter, RULESET_VERSION)).toBe(reduced);
    expect(currentCombatValue(counter, LEGACY_RULESET_VERSION)).toBe(full);
  });

  it("derives a missing reduced factor and preserves null or full values", () => {
    const reduced = {
      ...unit("reduced", "union", "A1", 3),
      steps_remaining: 1,
      strength: "reduced" as const,
    };
    expect(currentCombatValue(reduced, RULESET_VERSION)).toBe(2);
    expect(
      currentCombatValue(unit("general", "union", "A1", null), RULESET_VERSION),
    ).toBeNull();
    expect(
      currentCombatValue(unit("full", "union", "A1", 3), RULESET_VERSION),
    ).toBe(3);
  });

  it("removes every participant after a combat is declared", () => {
    const current: GameState = {
      ...state({
        attacker: unit("attacker", "confederate", "A1", 3),
        defender: unit("defender", "union", "B1", 3),
      }),
      combats: {
        existing: {
          attacker_loss_allocated: false,
          attacker_retreated: false,
          attackers: ["attacker"],
          confirmation: null,
          defender_loss_allocated: false,
          defender_retreated: false,
          defenders: ["defender"],
          id: "existing",
          pending_choice: null,
          rolls: null,
          status: "resolved",
        },
      },
    };
    expect(combatOpportunities(current, "confederate")).toEqual([]);
  });
});
