import { describe, expect, it } from "vitest";

import type { GameState, Side, UnitState } from "./protocol";
import {
  enemyZoneOfControl,
  nightMovementIsLegal,
  nightMovementPath,
} from "./zoc";

function unit(
  id: string,
  side: Side,
  location: UnitState["location"],
  kind: UnitState["kind"] = "infantry",
): UnitState {
  return {
    combat: kind === "general" ? null : 3,
    entry_hexes: [],
    entry_turn: null,
    id,
    kind,
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

function state(night: boolean): GameState {
  return {
    active_side: "confederate",
    combats: {},
    content_revision: "test-content-v1",
    event_sequence: 0,
    game_id: "11111111-1111-4111-8111-111111111111",
    night,
    objectives: {},
    phase: "movement",
    ruleset_version: "phase-2-tabletop-v1",
    turn: night ? 8 : 7,
    units: {
      attacker: unit("attacker", "confederate", "L6"),
      defender: unit("defender", "union", "J5"),
      general: unit("general", "union", "M6", "general"),
    },
    version: 0,
    victory: { confederate: 0, status: "in-progress", union: 0 },
  };
}

describe("enemy zones of control", () => {
  it("uses deployed enemy combat units but not generals", () => {
    const controlled = enemyZoneOfControl(state(true), "confederate");
    expect(controlled.has("K6")).toBe(true);
    expect(controlled.has("L6")).toBe(false);
  });

  it("stops a night route before its first enemy-controlled hex", () => {
    const current = state(true);
    expect(nightMovementPath(current, "confederate", "L6", "J6")).toEqual([
      "L6",
      "K7",
    ]);
    expect(nightMovementIsLegal(current, "confederate", "L6", "K6")).toBe(
      false,
    );
    expect(nightMovementIsLegal(current, "confederate", "L6", "M7")).toBe(true);
  });

  it("does not restrict the same route during a day turn", () => {
    expect(nightMovementIsLegal(state(false), "confederate", "L6", "K6")).toBe(
      true,
    );
  });
});
