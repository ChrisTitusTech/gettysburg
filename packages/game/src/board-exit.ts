import { BOARD_EDGE_HEXES } from "./coordinates.js";
import { eliminateLoneGenerals } from "./generals.js";
import { movementStackFits } from "./movement-validation.js";
import { planNormalMove } from "./normal-move.js";
import type { CommandFailure, GameState, Side, UnitState } from "./protocol.js";

/** Exit is permanent, not elimination; retain strength as historical state. */
export function unitsAfterBoardExit(
  state: GameState,
  unitIds: readonly string[],
  cost: 0 | 1,
): GameState["units"] {
  const units = { ...state.units };
  for (const id of unitIds) {
    const unit = units[id];
    if (unit !== undefined)
      units[id] = {
        ...unit,
        status: "exited",
        location: null,
        movement_spent: (unit.movement_spent ?? 0) + cost,
      };
  }
  return eliminateLoneGenerals({ ...state, units });
}

export type PreparedBoardExit =
  | {
      readonly ok: false;
      readonly error: CommandFailure["error"];
      readonly message: string;
    }
  | {
      readonly ok: true;
      readonly patch: Pick<GameState, "units" | "normal_movement">;
    };

function reject(
  error: CommandFailure["error"],
  message: string,
): PreparedBoardExit {
  return { ok: false, error, message };
}

export function prepareBoardExit(
  state: GameState,
  side: Side,
  ids: readonly string[],
): PreparedBoardExit {
  if (state.active_side !== side)
    return reject("wrong_seat", "It is not this seat's turn.");
  if (state.phase !== "movement")
    return reject(
      "phase_invalid",
      "Voluntary exits require the movement phase.",
    );
  if (ids.length === 0 || new Set(ids).size !== ids.length)
    return reject("phase_invalid", "Select unique counters to exit.");
  const settled = eliminateLoneGenerals(state);
  const movers: UnitState[] = [];
  for (const id of ids) {
    const unit = settled[id];
    if (unit === undefined)
      return reject("unit_not_found", "A selected counter does not exist.");
    if (unit.side !== side)
      return reject("wrong_seat", "Exit only your own counters.");
    movers.push(unit);
  }
  const plan = planNormalMove(state.normal_movement, movers);
  if (!plan.ok)
    return reject(
      "phase_invalid",
      "Exit the active group or unmoved deployed counters from one hex.",
    );
  const source = movers[0]!.location!;
  if (!BOARD_EDGE_HEXES.includes(source))
    return reject("invalid_hex", "Move to a board-edge hex before exiting.");
  if (plan.allowance < 1)
    return reject("movement_exceeded", "Exiting costs one movement point.");
  const selected = new Set(ids);
  const remaining = Object.values(state.units).filter(
    (unit) =>
      !selected.has(unit.id) &&
      unit.status === "deployed" &&
      unit.location === source,
  );
  if (!movementStackFits(remaining) || !movementStackFits(movers))
    return reject("occupied", "Exiting cannot leave an illegal source stack.");
  return {
    ok: true,
    patch: {
      units: unitsAfterBoardExit(state, ids, 1),
      normal_movement: plan.activation,
    },
  };
}
