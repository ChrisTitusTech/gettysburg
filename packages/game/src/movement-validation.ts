import { isHexCoordinate } from "./coordinates.js";
import type { HexCoordinate } from "./coordinates.js";
import { normalMovementRoute } from "./movement.js";
import type { MovementRoute } from "./movement.js";
import { planNormalMove } from "./normal-move.js";
import type { CommandFailure, GameState, Side, UnitState } from "./protocol.js";

export type PreparedNormalMovement =
  | {
      readonly ok: false;
      readonly error: CommandFailure["error"];
      readonly message: string;
    }
  | {
      readonly ok: true;
      readonly allowance: number;
      readonly route: MovementRoute;
      readonly patch: Pick<
        GameState,
        "units" | "normal_movement" | "objectives"
      >;
    };

function reject(
  error: CommandFailure["error"],
  message: string,
): PreparedNormalMovement {
  return { ok: false, error, message };
}

function stackFits(units: readonly UnitState[]): boolean {
  const generals = units.filter((unit) => unit.kind === "general").length;
  return generals <= 1 && units.length - generals <= (generals === 1 ? 2 : 1);
}

// Shared authoritative/preview validator for the future mandatory ruleset.
// It never commits a partial result: callers apply the patch only on success.
export function prepareNormalMovement(
  state: GameState,
  side: Side,
  unitIds: readonly string[],
  destination: HexCoordinate,
): PreparedNormalMovement {
  if (state.active_side !== side)
    return reject("wrong_seat", "It is not this seat's turn.");
  if (state.phase !== "movement")
    return reject(
      "phase_invalid",
      "Normal movement requires the movement phase.",
    );
  if (!isHexCoordinate(destination))
    return reject("invalid_hex", "Choose a playable board hex.");
  if (state.terrain === undefined || state.movement_edges === undefined) {
    return reject(
      "version_unavailable",
      "The pinned movement terrain and edge bundle is unavailable.",
    );
  }
  if (unitIds.length === 0 || new Set(unitIds).size !== unitIds.length) {
    return reject("phase_invalid", "Choose a unique counter or stack.");
  }
  const movers: UnitState[] = [];
  for (const id of unitIds) {
    const unit = state.units[id];
    if (unit === undefined)
      return reject("unit_not_found", "A selected counter does not exist.");
    if (unit.side !== side)
      return reject("wrong_seat", "You may move only your own counters.");
    movers.push(unit);
  }
  const plan = planNormalMove(state.normal_movement, movers);
  if (!plan.ok)
    return reject(
      "phase_invalid",
      plan.reason === "move_finished"
        ? "That unit/stack move has ended. Continue the same group or choose counters that have not moved."
        : "Move deployed counters from one hex together.",
    );
  const origin = movers[0]!.location!;
  if (origin === destination)
    return reject("phase_invalid", "Choose a different hex to move.");
  const ids = new Set(unitIds);
  const remaining = Object.values(state.units).filter(
    (unit) => unit.status === "deployed" && !ids.has(unit.id),
  );
  const destinationUnits = remaining.filter(
    (unit) => unit.location === destination,
  );
  if (destinationUnits.some((unit) => unit.side !== side))
    return reject("occupied", "An enemy occupies that hex.");
  if (
    !stackFits([...destinationUnits, ...movers]) ||
    !stackFits(remaining.filter((unit) => unit.location === origin))
  ) {
    return reject(
      "occupied",
      "The source and destination must remain within stacking capacity.",
    );
  }
  const route = normalMovementRoute(
    state,
    side,
    movers.map((unit) => unit.kind),
    state.movement_edges,
    origin,
    destination,
  );
  if (route === null)
    return reject(
      "phase_invalid",
      "No legal route: check enemy occupancy, zones of control, night movement, and artillery terrain restrictions.",
    );
  if (route.cost > plan.allowance)
    return reject(
      "movement_exceeded",
      `${destination} requires ${route.cost} movement; this group has ${plan.allowance} remaining.`,
    );

  const units = { ...state.units };
  for (const unit of movers) {
    units[unit.id] = {
      ...unit,
      location: destination,
      movement_spent: (unit.movement_spent ?? 0) + route.cost,
    };
  }
  const objectives = { ...state.objectives };
  // Entered objectives change control even when a multi-hex drag passes through
  // them. Splitting the same legal route into repeated drags must agree.
  for (const coordinate of route.path.slice(1)) {
    const objective = objectives[coordinate];
    if (objective !== undefined)
      objectives[coordinate] = { ...objective, controlled_by: side };
  }
  return {
    ok: true,
    allowance: plan.allowance,
    route,
    patch: { units, normal_movement: plan.activation, objectives },
  };
}
