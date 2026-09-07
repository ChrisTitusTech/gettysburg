import { BOARD_TERRAIN } from "@gettysburg/content";
import {
  MANDATORY_RULESET_VERSION,
  type GameState,
  type HexCoordinate,
  type UnitState,
} from "@gettysburg/game";

export const RETREAT_COMBAT_ID = "33333333-3333-4333-8333-333333333333";
export type RetreatFixtureName = "chain" | "trapped" | "edge";
export function retreatFixture(name: RetreatFixtureName): GameState {
  const origin: HexCoordinate = name === "edge" ? "A2" : "F5";
  const unit = (
    id: string,
    location: HexCoordinate,
    side: UnitState["side"] = "confederate",
  ): UnitState => ({
    id,
    label: id === "a" ? "Fixture artillery" : id,
    location,
    side,
    kind: "artillery",
    combat: 3,
    movement: 5,
    movement_spent: 5,
    entry_hexes: [],
    entry_turn: null,
    organization: "fixture",
    status: "deployed",
    strength: "full",
    steps_remaining: 2,
  });
  return {
    active_side: "union",
    phase: "combat",
    turn: 1,
    night: false,
    game_id: "11111111-1111-4111-8111-111111111111",
    ruleset_version: MANDATORY_RULESET_VERSION,
    content_revision: "browser-fixture",
    version: 0,
    event_sequence: 0,
    objectives: {},
    victory: { confederate: 0, union: 0, status: "in-progress" },
    terrain: Object.fromEntries(
      Object.entries(BOARD_TERRAIN).map(([hex, terrain]) => [
        hex,
        name === "chain" && ["F4", "F3"].includes(hex)
          ? {
              ...terrain,
              kind: "clear",
              woods: false,
              defense: 0,
              hill_defense: 0,
            }
          : {
              ...terrain,
              kind: "rough_hill",
              woods: true,
              defense: 4,
              hill_defense: 4,
            },
      ]),
    ),
    units: {
      a: unit("a", origin),
      enemy: unit("enemy", name === "edge" ? "B2" : "G5", "union"),
      ...(name === "chain" ? { b: unit("b", "F4") } : {}),
    },
    combats: {
      [RETREAT_COMBAT_ID]: {
        id: RETREAT_COMBAT_ID,
        attackers: ["enemy"],
        defenders: ["a"],
        attacker_hexes: [name === "edge" ? "B2" : "G5"],
        defender_hexes: [origin],
        attacker_loss_allocated: true,
        defender_loss_allocated: true,
        attacker_retreated: true,
        defender_retreated: false,
        status: "pending_choice",
        pending_choice: {
          kind: "retreat",
          side: "confederate",
          unit_ids: ["a"],
        },
        rolls: { attacker: 8, defender: 7 },
        confirmation: {
          result: "attacker_win",
          advance_offered: true,
          attacker_losses: 0,
          defender_losses: 0,
          attacker_modifier: 3,
          defender_modifier: 3,
          attacker_retreat: false,
          defender_retreat: true,
        },
      },
    },
  };
}
