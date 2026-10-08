import { adjacentHexes, isHexCoordinate } from "./coordinates.js";
import type { HexCoordinate } from "./coordinates.js";
import type { GameState, MovementEdges, Side, UnitKind } from "./protocol.js";
import { enemyZoneOfControl } from "./zoc.js";
import { hasCombatSupport, isUnsupportedGeneral } from "./generals.js";
import {
  WHOLE_POINT_RULESET_VERSION,
  FLAT_MOVEMENT_RULESET_VERSION,
} from "./protocol.js";

export type { MovementEdges } from "./protocol.js";

export function roadMovementCost(state: GameState): number {
  return [WHOLE_POINT_RULESET_VERSION, FLAT_MOVEMENT_RULESET_VERSION].includes(
    state.ruleset_version,
  )
    ? 1
    : 0.5;
}

export interface MovementRoute {
  readonly path: readonly HexCoordinate[];
  readonly cost: number;
}

export interface MovementStep {
  readonly cost: number;
  readonly road: boolean;
  readonly terrain: number;
  readonly stream: number;
  readonly zoc: number;
}

/** Terrain entry only; roads, streams, and ZOC are applied by the caller. */
export function terrainMovementCost(
  state: GameState,
  kinds: readonly UnitKind[],
  destination: HexCoordinate,
): number | null {
  const terrain = state.terrain?.[destination];
  const woods = terrain?.woods === true || terrain?.kind === "woods";
  const rough = terrain?.kind === "rough_hill";
  return woods && rough && kinds.includes("artillery")
    ? null
    : state.ruleset_version === FLAT_MOVEMENT_RULESET_VERSION
      ? 1
      : 1 + Number(woods) + Number(rough);
}

function linked(
  edges: MovementEdges["roads"],
  origin: HexCoordinate,
  destination: HexCoordinate,
): boolean {
  return edges.some(
    ([a, b]) =>
      (a === origin && b === destination) ||
      (b === origin && a === destination),
  );
}

// Movement geometry only: the reducer must also check authorization, activation,
// general accompaniment, remaining budget, and legal endpoint stacks. This
// calculator is not enabled for existing rulesets by merely importing it.
function stepCalculator(
  state: GameState,
  side: Side,
  kinds: readonly UnitKind[],
  edges: MovementEdges,
) {
  const zoc = enemyZoneOfControl(state, side);
  const movingCombat = kinds.some((kind) => kind !== "general");
  const occupied = new Set(
    Object.values(state.units).flatMap((unit) =>
      unit.side !== side &&
      unit.status === "deployed" &&
      unit.location !== null &&
      // A combat counter captures an unsupported general on its adjacent
      // approach, before it can enter that general's vacated hex.
      !(movingCombat && isUnsupportedGeneral(state, unit))
        ? [unit.location]
        : [],
    ),
  );
  return (
    origin: HexCoordinate,
    destination: HexCoordinate,
  ): MovementStep | null => {
    if (
      kinds.length === 0 ||
      !isHexCoordinate(origin) ||
      !isHexCoordinate(destination) ||
      !adjacentHexes(origin).includes(destination) ||
      occupied.has(destination) ||
      (!movingCombat &&
        zoc.has(origin) &&
        !hasCombatSupport(state, side, origin)) ||
      (zoc.has(destination) && (state.night || zoc.has(origin)))
    ) {
      return null;
    }
    const terrainCost = terrainMovementCost(state, kinds, destination);
    if (terrainCost === null) return null;
    const road =
      !zoc.has(origin) &&
      !zoc.has(destination) &&
      (linked(edges.roads, origin, destination) ||
        linked(edges.railroads, origin, destination));
    if (road) {
      const cost = roadMovementCost(state);
      return { cost, road: true, terrain: cost, stream: 0, zoc: 0 };
    }
    const flat = state.ruleset_version === FLAT_MOVEMENT_RULESET_VERSION;
    const streamCost = flat
      ? 0
      : Number(linked(edges.streams, origin, destination));
    const zocCost = flat ? 0 : Number(zoc.has(destination));
    return {
      cost: terrainCost + streamCost + zocCost,
      road: false,
      terrain: terrainCost,
      stream: streamCost,
      zoc: zocCost,
    };
  };
}

export function normalMovementStep(
  state: GameState,
  side: Side,
  kinds: readonly UnitKind[],
  edges: MovementEdges,
  origin: HexCoordinate,
  destination: HexCoordinate,
): MovementStep | null {
  return stepCalculator(state, side, kinds, edges)(origin, destination);
}

// Dijkstra, not shortest hex count: a longer connected road can be cheaper.
// Positive half-integer weights are exact in JS; stable insertion/neighbor
// order preserves historical routes. V6 charges one per legal hex and breaks
// equal-length ties by distance from the origin-to-target line.
export function normalMovementRoute(
  state: GameState,
  side: Side,
  kinds: readonly UnitKind[],
  edges: MovementEdges,
  origin: HexCoordinate,
  destination: HexCoordinate,
): MovementRoute | null {
  if (
    kinds.length === 0 ||
    !isHexCoordinate(origin) ||
    !isHexCoordinate(destination)
  )
    return null;
  const { costs, previous } = searchMovement(
    state,
    side,
    kinds,
    edges,
    origin,
    Infinity,
    destination,
  );
  const cost = costs.get(destination);
  if (cost === undefined) return null;
  const path = [destination];
  let parent = previous.get(destination);
  while (parent !== undefined) {
    path.push(parent);
    parent = previous.get(parent);
  }
  return { path: path.reverse(), cost };
}

/** Reachable hexes and exact costs, including the origin at zero. The caller
 * still validates legal endpoint stacks and activation, as with routes. */
export function normalMovementRange(
  state: GameState,
  side: Side,
  kinds: readonly UnitKind[],
  edges: MovementEdges,
  origin: HexCoordinate,
  budget: number,
): ReadonlyMap<HexCoordinate, number> {
  if (
    kinds.length === 0 ||
    !isHexCoordinate(origin) ||
    !Number.isFinite(budget) ||
    budget < 0
  )
    return new Map();
  return searchMovement(state, side, kinds, edges, origin, budget).costs;
}

// Integer coordinates proportional to the board's staggered hex centers.
// Squared cross products rank distance to the origin/target line without
// floating-point tie instability. The constant scale is common to every path.
function lineDeviation(
  origin: HexCoordinate,
  destination: HexCoordinate,
  coordinate: HexCoordinate,
): number {
  const point = (hex: HexCoordinate) => {
    const x = hex.charCodeAt(0) - 65;
    return { x, y: 2 * (Number(hex.slice(1)) - 1) + (x % 2) };
  };
  const a = point(origin);
  const b = point(destination);
  const c = point(coordinate);
  return ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) ** 2;
}

function searchMovement(
  state: GameState,
  side: Side,
  kinds: readonly UnitKind[],
  edges: MovementEdges,
  origin: HexCoordinate,
  budget: number,
  destination?: HexCoordinate,
) {
  const step = stepCalculator(state, side, kinds, edges);
  const costs = new Map<HexCoordinate, number>([[origin, 0]]);
  const previous = new Map<HexCoordinate, HexCoordinate>();
  const deviations = new Map<HexCoordinate, number>([[origin, 0]]);
  const direct =
    state.ruleset_version === FLAT_MOVEMENT_RULESET_VERSION &&
    destination !== undefined;
  const frontier = new Set<HexCoordinate>([origin]);
  const visited = new Set<HexCoordinate>();
  while (frontier.size > 0) {
    let current = origin;
    let cheapest = Infinity;
    for (const candidate of frontier) {
      const cost = costs.get(candidate) ?? Infinity;
      if (
        cost < cheapest ||
        (direct &&
          cost === cheapest &&
          deviations.get(candidate)! < deviations.get(current)!)
      ) {
        current = candidate;
        cheapest = cost;
      }
    }
    if (current === destination) break;
    frontier.delete(current);
    visited.add(current);
    for (const neighbor of adjacentHexes(current)) {
      if (visited.has(neighbor)) continue;
      const move = step(current, neighbor);
      if (move === null) continue;
      const cost = cheapest + move.cost;
      const deviation =
        deviations.get(current)! +
        (direct ? lineDeviation(origin, destination, neighbor) : 0);
      const knownCost = costs.get(neighbor) ?? Infinity;
      if (
        cost > budget ||
        cost > knownCost ||
        (cost === knownCost &&
          !(direct && deviation < (deviations.get(neighbor) ?? Infinity)))
      )
        continue;
      costs.set(neighbor, cost);
      deviations.set(neighbor, deviation);
      previous.set(neighbor, current);
      frontier.add(neighbor);
    }
  }
  return { costs, previous };
}
