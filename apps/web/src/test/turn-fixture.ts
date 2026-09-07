import { BOARD_TERRAIN } from "@gettysburg/content";
import {
  MANDATORY_RULESET_VERSION,
  type GameState,
  type UnitState,
} from "@gettysburg/game";
export type TurnFixtureName =
  "entry" | "blocked-entry" | "congested" | "night" | "trapped-night";
export function turnFixture(name: TurnFixtureName): GameState {
  const night = name === "night" || name === "trapped-night";
  const a: UnitState = {
    id: "a",
    label: "Fixture infantry",
    side: "confederate",
    location: night ? "F5" : null,
    kind: name === "trapped-night" ? "artillery" : "infantry",
    combat: 3,
    movement: night ? 1 : 5,
    entry_hexes: night ? [] : ["A2"],
    entry_turn: night ? null : 2,
    organization: "fixture",
    status: night ? "deployed" : "reinforcement",
    strength: "full",
    steps_remaining: 2,
  };
  const g: UnitState = {
    ...a,
    id: "g",
    label: "Fixture general",
    kind: "general",
    combat: null,
    movement: 10,
    steps_remaining: 1,
  };
  return {
    game_id: "11111111-1111-4111-8111-111111111111",
    content_revision: "browser-fixture",
    ruleset_version: MANDATORY_RULESET_VERSION,
    turn: night ? 8 : 2,
    active_side: "confederate",
    phase: "movement",
    night,
    version: 0,
    event_sequence: 0,
    combats: {},
    objectives: {},
    victory: { confederate: 0, union: 0, status: "in-progress" },
    terrain: Object.fromEntries(
      Object.entries(BOARD_TERRAIN).map(([hex, terrain]) => [
        hex,
        {
          ...terrain,
          kind: name === "trapped-night" ? "rough_hill" : "clear",
          woods: name === "trapped-night",
          defense: 0,
          hill_defense: 0,
        },
      ]),
    ),
    movement_edges: {
      roads: [],
      railroads: [],
      streams: [],
      entry_roads: ["A2"],
    },
    units: night
      ? {
          a,
          enemy: {
            ...a,
            id: "enemy",
            label: "Enemy",
            side: "union",
            kind: "infantry",
            location: "G5",
          },
        }
      : {
          a,
          g,
          later: { ...a, id: "later", label: "Later arrival", entry_turn: 3 },
          ...(name === "blocked-entry" || name === "congested"
            ? {
                occupant: {
                  ...a,
                  id: "occupant",
                  label: "Occupant",
                  side: name === "blocked-entry" ? "union" : "confederate",
                  location: "A2",
                  status: "deployed",
                },
              }
            : {}),
        },
  };
}
