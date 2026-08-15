import { describe, expect, it } from "vitest";

import type { GameState, Side, UnitState } from "./protocol";
import { combatFactorModifier, combatOpportunities } from "./combat";

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
    ruleset_version: "phase-2-tabletop-v1",
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

  it("caps printed combat-factor modifiers at ten", () => {
    const current = state({
      first: unit("first", "confederate", "A1", 6),
      second: unit("second", "confederate", "A1", 5),
    });
    expect(combatFactorModifier(current, ["first", "second"])).toBe(10);
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
