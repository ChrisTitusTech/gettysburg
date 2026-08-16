import { adjacentHexes } from "./coordinates.js";
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

export function movementPath(
  state: GameState,
  movingSide: Side,
  origin: HexCoordinate,
  destination: HexCoordinate,
): readonly HexCoordinate[] {
  if (origin === destination) return [origin];
  const blocked = new Set(
    Object.values(state.units).flatMap((unit) =>
      unit.side !== movingSide &&
      unit.status === "deployed" &&
      unit.location !== null
        ? [unit.location]
        : [],
    ),
  );
  const enemyZoc = state.night
    ? enemyZoneOfControl(state, movingSide)
    : new Set<HexCoordinate>();
  const frontier: HexCoordinate[] = [origin];
  const previous = new Map<HexCoordinate, HexCoordinate | null>([
    [origin, null],
  ]);
  for (let index = 0; index < frontier.length; index += 1) {
    const current = frontier[index];
    if (current === undefined) break;
    for (const neighbor of adjacentHexes(current)) {
      if (
        previous.has(neighbor) ||
        blocked.has(neighbor) ||
        enemyZoc.has(neighbor)
      ) {
        continue;
      }
      previous.set(neighbor, current);
      if (neighbor === destination) {
        const safePath = [destination];
        let step: HexCoordinate | null = current;
        while (step !== null) {
          safePath.push(step);
          step = previous.get(step) ?? null;
        }
        return safePath.reverse();
      }
      frontier.push(neighbor);
    }
  }
  return [origin];
}

export function nightMovementPath(
  state: GameState,
  movingSide: Side,
  origin: HexCoordinate,
  destination: HexCoordinate,
): readonly HexCoordinate[] {
  return movementPath(state, movingSide, origin, destination);
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
