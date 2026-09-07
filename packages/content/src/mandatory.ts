import {
  MANDATORY_RULESET_VERSION,
  type GameState,
  type HexCoordinate,
  type MovementEdges,
} from "@gettysburg/game";
import { SCENARIO_HEXES, SCENARIO_UNITS } from "./scenario.js";
import { BOARD_TERRAIN } from "./terrain.js";
import { RAIL_LINKS, ROAD_LINKS, STREAM_CROSSINGS } from "./terrain-edges.js";

// Never repurpose this revision after activation. Its complete initial-state
// fingerprint is pinned in mandatory.test.ts; changed content needs a new pair.
export const MANDATORY_CONTENT_REVISION = "gettysburg-mandatory-board-v1";

// Explicit painted road/rail crossings of the outer boundary, not every edge
// hex with an on-board route. See TERRAIN_CONNECTIONS.md for visual estimates.
export const OFF_BOARD_ROUTE_ENTRIES = [
  "A2",
  "A7",
  "H11",
  "O11",
  "Q11",
  "S1",
  "U1",
  "W7",
  "W11",
] as const satisfies readonly HexCoordinate[];

export const MANDATORY_MOVEMENT_EDGES: MovementEdges = {
  entry_roads: OFF_BOARD_ROUTE_ENTRIES,
  roads: ROAD_LINKS,
  railroads: RAIL_LINKS,
  streams: STREAM_CROSSINGS,
};

/** Complete, isolated turn-zero snapshot for creation and deterministic replay.
 * Importing it does not register or enable the ruleset on the server. */
export function createMandatoryInitialState(gameId: string): GameState {
  return structuredClone({
    active_side: "union",
    combats: {},
    content_revision: MANDATORY_CONTENT_REVISION,
    terrain: BOARD_TERRAIN,
    movement_edges: MANDATORY_MOVEMENT_EDGES,
    normal_movement: {
      active_unit_ids: [],
      closed_unit_ids: [],
      bonus_unit_ids: [],
    },
    event_sequence: 0,
    game_id: gameId,
    night: false,
    objectives: Object.fromEntries(
      SCENARIO_HEXES.filter((hex) => hex.objective_value !== null).map(
        (hex) => [
          hex.coordinate,
          { controlled_by: "union" as const, value: hex.objective_value! },
        ],
      ),
    ),
    phase: "movement",
    ruleset_version: MANDATORY_RULESET_VERSION,
    turn: 1,
    units: Object.fromEntries(
      SCENARIO_UNITS.map((unit) => [
        unit.id,
        {
          combat: unit.combat,
          entry_hexes: unit.entry_hexes,
          entry_turn: unit.entry_turn,
          id: unit.id,
          kind: unit.kind,
          label: unit.label,
          location: unit.setup_hex,
          movement: unit.movement,
          movement_spent: 0,
          organization: unit.organization,
          reduced_combat: unit.reduced_combat,
          side: unit.side,
          status: unit.setup_hex === null ? "reinforcement" : "deployed",
          steps_remaining: unit.kind === "general" || unit.combat === 1 ? 1 : 2,
          strength: "full",
        },
      ]),
    ),
    version: 0,
    victory: { confederate: 0, status: "in-progress", union: 16 },
  });
}
