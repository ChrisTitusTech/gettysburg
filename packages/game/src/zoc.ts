import { adjacentHexes, shortestHexPath } from "./coordinates.js";
import type { HexCoordinate } from "./coordinates.js";
import type { GameState, Side } from "./protocol.js";

export function enemyZoneOfControl(
  state: GameState,
  movingSide: Side,
): ReadonlySet<HexCoordinate> {
  const controlled = new Set<HexCoordinate>();
  for (const unit of Object.values(state.units)) {
    if (
      unit.side === movingSide ||
      unit.kind === "general" ||
      unit.status !== "deployed" ||
      unit.location === null
    ) {
      continue;
    }
    for (const coordinate of adjacentHexes(unit.location)) {
      controlled.add(coordinate);
    }
  }
  return controlled;
}

export function isEnemyZoneOfControl(
  state: GameState,
  movingSide: Side,
  coordinate: HexCoordinate,
): boolean {
  return enemyZoneOfControl(state, movingSide).has(coordinate);
}

export function nightMovementPath(
  state: GameState,
  movingSide: Side,
  origin: HexCoordinate,
  destination: HexCoordinate,
): readonly HexCoordinate[] {
  const path = shortestHexPath(origin, destination);
  if (!state.night) return path;
  const enemyZoc = enemyZoneOfControl(state, movingSide);
  const blockedIndex = path.findIndex(
    (coordinate, index) => index > 0 && enemyZoc.has(coordinate),
  );
  return blockedIndex < 0 ? path : path.slice(0, blockedIndex);
}

export function nightMovementIsLegal(
  state: GameState,
  movingSide: Side,
  origin: HexCoordinate,
  destination: HexCoordinate,
): boolean {
  return (
    !state.night ||
    nightMovementPath(state, movingSide, origin, destination).at(-1) ===
      destination
  );
}
