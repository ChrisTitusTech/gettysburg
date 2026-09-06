import type { HexCoordinate } from "./coordinates.js";
import type { GameState, Side, UnitState } from "./protocol.js";
import { enemyZoneOfControl } from "./zoc.js";

export function hasCombatSupport(
  state: GameState,
  side: Side,
  coordinate: HexCoordinate,
): boolean {
  return Object.values(state.units).some(
    (unit) =>
      unit.side === side &&
      unit.kind !== "general" &&
      unit.status === "deployed" &&
      unit.location === coordinate,
  );
}

export function isUnsupportedGeneral(
  state: GameState,
  unit: UnitState,
): boolean {
  return (
    unit.kind === "general" &&
    unit.status === "deployed" &&
    unit.location !== null &&
    !hasCombatSupport(state, unit.side, unit.location)
  );
}

/** Generals exert no ZOC, so elimination is simultaneous and cannot cascade. */
export function eliminateLoneGenerals(state: GameState): GameState["units"] {
  const zones = {
    confederate: enemyZoneOfControl(state, "confederate"),
    union: enemyZoneOfControl(state, "union"),
  };
  const captured = Object.values(state.units).filter(
    (unit) =>
      isUnsupportedGeneral(state, unit) &&
      unit.location !== null &&
      zones[unit.side].has(unit.location),
  );
  if (captured.length === 0) return state.units;
  const units = { ...state.units };
  for (const general of captured) {
    units[general.id] = {
      ...general,
      location: null,
      status: "eliminated",
      strength: "eliminated",
      steps_remaining: 0,
    };
  }
  return units;
}
