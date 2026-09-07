import type { GameState, UnitState } from "@gettysburg/game";
import { retreatFixture, RETREAT_COMBAT_ID } from "./retreat-fixture";
export const ADVANCE_COMBAT_ID = RETREAT_COMBAT_ID;
export type AdvanceFixtureName = "blocked" | "mixed" | "clear";
export function advanceFixture(name: AdvanceFixtureName): GameState {
  const base = retreatFixture("trapped");
  const a = base.units.a!;
  const b: UnitState = {
    ...a,
    id: "b",
    label: "Fixture infantry",
    kind: "infantry",
  };
  const g: UnitState = {
    ...a,
    id: "g",
    label: "Fixture general",
    kind: "general",
    combat: null,
  };
  return {
    ...base,
    active_side: "confederate",
    objectives: { F4: { controlled_by: "union", value: 2 } },
    units: name === "mixed" ? { a, b, g } : { a },
    terrain:
      name === "clear"
        ? {
            ...base.terrain,
            F4: {
              ...base.terrain!.F4!,
              kind: "clear",
              woods: false,
              defense: 0,
              hill_defense: 0,
            },
          }
        : base.terrain!,
    normal_movement: {
      active_unit_ids: [],
      closed_unit_ids: ["a", "b", "g"],
      bonus_unit_ids: [],
    },
    combats: {
      [ADVANCE_COMBAT_ID]: {
        ...base.combats[ADVANCE_COMBAT_ID]!,
        attackers: name === "mixed" ? ["a", "b"] : ["a"],
        defenders: [],
        attacker_hexes: ["F5"],
        defender_hexes: ["F4"],
        confirmation: null,
        rolls: null,
        pending_choice: {
          kind: "advance",
          side: "confederate",
          eligible_unit_ids: name === "mixed" ? ["a", "b", "g"] : ["a"],
          destination_hexes: ["F4"],
        },
      },
    },
  };
}
