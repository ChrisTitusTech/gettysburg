import { adjacentHexes, isHexCoordinate } from "./coordinates.js";
import type { HexCoordinate } from "./coordinates.js";
import type { GameState, MovementEdges, Side, UnitKind } from "./protocol.js";
import { enemyZoneOfControl } from "./zoc.js";
import { hasCombatSupport, isUnsupportedGeneral } from "./generals.js";

export type { MovementEdges } from "./protocol.js";

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
    if (road) return { cost: 0.5, road: true, terrain: 0.5, stream: 0, zoc: 0 };
    const streamCost = Number(linked(edges.streams, origin, destination));
    const zocCost = Number(zoc.has(destination));
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
// order breaks equal-cost ties without relying on unit or edge array order.
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
  const frontier = new Set<HexCoordinate>([origin]);
  const visited = new Set<HexCoordinate>();
  while (frontier.size > 0) {
    let current = origin;
    let cheapest = Infinity;
    for (const candidate of frontier) {
      const cost = costs.get(candidate) ?? Infinity;
      if (cost < cheapest) {
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
      if (cost > budget || cost >= (costs.get(neighbor) ?? Infinity)) continue;
      costs.set(neighbor, cost);
      previous.set(neighbor, current);
      frontier.add(neighbor);
    }
  }
  return { costs, previous };
}
