import { isHexCoordinate } from "./coordinates.js";
import type {
  CommandFailure,
  CommandSuccess,
  GameState,
  MoveUnitPayload,
  Side,
} from "./protocol.js";

type ReducerResult =
  | { readonly failure: CommandFailure; readonly ok: false }
  | {
      readonly ok: true;
      readonly state: GameState;
      readonly unit: GameState["units"][string];
    };

function failure(
  state: GameState,
  error: CommandFailure["error"],
  message: string,
): ReducerResult {
  return {
    failure: { current_version: state.version, error, message, ok: false },
    ok: false,
  };
}

export function reduceMoveUnit(
  state: GameState,
  actorSide: Side,
  payload: MoveUnitPayload,
): ReducerResult {
  if (!isHexCoordinate(payload.destination)) {
    return failure(state, "invalid_hex", "Choose a playable board hex.");
  }

  const unit = state.units[payload.unit_id];
  if (unit === undefined) {
    return failure(state, "unit_not_found", "That counter does not exist.");
  }

  if (unit.side !== actorSide) {
    return failure(state, "wrong_seat", "You may move only your own counter.");
  }

  const occupied = Object.values(state.units).some(
    (candidate) =>
      candidate.id !== unit.id && candidate.location === payload.destination,
  );
  if (occupied) {
    return failure(state, "occupied", "That fixture hex is occupied.");
  }

  const movedUnit = { ...unit, location: payload.destination };
  const nextState: GameState = {
    ...state,
    event_sequence: state.event_sequence + 1,
    units: { ...state.units, [unit.id]: movedUnit },
    version: state.version + 1,
  };

  return { ok: true, state: nextState, unit: movedUnit };
}

export function toCommandSuccess(
  state: GameState,
  commandId: string,
  unitId: string,
): CommandSuccess {
  const unit = state.units[unitId];
  if (unit === undefined) {
    throw new Error("Accepted move is missing its unit");
  }

  return {
    event: {
      command_id: commandId,
      destination: unit.location,
      event_sequence: state.event_sequence,
      kind: "gameplay",
      state_version: state.version,
      unit_id: unit.id,
    },
    ok: true,
    state,
  };
}
