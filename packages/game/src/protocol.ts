import { z } from "zod";

import { isHexCoordinate, type HexCoordinate } from "./coordinates.js";

export const RULESET_VERSION = "phase-1-rules-v1";
export const COMMAND_SCHEMA_VERSION = "gettysburg-command/v1";

export type Side = "confederate" | "union";

export interface UnitState {
  readonly id: string;
  readonly label: string;
  readonly location: HexCoordinate;
  readonly side: Side;
}

export interface GameState {
  readonly active_side: Side;
  readonly content_revision: string;
  readonly event_sequence: number;
  readonly game_id: string;
  readonly ruleset_version: string;
  readonly turn: number;
  readonly units: Readonly<Record<string, UnitState>>;
  readonly version: number;
}

export const moveUnitPayloadSchema = z
  .object({
    destination: z.string().refine(isHexCoordinate, "Invalid board coordinate"),
    unit_id: z.string().min(1).max(100),
  })
  .strict();

export const moveUnitCommandSchema = z
  .object({
    command_id: z.string().uuid(),
    command_name: z.literal("moveUnit"),
    expected_version: z.number().int().nonnegative(),
    game_id: z.string().uuid(),
    payload: moveUnitPayloadSchema,
    schema: z.literal(COMMAND_SCHEMA_VERSION),
  })
  .strict();

export type MoveUnitPayload = z.infer<typeof moveUnitPayloadSchema> & {
  readonly destination: HexCoordinate;
};
export type MoveUnitCommand = z.infer<typeof moveUnitCommandSchema> & {
  readonly payload: MoveUnitPayload;
};

export type CommandErrorCode =
  | "command_id_conflict"
  | "invalid_hex"
  | "invalid_payload"
  | "occupied"
  | "stale_version"
  | "unauthorized"
  | "unit_not_found"
  | "wrong_seat";

export interface CommandFailure {
  readonly current_version: number;
  readonly error: CommandErrorCode;
  readonly message: string;
  readonly ok: false;
}

export interface GameplayEvent {
  readonly command_id: string;
  readonly destination: HexCoordinate;
  readonly event_sequence: number;
  readonly kind: "gameplay";
  readonly state_version: number;
  readonly unit_id: string;
}

export interface CommandSuccess {
  readonly event: GameplayEvent;
  readonly ok: true;
  readonly state: GameState;
}

export type CommandResult = CommandFailure | CommandSuccess;

export interface EventCursor {
  readonly event_sequence: number;
  readonly state_version: number;
}

export type EventCursorResult =
  | { readonly cursor: EventCursor; readonly ok: true }
  | {
      readonly error: "event_sequence_gap" | "state_version_gap";
      readonly ok: false;
    };

export function acceptGameplayEvent(
  cursor: EventCursor,
  event: Pick<GameplayEvent, "event_sequence" | "state_version">,
): EventCursorResult {
  if (event.event_sequence !== cursor.event_sequence + 1) {
    return { error: "event_sequence_gap", ok: false };
  }

  if (event.state_version !== cursor.state_version + 1) {
    return { error: "state_version_gap", ok: false };
  }

  return {
    cursor: {
      event_sequence: event.event_sequence,
      state_version: event.state_version,
    },
    ok: true,
  };
}
