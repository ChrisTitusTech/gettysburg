import { z } from "zod";

import { isHexCoordinate, type HexCoordinate } from "./coordinates.js";

export const LEGACY_RULESET_VERSION = "phase-2-tabletop-v1";
export const RULESET_VERSION = "gettysburg-terrain-v3";
export const COMMAND_SCHEMA_VERSION = "gettysburg-command/v1";

export type Side = "confederate" | "union";
export type GamePhase = "combat" | "completed" | "movement";
export type UnitKind = "artillery" | "cavalry" | "general" | "infantry";
export type UnitStatus = "deployed" | "eliminated" | "reinforcement";
export type StrengthState = "eliminated" | "full" | "reduced";

export interface UnitState {
  readonly combat: number | null;
  readonly entry_hexes: readonly HexCoordinate[];
  readonly entry_turn: number | null;
  readonly id: string;
  readonly kind: UnitKind;
  readonly label: string;
  readonly location: HexCoordinate | null;
  readonly movement: number;
  readonly movement_spent?: number;
  readonly organization: string;
  readonly reduced_combat?: number | null;
  readonly side: Side;
  readonly status: UnitStatus;
  readonly steps_remaining: number;
  readonly strength: StrengthState;
}

export interface PendingLossChoice {
  readonly count: number;
  readonly kind: "loss";
  readonly side: Side;
  readonly unit_ids: readonly string[];
}

export interface PendingRetreatChoice {
  readonly kind: "retreat";
  readonly side: Side;
  readonly unit_ids: readonly string[];
}

export interface PendingAdvanceChoice {
  readonly destination_hexes?: readonly HexCoordinate[];
  readonly eligible_unit_ids: readonly string[];
  readonly kind: "advance";
  readonly side: Side;
}

export type PendingCombatChoice =
  PendingAdvanceChoice | PendingLossChoice | PendingRetreatChoice;

export interface CombatConfirmation {
  readonly adjudication_note?: string;
  readonly advance_offered: boolean;
  readonly attacker_losses: number;
  readonly attacker_modifier: number;
  readonly attacker_retreat: boolean;
  readonly defender_losses: number;
  readonly defender_modifier: number;
  readonly defender_retreat: boolean;
  readonly result: "attacker_win" | "defender_win" | "tie";
}

export interface CombatState {
  readonly attacker_loss_allocated: boolean;
  readonly attacker_retreated: boolean;
  readonly attacker_hexes?: readonly HexCoordinate[];
  readonly attackers: readonly string[];
  readonly confirmation: CombatConfirmation | null;
  readonly defender_loss_allocated: boolean;
  readonly defender_retreated: boolean;
  readonly defenders: readonly string[];
  readonly defender_hexes?: readonly HexCoordinate[];
  readonly id: string;
  readonly pending_choice: PendingCombatChoice | null;
  readonly rolls: {
    readonly attacker: number;
    readonly defender: number;
  } | null;
  readonly status:
    "awaiting_result_confirmation" | "declared" | "pending_choice" | "resolved";
}

export interface HexTerrain {
  readonly kind: "clear" | "hill" | "rough_hill" | "town" | "woods";
  readonly defense: number;
  readonly hill_defense: number;
  readonly woods: boolean;
  readonly forest_region: string | null;
  readonly hill_region: string | null;
}

export interface NormalMovementActivation {
  readonly active_unit_ids: readonly string[];
  readonly closed_unit_ids: readonly string[];
  readonly bonus_unit_ids: readonly string[];
}

export interface GameState {
  readonly normal_movement?: NormalMovementActivation;
  readonly terrain?: Readonly<Partial<Record<HexCoordinate, HexTerrain>>>;
  readonly active_side: Side | null;
  readonly combats: Readonly<Record<string, CombatState>>;
  readonly content_revision: string;
  readonly event_sequence: number;
  readonly game_id: string;
  readonly night: boolean;
  readonly objectives: Readonly<
    Record<string, { readonly controlled_by: Side; readonly value: number }>
  >;
  readonly phase: GamePhase;
  readonly ruleset_version: string;
  readonly turn: number;
  readonly units: Readonly<Record<string, UnitState>>;
  readonly version: number;
  readonly victory: {
    readonly confederate: number;
    readonly status: "confederate" | "in-progress" | "tie" | "union";
    readonly union: number;
  };
}

const coordinateSchema = z
  .string()
  .refine(isHexCoordinate, "Invalid board coordinate");
const unitIdSchema = z.string().min(1).max(100);
const combatIdSchema = z.string().uuid();

export const moveUnitPayloadSchema = z
  .object({ destination: coordinateSchema, unit_id: unitIdSchema })
  .strict();
export const moveStackPayloadSchema = z
  .object({
    destination: coordinateSchema,
    unit_ids: z.array(unitIdSchema).min(2),
  })
  .strict();
export const enterReinforcementPayloadSchema = moveUnitPayloadSchema;
export const declareCombatPayloadSchema = z
  .object({
    attackers: z.array(unitIdSchema).min(1),
    combat_id: combatIdSchema,
    defenders: z.array(unitIdSchema).min(1),
  })
  .strict();
export const rollCombatPayloadSchema = z
  .object({ combat_id: combatIdSchema })
  .strict();
export const confirmCombatResultPayloadSchema = z
  .object({ combat_id: combatIdSchema })
  .strict();
export const allocateLossPayloadSchema = z
  .object({
    allocations: z.record(unitIdSchema, z.number().int().nonnegative()),
    combat_id: combatIdSchema,
  })
  .strict();
export const retreatUnitPayloadSchema = z
  .object({
    combat_id: combatIdSchema,
    destination: coordinateSchema,
    unit_id: unitIdSchema,
  })
  .strict();
export const retreatStackPayloadSchema = z
  .object({
    combat_id: combatIdSchema,
    path: z.array(coordinateSchema).min(2),
    unit_ids: z.array(unitIdSchema).min(1),
  })
  .strict();
export const advanceAfterCombatPayloadSchema = z
  .object({
    combat_id: combatIdSchema,
    decline: z.boolean(),
    destination: coordinateSchema.optional(),
    unit_ids: z.array(unitIdSchema).min(1).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.decline === (value.destination !== undefined)) {
      context.addIssue({
        code: "custom",
        message: "Choose either a destination or decline",
      });
    }
    if (!value.decline && value.unit_ids === undefined) {
      context.addIssue({
        code: "custom",
        message: "Advancing requires at least one dragged counter",
      });
    }
  });
export const endPhasePayloadSchema = z.object({}).strict();
export const surrenderSeatPayloadSchema = z.object({}).strict();

export const commandPayloadSchemas = {
  advanceAfterCombat: advanceAfterCombatPayloadSchema,
  allocateLoss: allocateLossPayloadSchema,
  confirmCombatResult: confirmCombatResultPayloadSchema,
  declareCombat: declareCombatPayloadSchema,
  endPhase: endPhasePayloadSchema,
  enterReinforcement: enterReinforcementPayloadSchema,
  moveStack: moveStackPayloadSchema,
  moveUnit: moveUnitPayloadSchema,
  retreatStack: retreatStackPayloadSchema,
  retreatUnit: retreatUnitPayloadSchema,
  rollCombat: rollCombatPayloadSchema,
  surrenderSeat: surrenderSeatPayloadSchema,
} as const;

export type GameplayCommandName = keyof typeof commandPayloadSchemas;

const baseEnvelope = {
  command_id: z.string().uuid(),
  expected_version: z.number().int().nonnegative(),
  game_id: z.string().uuid(),
  schema: z.literal(COMMAND_SCHEMA_VERSION),
};

export const moveUnitCommandSchema = z
  .object({
    ...baseEnvelope,
    command_name: z.literal("moveUnit"),
    payload: moveUnitPayloadSchema,
  })
  .strict();

export const gameplayCommandSchema = z.discriminatedUnion("command_name", [
  moveUnitCommandSchema,
  z
    .object({
      ...baseEnvelope,
      command_name: z.literal("moveStack"),
      payload: moveStackPayloadSchema,
    })
    .strict(),
  z
    .object({
      ...baseEnvelope,
      command_name: z.literal("enterReinforcement"),
      payload: enterReinforcementPayloadSchema,
    })
    .strict(),
  z
    .object({
      ...baseEnvelope,
      command_name: z.literal("declareCombat"),
      payload: declareCombatPayloadSchema,
    })
    .strict(),
  z
    .object({
      ...baseEnvelope,
      command_name: z.literal("rollCombat"),
      payload: rollCombatPayloadSchema,
    })
    .strict(),
  z
    .object({
      ...baseEnvelope,
      command_name: z.literal("confirmCombatResult"),
      payload: confirmCombatResultPayloadSchema,
    })
    .strict(),
  z
    .object({
      ...baseEnvelope,
      command_name: z.literal("allocateLoss"),
      payload: allocateLossPayloadSchema,
    })
    .strict(),
  z
    .object({
      ...baseEnvelope,
      command_name: z.literal("retreatStack"),
      payload: retreatStackPayloadSchema,
    })
    .strict(),
  z
    .object({
      ...baseEnvelope,
      command_name: z.literal("retreatUnit"),
      payload: retreatUnitPayloadSchema,
    })
    .strict(),
  z
    .object({
      ...baseEnvelope,
      command_name: z.literal("advanceAfterCombat"),
      payload: advanceAfterCombatPayloadSchema,
    })
    .strict(),
  z
    .object({
      ...baseEnvelope,
      command_name: z.literal("endPhase"),
      payload: endPhasePayloadSchema,
    })
    .strict(),
  z
    .object({
      ...baseEnvelope,
      command_name: z.literal("surrenderSeat"),
      payload: surrenderSeatPayloadSchema,
    })
    .strict(),
]);

export type GameplayCommand = z.infer<typeof gameplayCommandSchema>;
export type MoveUnitPayload = z.infer<typeof moveUnitPayloadSchema> & {
  readonly destination: HexCoordinate;
};
export type MoveUnitCommand = Extract<
  GameplayCommand,
  { command_name: "moveUnit" }
>;

const hostManagementPayloadSchemas = {
  deleteGame: z.object({ confirm: z.literal(true) }).strict(),
  issueInvitation: z
    .object({ seat: z.enum(["confederate", "union"]) })
    .strict(),
  revokeInvitation: z.object({ lookup_id: z.string().uuid() }).strict(),
} as const;

export const hostManagementCommandSchema = z.discriminatedUnion(
  "command_name",
  [
    z
      .object({
        ...baseEnvelope,
        command_name: z.literal("issueInvitation"),
        payload: hostManagementPayloadSchemas.issueInvitation,
      })
      .strict(),
    z
      .object({
        ...baseEnvelope,
        command_name: z.literal("revokeInvitation"),
        payload: hostManagementPayloadSchemas.revokeInvitation,
      })
      .strict(),
    z
      .object({
        ...baseEnvelope,
        command_name: z.literal("deleteGame"),
        payload: hostManagementPayloadSchemas.deleteGame,
      })
      .strict(),
  ],
);

export type HostManagementCommand = z.infer<typeof hostManagementCommandSchema>;
export type HostManagementCommandName = HostManagementCommand["command_name"];

export type CommandErrorCode =
  | "already_entered"
  | "command_id_conflict"
  | "combat_invalid"
  | "game_deleted"
  | "game_not_found"
  | "game_purged"
  | "internal_error"
  | "invalid_hex"
  | "invalid_payload"
  | "movement_exceeded"
  | "occupied"
  | "pending_choice"
  | "rate_limited"
  | "phase_invalid"
  | "reinforcement_early"
  | "stale_version"
  | "unauthorized"
  | "unit_not_found"
  | "version_unavailable"
  | "wrong_seat";

export interface CommandFailure {
  readonly current_version: number;
  readonly error: CommandErrorCode;
  readonly message: string;
  readonly ok: false;
}

export interface GameplayEvent {
  readonly command_id: string;
  readonly command_name: GameplayCommandName;
  readonly event_sequence: number;
  readonly kind: "gameplay";
  readonly state_version: number;
  readonly summary: string;
}

export interface ManagementEvent {
  readonly command_id: string;
  readonly command_name: HostManagementCommandName;
  readonly event_sequence: number;
  readonly kind: "host_management";
  readonly state_version: number;
  readonly summary: string;
}

export interface AuditEvent {
  readonly command_id: string;
  readonly command_name: "operatorRecovery";
  readonly event_sequence: number;
  readonly kind: "operator_audit";
  readonly state_version: number;
  readonly summary: string;
}

export type ActionEvent = AuditEvent | GameplayEvent | ManagementEvent;

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

export function acceptManagementEvent(
  cursor: EventCursor,
  event: Pick<ManagementEvent, "event_sequence" | "state_version">,
): EventCursorResult {
  if (event.event_sequence !== cursor.event_sequence + 1) {
    return { error: "event_sequence_gap", ok: false };
  }
  if (event.state_version !== cursor.state_version) {
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
