import {
  adjacentHexes,
  BOARD_EDGE_HEXES,
  isHexCoordinate,
} from "./coordinates.js";
import type { HexCoordinate } from "./coordinates.js";
import { eliminateLoneGenerals, isUnsupportedGeneral } from "./generals.js";
import { terrainMovementCost } from "./movement.js";
import { movementStackFits } from "./movement-validation.js";
import type { GameState } from "./protocol.js";
import { enemyZoneOfControl } from "./zoc.js";

interface RetreatMap {
  readonly origin: HexCoordinate;
  readonly friendly: ReadonlySet<HexCoordinate>;
  readonly zoc: ReadonlySet<HexCoordinate>;
  readonly passable: (hex: HexCoordinate) => boolean;
}

// Geometry only: the authoritative caller must authorize the pending combat
// choice and require every retreating counter from this original hex.
function retreatMap(
  state: GameState,
  ids: readonly string[],
): RetreatMap | null {
  if (
    !state.terrain ||
    ids.length === 0 ||
    ids.length > 3 ||
    new Set(ids).size !== ids.length
  )
    return null;
  const settled = { ...state, units: eliminateLoneGenerals(state) };
  const movers = ids.map((id) => settled.units[id]);
  const first = movers[0];
  if (!first || first.location === null || !isHexCoordinate(first.location))
    return null;
  if (
    movers.some(
      (unit) =>
        !unit ||
        unit.status !== "deployed" ||
        unit.side !== first.side ||
        unit.location !== first.location,
    )
  )
    return null;
  const units = movers.filter((unit) => unit !== undefined);
  if (!movementStackFits(units)) return null;
  const movingCombat = units.some((unit) => unit.kind !== "general");
  const friendly = new Set<HexCoordinate>();
  const blocked = new Set<HexCoordinate>();
  for (const unit of Object.values(settled.units)) {
    if (
      unit.status !== "deployed" ||
      unit.location === null ||
      ids.includes(unit.id)
    )
      continue;
    if (unit.side === first.side) friendly.add(unit.location);
    else if (!(movingCombat && isUnsupportedGeneral(settled, unit)))
      blocked.add(unit.location);
  }
  return {
    origin: first.location,
    friendly,
    zoc: enemyZoneOfControl(settled, first.side),
    passable: (hex) =>
      !blocked.has(hex) &&
      terrainMovementCost(
        settled,
        units.map((unit) => unit.kind),
        hex,
      ) !== null,
  };
}

/** Complete reachability, not just an adjacent opening: friendly dead ends do
 * not constitute a retreat. Ignore ZOC priority here; apply it only among viable
 * next steps. Each accepted step then preserves at least one complete route. */
function canFinish(
  map: RetreatMap,
  start: HexCoordinate,
  excluded: ReadonlySet<HexCoordinate>,
): boolean {
  const visited = new Set(excluded);
  const frontier = [start];
  visited.add(start);
  for (const hex of frontier) {
    if (!map.friendly.has(hex) || BOARD_EDGE_HEXES.includes(hex)) return true;
    for (const neighbor of adjacentHexes(hex)) {
      if (visited.has(neighbor) || !map.passable(neighbor)) continue;
      visited.add(neighbor);
      frontier.push(neighbor);
    }
  }
  return false;
}

function nextSteps(
  map: RetreatMap,
  path: readonly HexCoordinate[],
): HexCoordinate[] {
  const visited = new Set(path);
  const viable = adjacentHexes(path.at(-1)!).filter(
    (hex) =>
      !visited.has(hex) && map.passable(hex) && canFinish(map, hex, visited),
  );
  const safe = viable.filter((hex) => !map.zoc.has(hex));
  return safe.length > 0 ? safe : viable;
}

function validPrefix(map: RetreatMap, path: readonly HexCoordinate[]): boolean {
  if (path[0] !== map.origin || path.some((hex) => !isHexCoordinate(hex)))
    return false;
  for (let index = 1; index < path.length; index += 1) {
    if (index > 1 && !map.friendly.has(path[index - 1]!)) return false;
    if (!nextSteps(map, path.slice(0, index)).includes(path[index]!))
      return false;
  }
  return true;
}

export interface RetreatOptions {
  readonly next_hexes: readonly HexCoordinate[];
  readonly can_exit: boolean;
  readonly can_hold: boolean;
  readonly complete: boolean;
}

/** Null means invalid input, never permission to take a trapped-stack loss. */
export function retreatOptions(
  state: GameState,
  ids: readonly string[],
  prefix?: readonly HexCoordinate[],
): RetreatOptions | null {
  const map = retreatMap(state, ids);
  if (map === null) return null;
  const path = prefix ?? [map.origin];
  if (!validPrefix(map, path)) return null;
  const last = path.at(-1)!;
  const complete = path.length > 1 && !map.friendly.has(last);
  const next = complete ? [] : nextSteps(map, path);
  return {
    next_hexes: next,
    can_exit:
      !complete &&
      BOARD_EDGE_HEXES.includes(last) &&
      (path.length > 1 || next.length === 0),
    can_hold: path.length === 1 && next.length === 0,
    complete,
  };
}

export function validateRetreatPath(
  state: GameState,
  ids: readonly string[],
  path: readonly HexCoordinate[],
  exit = false,
): boolean {
  const options = retreatOptions(state, ids, path);
  return options !== null && (exit ? options.can_exit : options.complete);
}

/** A deterministic complete suggestion, not an exhaustive target-path search. */
export function suggestedRetreat(
  state: GameState,
  ids: readonly string[],
): { readonly path: readonly HexCoordinate[]; readonly exit: boolean } | null {
  const map = retreatMap(state, ids);
  if (map === null) return null;
  const path = [map.origin];
  while (true) {
    const last = path.at(-1)!;
    if (path.length > 1 && !map.friendly.has(last))
      return { path, exit: false };
    const next = nextSteps(map, path)[0];
    if (next === undefined)
      return BOARD_EDGE_HEXES.includes(last) ? { path, exit: true } : null;
    path.push(next);
  }
}
