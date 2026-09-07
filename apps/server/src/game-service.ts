import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import {
  createMandatoryInitialState,
  MANDATORY_CONTENT_REVISION,
  SCENARIO_CONTENT_REVISION,
} from "@gettysburg/content";
import {
  COMMAND_SCHEMA_VERSION,
  combatSkirmishes,
  gameplayCommandSchema,
  hostManagementCommandSchema,
  isHexCoordinate,
  LEGACY_RULESET_VERSION,
  MANDATORY_RULESET_VERSION,
  reduceGameplayCommand,
  RULESET_VERSION,
  toCommandSuccess,
  type CommandFailure,
  type CommandResult,
  type AuditEvent,
  type GameState,
  type GameplayCommand,
  type HexCoordinate,
  type HostManagementCommand,
  type ManagementEvent,
  type MoveUnitCommand,
  type Side,
} from "@gettysburg/game";
import canonicalize from "canonicalize";
import { hasPinnedMandatoryContent } from "./mandatory-content.js";

import {
  credentialVerifier,
  generateCredential,
  isCanonicalCredential,
} from "./credentials.js";

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;
const INVITATION_LIFETIME_MS = 24 * 60 * 60 * 1_000;
const RECOVERY_LIFETIME_MS = 15 * 60 * 1_000;
const DELETION_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

export interface BrowserSession {
  readonly credentialHash: string;
  readonly expiresAt: number;
  readonly id: string;
  revokedAt: number | null;
}

export interface HostBinding {
  readonly activeAfterSequence?: number;
  inactiveFromSequence?: number;
  readonly gameId: string;
  readonly id: string;
  readonly sessionId: string;
  readonly version: number;
  revokedAt: number | null;
}

export interface SeatBinding {
  // Optional only for retained pre-chronology saves. Interpreted mandatory replay
  // requires these boundaries; never infer them from current revocation time.
  readonly activeAfterSequence?: number;
  inactiveFromSequence?: number;
  readonly gameId: string;
  readonly id: string;
  readonly sessionId: string;
  readonly side: Side;
  readonly version: number;
  revokedAt: number | null;
}

export interface Invitation {
  readonly allowedSeat: Side;
  claimId?: string;
  claimedAt: number | null;
  readonly expiresAt: number;
  readonly gameId: string;
  readonly lookupId: string;
  revokedAt: number | null;
  sealedClaimCredential?: string;
  readonly tokenHash: string;
}

export interface RecoveryGrant {
  claimId?: string;
  consumedAt: number | null;
  readonly expiresAt: number;
  readonly gameId: string;
  readonly lookupId: string;
  readonly oldBindingId: string;
  readonly oldBindingVersion: number;
  readonly operatorIdentity: string;
  revokedAt: number | null;
  sealedClaimCredential?: string;
  readonly side: Side | null;
  readonly targetBindingType: "host" | "seat";
  readonly tokenHash: string;
}

export interface StoredAction {
  readonly authorizingId: string;
  readonly authorizingType: "host" | "operator" | "seat";
  readonly authorizingVersion: number;
  readonly canonicalRequestHash: string | null;
  readonly canonicalizationVersion: string | null;
  readonly commandId: string | null;
  readonly commandName:
    | GameplayCommand["command_name"]
    | HostManagementCommand["command_name"]
    | null;
  readonly contentRevision: string;
  readonly expectedVersion: number;
  readonly kind: "gameplay" | "host_management" | "operator_audit";
  readonly operatorRequestId: string | null;
  readonly payload: unknown;
  readonly resultingVersion: number;
  readonly result: CommandResult | HostManagementSuccess | null;
  readonly sequence: number;
  readonly rulesetVersion: string;
}

export interface DeletionReceipt {
  readonly actor: string;
  readonly deletedAt: number;
  readonly gameId: string;
  readonly position: number;
  readonly purgedAt: number | null;
}

interface GameRecord {
  readonly actions: StoredAction[];
  readonly commandResults: Map<
    string,
    {
      readonly authorizingBindingId: string;
      readonly authorizingBindingVersion: number;
      readonly canonicalHash: string;
      readonly canonicalizationVersion: string | null;
      readonly result: CommandResult;
    }
  >;
  readonly creation?: {
    readonly creationId: string;
    readonly invitationLookupId: string;
    sealedCredential?: string;
    sealedInvitationSecret?: string;
    readonly sessionId: string;
    readonly side: Side;
  };
  deletedAt: number | null;
  deletedBy: string | null;
  readonly hostCommandResults: Map<
    string,
    {
      readonly authorizingBindingId: string;
      readonly authorizingBindingVersion: number;
      readonly canonicalHash: string;
      readonly canonicalizationVersion: string | null;
      readonly result: HostManagementSuccess;
      invitationLookupId?: string;
      sealedInvitationSecret?: string;
      terminalCredentialHash?: string;
    }
  >;
  state: GameState;
}

export interface GameServiceSnapshot {
  readonly games: readonly [
    string,
    {
      readonly actions: readonly StoredAction[];
      readonly commandResults: readonly [
        string,
        {
          readonly authorizingBindingId: string;
          readonly authorizingBindingVersion: number;
          readonly canonicalHash: string;
          readonly canonicalizationVersion?: string | null;
          readonly result: CommandResult;
        },
      ][];
      readonly creation?: {
        readonly creationId: string;
        readonly invitationLookupId: string;
        readonly sealedCredential?: string;
        readonly sealedInvitationSecret?: string;
        readonly sessionId: string;
        readonly side: Side;
      };
      readonly deletedAt?: number | null;
      readonly deletedBy?: string | null;
      readonly hostCommandResults?: readonly [
        string,
        {
          readonly authorizingBindingId: string;
          readonly authorizingBindingVersion: number;
          readonly canonicalHash: string;
          readonly canonicalizationVersion?: string | null;
          readonly result: HostManagementSuccess;
          readonly invitationLookupId?: string;
          readonly sealedInvitationSecret?: string;
          readonly terminalCredentialHash?: string;
        },
      ][];
      readonly state: GameState;
    },
  ][];
  readonly deletionLedger?: readonly DeletionReceipt[];
  readonly hostBindings: readonly HostBinding[];
  readonly invitations: readonly [string, Invitation][];
  readonly recoveryGrants: readonly [string, RecoveryGrant][];
  readonly seatBindings: readonly SeatBinding[];
  readonly sessions: readonly BrowserSession[];
}

export interface GameAuthorization {
  readonly bindingId: string;
  readonly bindingVersion: number;
  readonly gameId: string;
  readonly sessionId: string;
  readonly side: Side;
}

export interface HostAuthorization {
  readonly bindingId: string;
  readonly bindingVersion: number;
  readonly gameId: string;
  readonly sessionId: string;
}

export interface InvitationCredential {
  readonly lookup_id: string;
  readonly secret: string;
}

export interface HostManagementSuccess {
  readonly event: ManagementEvent;
  readonly invitation?: InvitationCredential;
  readonly ok: true;
}

export type HostManagementResult = CommandFailure | HostManagementSuccess;

export interface SessionResult {
  readonly credential: string;
  readonly sessionId: string;
}

export interface CreateGameResult extends SessionResult {
  readonly gameId: string;
  readonly invitation: InvitationCredential;
  readonly seat: Side;
  readonly state: GameState;
}

export interface ClaimResult extends SessionResult {
  readonly gameId: string;
  readonly seat: Side;
  readonly state: GameState;
}

export interface RecoveryIssueResult {
  readonly lookup_id: string;
  readonly secret: string;
}

export interface HostRecoveryClaimResult extends SessionResult {
  readonly gameId: string;
}

export interface RecoveryExport {
  readonly action_log: readonly StoredAction[];
  readonly snapshot_metadata: {
    readonly content_revision: string;
    readonly event_sequence: number;
    readonly game_id: string;
    readonly ruleset_version: string;
    readonly state_version: number;
  };
}

export type ServiceErrorCode =
  | "credential_invalid"
  | "creation_conflict"
  | "creation_unavailable"
  | "game_deleted"
  | "game_not_found"
  | "game_purged"
  | "invitation_mismatch"
  | "invitation_unavailable"
  | "recovery_unavailable"
  | "seat_unavailable"
  | "unauthorized"
  | "version_unavailable";

export class ServiceError extends Error {
  constructor(
    readonly code: ServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

function otherSide(side: Side): Side {
  return side === "confederate" ? "union" : "confederate";
}

function hashesEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "hex");
  const rightBytes = Buffer.from(right, "hex");
  return (
    leftBytes.byteLength === rightBytes.byteLength &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

function invitationSealKey(pepper: Uint8Array): Buffer {
  return createHmac("sha256", pepper)
    .update("gettysburg:invitation-seal:v2", "utf8")
    .digest();
}

function sealInvitationSecret(pepper: Uint8Array, secret: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    invitationSealKey(pepper),
    nonce,
  );
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  return `v2.${Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString("base64url")}`;
}

function openInvitationSecret(pepper: Uint8Array, sealed: string): string {
  const versioned = sealed.startsWith("v2.");
  const bytes = Buffer.from(versioned ? sealed.slice(3) : sealed, "base64url");
  if (bytes.byteLength < 29)
    throw new Error("Invalid sealed invitation secret");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    versioned ? invitationSealKey(pepper) : pepper,
    bytes.subarray(0, 12),
  );
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([
    decipher.update(bytes.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}

function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

function sideHasAvailableUnit(
  units: GameState["units"],
  side: Side,
  turn: number,
): boolean {
  return Object.values(units).some(
    (unit) =>
      unit.side === side &&
      (unit.status === "deployed" ||
        (unit.status === "reinforcement" &&
          unit.entry_turn !== null &&
          unit.entry_turn <= turn)),
  );
}

function normalizeEmptyConfederateOpening(state: GameState): GameState {
  if (
    state.turn !== 1 ||
    (state.phase !== "movement" && state.phase !== "combat") ||
    state.active_side !== "confederate" ||
    sideHasAvailableUnit(state.units, "confederate", 1)
  ) {
    return state;
  }
  return { ...state, active_side: "union", phase: "movement" };
}

function normalizePendingRetreatStacks(state: GameState): GameState {
  let changed = false;
  const combats = Object.fromEntries(
    Object.entries(state.combats).map(([combatId, combat]) => {
      const choice = combat.pending_choice;
      if (choice?.kind !== "retreat") return [combatId, combat];
      const locations = new Set(
        choice.unit_ids.flatMap((id) => {
          const location = state.units[id]?.location;
          return location === null || location === undefined ? [] : [location];
        }),
      );
      const unitIds = [...choice.unit_ids];
      for (const unit of Object.values(state.units)) {
        if (
          unit.side === choice.side &&
          unit.status === "deployed" &&
          unit.location !== null &&
          locations.has(unit.location) &&
          !unitIds.includes(unit.id)
        ) {
          unitIds.push(unit.id);
        }
      }
      if (unitIds.length === choice.unit_ids.length) return [combatId, combat];
      changed = true;
      return [
        combatId,
        { ...combat, pending_choice: { ...choice, unit_ids: unitIds } },
      ];
    }),
  );
  return changed ? { ...state, combats } : state;
}

function savedCombatDefenderHexes(
  state: GameState,
  combatId: string,
  actions: readonly StoredAction[],
): HexCoordinate[] {
  const combat = state.combats[combatId];
  if (combat === undefined) return [];
  if (combat.defender_hexes !== undefined && combat.defender_hexes.length > 0) {
    return [...combat.defender_hexes];
  }
  const retreatSources = new Set<HexCoordinate>();
  for (const action of actions) {
    if (
      action.commandName !== "retreatStack" &&
      action.commandName !== "retreatUnit"
    ) {
      continue;
    }
    const payload = action.payload as Record<string, unknown> | null;
    if (payload?.combat_id !== combatId) continue;
    const source = Array.isArray(payload.path) ? payload.path[0] : undefined;
    if (typeof source === "string" && isHexCoordinate(source)) {
      retreatSources.add(source);
    }
  }
  if (retreatSources.size > 0) return [...retreatSources].sort();
  const current = new Set<HexCoordinate>();
  for (const id of combat.defenders) {
    const location = state.units[id]?.location;
    if (location !== null && location !== undefined) current.add(location);
  }
  if (!combat.defender_retreated && current.size > 0) {
    return [...current].sort();
  }
  const declaration = actions.find((action) => {
    const payload = action.payload as Record<string, unknown> | null;
    return (
      action.commandName === "declareCombat" && payload?.combat_id === combatId
    );
  });
  if (declaration?.result?.ok === true && "state" in declaration.result) {
    for (const id of combat.defenders) {
      const location = declaration.result.state.units[id]?.location;
      if (location !== null && location !== undefined) current.add(location);
    }
  }
  return [...current].sort();
}

function normalizeCombatDragChoices(
  state: GameState,
  actions: readonly StoredAction[],
): GameState {
  let changed = false;
  const combats = Object.fromEntries(
    Object.entries(state.combats).map(([combatId, combat]) => {
      const defenderHexes = savedCombatDefenderHexes(state, combatId, actions);
      const choice = combat.pending_choice;
      let pendingChoice = choice;
      if (choice?.kind === "advance") {
        const sourceHexes = new Set(
          choice.eligible_unit_ids.flatMap((id) => {
            const location = state.units[id]?.location;
            return location === null || location === undefined
              ? []
              : [location];
          }),
        );
        const eligibleUnitIds = [...choice.eligible_unit_ids];
        for (const unit of Object.values(state.units)) {
          if (
            unit.side === choice.side &&
            unit.status === "deployed" &&
            unit.location !== null &&
            sourceHexes.has(unit.location) &&
            !eligibleUnitIds.includes(unit.id)
          ) {
            eligibleUnitIds.push(unit.id);
          }
        }
        if (
          choice.destination_hexes === undefined ||
          choice.destination_hexes.length === 0 ||
          eligibleUnitIds.length !== choice.eligible_unit_ids.length
        ) {
          pendingChoice = {
            ...choice,
            destination_hexes: defenderHexes,
            eligible_unit_ids: eligibleUnitIds,
          };
          changed = true;
        }
      }
      if (
        combat.defender_hexes === undefined ||
        combat.defender_hexes.length === 0
      ) {
        changed = true;
        return [
          combatId,
          {
            ...combat,
            defender_hexes: defenderHexes,
            pending_choice: pendingChoice,
          },
        ];
      }
      return pendingChoice === choice
        ? [combatId, combat]
        : [combatId, { ...combat, pending_choice: pendingChoice }];
    }),
  );
  return changed ? { ...state, combats } : state;
}

function normalizeSavedState(
  state: GameState,
  actions: readonly StoredAction[] = [],
): GameState {
  const units = Object.fromEntries(
    Object.entries(state.units).map(([unitId, unit]) => [
      unitId,
      unit.steps_remaining === undefined
        ? {
            ...unit,
            steps_remaining:
              unit.kind === "general" || unit.combat === 1
                ? 1
                : unit.strength === "reduced"
                  ? 1
                  : 2,
          }
        : unit,
    ]),
  );
  return normalizeCombatDragChoices(
    normalizePendingRetreatStacks(
      normalizeEmptyConfederateOpening({ ...state, units }),
    ),
    actions,
  );
}

interface GameVersionHandler {
  accepts?(state: GameState): boolean;
  normalize(state: GameState, actions: readonly StoredAction[]): GameState;
}

const gameVersionRegistry = new Map<string, GameVersionHandler>([
  [
    `${MANDATORY_RULESET_VERSION}\u0000${MANDATORY_CONTENT_REVISION}`,
    { accepts: hasPinnedMandatoryContent, normalize: (state) => state },
  ],
  [
    `${LEGACY_RULESET_VERSION}\u0000${SCENARIO_CONTENT_REVISION}`,
    { normalize: normalizeSavedState },
  ],
  [
    `${RULESET_VERSION}\u0000${SCENARIO_CONTENT_REVISION}`,
    { normalize: normalizeSavedState },
  ],
]);

function gameVersionHandler(state: GameState): GameVersionHandler | undefined {
  const handler = gameVersionRegistry.get(
    `${state.ruleset_version}\u0000${state.content_revision}`,
  );
  return handler?.accepts?.(state) === false ? undefined : handler;
}

function canonicalCommand(command: {
  readonly command_name: string;
  readonly payload: unknown;
  readonly schema: string;
}): string {
  const canonical = canonicalize({
    command_name: command.command_name,
    payload: command.payload,
    schema: command.schema,
  });
  if (canonical === undefined) {
    throw new Error("Command could not be canonicalized");
  }
  return canonical;
}

export function canonicalGameplayCommand(command: GameplayCommand): string {
  return canonicalCommand(command);
}

export function canonicalMoveCommand(command: MoveUnitCommand): string {
  return canonicalGameplayCommand(command);
}

export function canonicalMoveCommandHash(command: MoveUnitCommand): string {
  return createHash("sha256")
    .update(canonicalGameplayCommand(command), "utf8")
    .digest("hex");
}

export function canonicalGameplayCommandHash(command: GameplayCommand): string {
  return createHash("sha256")
    .update(canonicalGameplayCommand(command), "utf8")
    .digest("hex");
}

export function canonicalHostManagementCommandHash(
  command: HostManagementCommand,
): string {
  return createHash("sha256")
    .update(canonicalCommand(command), "utf8")
    .digest("hex");
}

export class InMemoryGameService {
  readonly #deletionLedger: DeletionReceipt[] = [];
  readonly #games = new Map<string, GameRecord>();
  readonly #hostBindings: HostBinding[] = [];
  readonly #invitations = new Map<string, Invitation>();
  readonly #pepper: Uint8Array;
  readonly #recoveryGrants = new Map<string, RecoveryGrant>();
  readonly #seatBindings: SeatBinding[] = [];
  readonly #sessionsByHash = new Map<string, BrowserSession>();
  readonly #sessionsById = new Map<string, BrowserSession>();
  readonly #now: () => number;

  constructor(
    options: {
      now?: () => number;
      pepper?: Uint8Array;
      snapshot?: GameServiceSnapshot;
    } = {},
  ) {
    this.#now = options.now ?? Date.now;
    this.#pepper = options.pepper ?? randomBytes(32);
    if (options.snapshot !== undefined) {
      for (const [gameId, game] of options.snapshot.games) {
        const savedState = structuredClone(game.state);
        const savedActions = structuredClone(game.actions);
        const canonicalizationVersions = new Map(
          savedActions.flatMap((action) =>
            action.commandId === null
              ? []
              : [[action.commandId, action.canonicalizationVersion] as const],
          ),
        );
        const handler = gameVersionHandler(savedState);
        this.#games.set(gameId, {
          actions: [...savedActions],
          commandResults: new Map(
            structuredClone(game.commandResults).map(([commandId, record]) => [
              commandId,
              {
                ...record,
                canonicalizationVersion:
                  record.canonicalizationVersion ??
                  canonicalizationVersions.get(commandId) ??
                  null,
              },
            ]),
          ),
          ...(game.creation === undefined
            ? {}
            : { creation: structuredClone(game.creation) }),
          deletedAt: game.deletedAt ?? null,
          deletedBy: game.deletedBy ?? null,
          hostCommandResults: new Map(
            structuredClone(game.hostCommandResults ?? []).map(
              ([commandId, record]) => [
                commandId,
                {
                  ...record,
                  canonicalizationVersion:
                    record.canonicalizationVersion ??
                    canonicalizationVersions.get(commandId) ??
                    null,
                },
              ],
            ),
          ),
          state:
            handler === undefined
              ? savedState
              : handler.normalize(savedState, savedActions),
        });
      }
      this.#deletionLedger.push(
        ...structuredClone(options.snapshot.deletionLedger ?? []),
      );
      this.#hostBindings.push(
        ...structuredClone(options.snapshot.hostBindings),
      );
      for (const [lookupId, invitation] of options.snapshot.invitations) {
        this.#invitations.set(lookupId, structuredClone(invitation));
      }
      for (const [lookupId, grant] of options.snapshot.recoveryGrants) {
        this.#recoveryGrants.set(lookupId, {
          ...structuredClone(grant),
          targetBindingType: grant.targetBindingType ?? "seat",
        });
      }
      this.#seatBindings.push(
        ...structuredClone(options.snapshot.seatBindings),
      );
      for (const session of structuredClone(options.snapshot.sessions)) {
        this.#sessionsByHash.set(session.credentialHash, session);
        this.#sessionsById.set(session.id, session);
      }
    }
  }

  exportSnapshot(): GameServiceSnapshot {
    return structuredClone({
      games: [...this.#games].map(([gameId, game]) => [
        gameId,
        {
          actions: game.actions,
          commandResults: [...game.commandResults],
          ...(game.creation === undefined ? {} : { creation: game.creation }),
          deletedAt: game.deletedAt,
          deletedBy: game.deletedBy,
          hostCommandResults: [...game.hostCommandResults],
          state: game.state,
        },
      ]),
      deletionLedger: this.#deletionLedger,
      hostBindings: this.#hostBindings,
      invitations: [...this.#invitations],
      recoveryGrants: [...this.#recoveryGrants],
      seatBindings: this.#seatBindings,
      sessions: [...this.#sessionsById.values()],
    });
  }

  isVersionRegistryReady(): boolean {
    return [...this.#games.values()].every(
      (game) =>
        game.deletedAt !== null || gameVersionHandler(game.state) !== undefined,
    );
  }

  getDeletionLedger(): readonly DeletionReceipt[] {
    return structuredClone(this.#deletionLedger);
  }

  synchronizeDeletionLedger(
    externalReceipts: readonly DeletionReceipt[],
  ): readonly DeletionReceipt[] {
    if (externalReceipts.length < this.#deletionLedger.length) {
      throw new Error("External deletion ledger is behind local state");
    }
    const gameDeletionStates = new Map<string, "deleted" | "purged">();
    for (const [index, receipt] of externalReceipts.entries()) {
      const invalidFields = [
        receipt.position === index + 1 ? undefined : "position",
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          receipt.gameId,
        )
          ? undefined
          : "gameId",
        Number.isSafeInteger(receipt.deletedAt) && receipt.deletedAt >= 0
          ? undefined
          : "deletedAt",
        receipt.purgedAt === null ||
        (Number.isSafeInteger(receipt.purgedAt) &&
          receipt.purgedAt >= receipt.deletedAt)
          ? undefined
          : "purgedAt",
        receipt.actor.trim() === "" ? "actor" : undefined,
      ].filter((field): field is string => field !== undefined);
      if (invalidFields.length > 0) {
        throw new Error(
          `External deletion ledger receipt ${index + 1} has invalid ${invalidFields.join(", ")}`,
        );
      }
      const local = this.#deletionLedger[index];
      const matchesLocal =
        local !== undefined &&
        local.actor === receipt.actor &&
        local.deletedAt === receipt.deletedAt &&
        local.gameId === receipt.gameId &&
        local.position === receipt.position &&
        local.purgedAt === receipt.purgedAt;
      const priorState = gameDeletionStates.get(receipt.gameId);
      if (
        (receipt.purgedAt === null && priorState !== undefined) ||
        (receipt.purgedAt !== null && priorState !== "deleted" && !matchesLocal)
      ) {
        throw new Error("External deletion ledger is invalid");
      }
      gameDeletionStates.set(
        receipt.gameId,
        receipt.purgedAt === null ? "deleted" : "purged",
      );
      if (local !== undefined && !matchesLocal) {
        throw new Error("External deletion ledger conflicts with local state");
      }
    }

    const applied: DeletionReceipt[] = [];
    for (const receipt of externalReceipts.slice(this.#deletionLedger.length)) {
      const cloned = structuredClone(receipt);
      this.#deletionLedger.push(cloned);
      applied.push(cloned);
      const game = this.#games.get(receipt.gameId);
      if (receipt.purgedAt === null) {
        if (game !== undefined) {
          game.deletedAt = receipt.deletedAt;
          game.deletedBy = receipt.actor;
        }
        for (const binding of this.#hostBindings) {
          if (binding.gameId === receipt.gameId && binding.revokedAt === null)
            binding.revokedAt = receipt.deletedAt;
        }
        for (const binding of this.#seatBindings) {
          if (binding.gameId === receipt.gameId && binding.revokedAt === null)
            binding.revokedAt = receipt.deletedAt;
        }
        for (const invitation of this.#invitations.values()) {
          if (
            invitation.gameId === receipt.gameId &&
            invitation.revokedAt === null
          ) {
            invitation.revokedAt = receipt.deletedAt;
            delete invitation.sealedClaimCredential;
            this.#destroyInvitationSecret(invitation.lookupId);
          }
        }
        for (const grant of this.#recoveryGrants.values()) {
          if (grant.gameId === receipt.gameId && grant.revokedAt === null)
            grant.revokedAt = receipt.deletedAt;
        }
      } else {
        this.#games.delete(receipt.gameId);
        for (const [lookupId, invitation] of this.#invitations) {
          if (invitation.gameId === receipt.gameId)
            this.#invitations.delete(lookupId);
        }
        for (const [lookupId, grant] of this.#recoveryGrants) {
          if (grant.gameId === receipt.gameId)
            this.#recoveryGrants.delete(lookupId);
        }
      }
    }

    const retainedGameIds = new Set(this.#games.keys());
    for (let index = this.#hostBindings.length - 1; index >= 0; index -= 1) {
      if (!retainedGameIds.has(this.#hostBindings[index]!.gameId)) {
        this.#hostBindings.splice(index, 1);
      }
    }
    for (let index = this.#seatBindings.length - 1; index >= 0; index -= 1) {
      if (!retainedGameIds.has(this.#seatBindings[index]!.gameId)) {
        this.#seatBindings.splice(index, 1);
      }
    }
    const retainedSessionIds = new Set([
      ...this.#hostBindings.map((binding) => binding.sessionId),
      ...this.#seatBindings.map((binding) => binding.sessionId),
    ]);
    for (const [sessionId, session] of this.#sessionsById) {
      if (!retainedSessionIds.has(sessionId)) {
        this.#sessionsById.delete(sessionId);
        this.#sessionsByHash.delete(session.credentialHash);
      }
    }
    return structuredClone(applied);
  }

  purgeDeletedGames(): readonly DeletionReceipt[] {
    const purgedAt = this.#now();
    const receipts: DeletionReceipt[] = [];

    for (const invitation of this.#invitations.values()) {
      if (invitation.expiresAt <= purgedAt) {
        delete invitation.sealedClaimCredential;
        this.#destroyInvitationSecret(invitation.lookupId);
      }
    }
    for (const grant of this.#recoveryGrants.values()) {
      if (grant.expiresAt <= purgedAt) delete grant.sealedClaimCredential;
    }

    for (const [gameId, game] of this.#games) {
      if (
        game.deletedAt === null ||
        game.deletedAt + DELETION_RETENTION_MS > purgedAt
      ) {
        continue;
      }
      const receipt: DeletionReceipt = {
        actor: game.deletedBy ?? "unknown",
        deletedAt: game.deletedAt,
        gameId,
        position: this.#deletionLedger.length + receipts.length + 1,
        purgedAt,
      };
      receipts.push(receipt);
    }
    return this.synchronizeDeletionLedger([
      ...this.#deletionLedger,
      ...receipts,
    ]);
  }

  createGame(
    side: Side,
    existingCredential?: string,
    creationId: string = randomUUID(),
    creationCredential?: string,
  ): CreateGameResult {
    const replay = [...this.#games.values()].find(
      (game) => game.creation?.creationId === creationId,
    );
    if (replay?.creation !== undefined) {
      if (replay.creation.side !== side) {
        throw new ServiceError(
          "creation_conflict",
          "Creation identifier was already used for another seat.",
        );
      }
      const suppliedSession =
        this.#findSession(existingCredential) ??
        this.#findSession(creationCredential);
      if (suppliedSession?.id !== replay.creation.sessionId) {
        throw new ServiceError(
          "unauthorized",
          "Creation identifier belongs to another browser session.",
        );
      }
      const invitation = this.#invitations.get(
        replay.creation.invitationLookupId,
      );
      if (
        invitation === undefined ||
        invitation.claimedAt !== null ||
        invitation.revokedAt !== null ||
        invitation.expiresAt <= this.#now() ||
        replay.creation.sealedCredential === undefined ||
        replay.creation.sealedInvitationSecret === undefined
      ) {
        throw new ServiceError(
          "creation_unavailable",
          "The original game creation result is no longer available.",
        );
      }
      let credential: string;
      let invitationSecret: string;
      try {
        credential = openInvitationSecret(
          this.#pepper,
          replay.creation.sealedCredential,
        );
        invitationSecret = openInvitationSecret(
          this.#pepper,
          replay.creation.sealedInvitationSecret,
        );
      } catch {
        throw new ServiceError(
          "creation_unavailable",
          "The original game creation credentials are unavailable.",
        );
      }
      const session = this.#findSession(credential);
      if (session?.id !== replay.creation.sessionId) {
        throw new ServiceError(
          "creation_unavailable",
          "The original browser session is no longer available.",
        );
      }
      return {
        credential,
        gameId: replay.state.game_id,
        invitation: {
          lookup_id: invitation.lookupId,
          secret: invitationSecret,
        },
        seat: side,
        sessionId: session.id,
        state: cloneState(replay.state),
      };
    }

    const session = this.#resolveOrCreateSession(
      existingCredential,
      creationCredential,
    );
    const gameId = randomUUID();
    const state = createMandatoryInitialState(gameId);

    const invitation = this.#createInvitation(gameId, otherSide(side));
    this.#games.set(gameId, {
      actions: [],
      commandResults: new Map(),
      creation: {
        creationId,
        invitationLookupId: invitation.lookup_id,
        sealedCredential: sealInvitationSecret(
          this.#pepper,
          session.credential,
        ),
        sealedInvitationSecret: sealInvitationSecret(
          this.#pepper,
          invitation.secret,
        ),
        sessionId: session.sessionId,
        side,
      },
      deletedAt: null,
      deletedBy: null,
      hostCommandResults: new Map(),
      state,
    });
    this.#hostBindings.push({
      gameId,
      activeAfterSequence: 0,
      id: randomUUID(),
      revokedAt: null,
      sessionId: session.sessionId,
      version: 1,
    });
    this.#seatBindings.push({
      gameId,
      activeAfterSequence: 0,
      id: randomUUID(),
      revokedAt: null,
      sessionId: session.sessionId,
      side,
      version: 1,
    });

    return {
      ...session,
      gameId,
      invitation,
      seat: side,
      state: cloneState(state),
    };
  }

  claimInvitation(input: {
    claimId?: string;
    credential?: string;
    lookupId: string;
    requestedGameId?: string;
    requestedSeat?: Side;
    secret: string;
  }): ClaimResult {
    const invitation = this.#invitations.get(input.lookupId);
    const now = this.#now();
    if (invitation !== undefined && invitation.expiresAt <= now) {
      delete invitation.sealedClaimCredential;
    }
    if (
      invitation === undefined ||
      invitation.revokedAt !== null ||
      invitation.expiresAt <= now ||
      !this.#credentialMatches("invitation", input.secret, invitation.tokenHash)
    ) {
      throw new ServiceError(
        "invitation_unavailable",
        "Invitation is invalid, expired, or already used.",
      );
    }
    if (invitation.claimedAt !== null) {
      if (
        invitation.claimId !== input.claimId ||
        invitation.sealedClaimCredential === undefined
      ) {
        throw new ServiceError(
          "invitation_unavailable",
          "Invitation is invalid, expired, or already used.",
        );
      }
      let credential: string;
      try {
        credential = openInvitationSecret(
          this.#pepper,
          invitation.sealedClaimCredential,
        );
      } catch {
        throw new ServiceError(
          "invitation_unavailable",
          "The claimed invitation credential is unavailable.",
        );
      }
      const session = this.#findSession(credential);
      const binding = this.#activeSeatBindings(invitation.gameId).find(
        (candidate) =>
          candidate.side === invitation.allowedSeat &&
          candidate.sessionId === session?.id,
      );
      if (session === undefined || binding === undefined) {
        throw new ServiceError(
          "invitation_unavailable",
          "The claimed invitation is no longer recoverable.",
        );
      }
      return {
        credential,
        gameId: invitation.gameId,
        seat: invitation.allowedSeat,
        sessionId: session.id,
        state: this.getGameState(invitation.gameId),
      };
    }
    this.#requireActiveGame(invitation.gameId);

    if (
      (input.requestedGameId !== undefined &&
        input.requestedGameId !== invitation.gameId) ||
      (input.requestedSeat !== undefined &&
        input.requestedSeat !== invitation.allowedSeat)
    ) {
      throw new ServiceError(
        "invitation_mismatch",
        "Invitation does not match the requested game and seat.",
      );
    }

    const existingSession = this.#findSession(input.credential);
    if (
      existingSession !== undefined &&
      this.#activeSeatBindings(invitation.gameId).some(
        (binding) => binding.sessionId === existingSession.id,
      )
    ) {
      throw new ServiceError(
        "seat_unavailable",
        "One browser session cannot hold both seats in a game.",
      );
    }

    if (
      this.#activeSeatBindings(invitation.gameId).some(
        (binding) => binding.side === invitation.allowedSeat,
      )
    ) {
      throw new ServiceError(
        "seat_unavailable",
        "That seat is already claimed.",
      );
    }

    const session = this.#resolveOrCreateSession(input.credential);
    invitation.claimId = input.claimId ?? randomUUID();
    invitation.claimedAt = now;
    invitation.sealedClaimCredential = sealInvitationSecret(
      this.#pepper,
      session.credential,
    );
    this.#destroyInvitationSecret(invitation.lookupId);
    this.#seatBindings.push({
      gameId: invitation.gameId,
      activeAfterSequence: this.#requireActiveGame(invitation.gameId).state
        .event_sequence,
      id: randomUUID(),
      revokedAt: null,
      sessionId: session.sessionId,
      side: invitation.allowedSeat,
      version: 1,
    });

    return {
      ...session,
      gameId: invitation.gameId,
      seat: invitation.allowedSeat,
      state: this.getGameState(invitation.gameId),
    };
  }

  authenticate(
    credential: string | undefined,
    gameId: string,
  ): GameAuthorization {
    this.#requireActiveGame(gameId);
    const session = this.#findSession(credential);
    if (session === undefined) {
      throw new ServiceError(
        "unauthorized",
        "A valid browser session is required.",
      );
    }

    const binding = this.#activeSeatBindings(gameId).find(
      (candidate) => candidate.sessionId === session.id,
    );
    if (binding === undefined) {
      throw new ServiceError(
        "unauthorized",
        "No active seat binding was found.",
      );
    }

    return {
      bindingId: binding.id,
      bindingVersion: binding.version,
      gameId,
      sessionId: session.id,
      side: binding.side,
    };
  }

  authenticateHost(
    credential: string | undefined,
    gameId: string,
    options: { terminalCommandId?: string } = {},
  ): HostAuthorization {
    const game = this.#requireGame(gameId);
    const session = this.#findSession(credential);
    if (
      credential !== undefined &&
      isCanonicalCredential(credential) &&
      game.deletedAt !== null &&
      game.deletedAt + DELETION_RETENTION_MS > this.#now() &&
      options.terminalCommandId !== undefined
    ) {
      const previous = game.hostCommandResults.get(options.terminalCommandId);
      const verifier = credentialVerifier(
        this.#pepper,
        "browser-session",
        credential,
      );
      if (
        previous?.result.event.command_name === "deleteGame" &&
        previous.terminalCredentialHash !== undefined &&
        hashesEqual(previous.terminalCredentialHash, verifier)
      ) {
        return {
          bindingId: previous.authorizingBindingId,
          bindingVersion: previous.authorizingBindingVersion,
          gameId,
          sessionId: "terminal-delete-retry",
        };
      }
    }
    if (session === undefined) {
      throw new ServiceError(
        "unauthorized",
        "A valid browser session is required.",
      );
    }
    const binding = this.#hostBindings.find(
      (candidate) =>
        candidate.gameId === gameId &&
        candidate.sessionId === session.id &&
        candidate.revokedAt === null,
    );
    if (
      binding === undefined &&
      game.deletedAt !== null &&
      game.deletedAt + DELETION_RETENTION_MS > this.#now() &&
      options.terminalCommandId !== undefined
    ) {
      const previous = game.hostCommandResults.get(options.terminalCommandId);
      const tombstone = this.#hostBindings.find(
        (candidate) =>
          candidate.id === previous?.authorizingBindingId &&
          candidate.version === previous.authorizingBindingVersion &&
          candidate.gameId === gameId &&
          candidate.sessionId === session.id &&
          candidate.revokedAt !== null &&
          previous.result.event.command_name === "deleteGame",
      );
      if (tombstone !== undefined) {
        return {
          bindingId: tombstone.id,
          bindingVersion: tombstone.version,
          gameId,
          sessionId: session.id,
        };
      }
    }
    if (binding === undefined) {
      if (game.deletedAt !== null) {
        throw new ServiceError("game_deleted", "Game has been deleted.");
      }
      throw new ServiceError(
        "unauthorized",
        "No active host binding was found.",
      );
    }
    return {
      bindingId: binding.id,
      bindingVersion: binding.version,
      gameId,
      sessionId: session.id,
    };
  }

  canRetryTerminalDelete(
    credential: string | undefined,
    gameId: string,
    commandId: string,
  ): boolean {
    try {
      const game = this.#requireGame(gameId);
      if (game.deletedAt === null) return false;
      const authorization = this.authenticateHost(credential, gameId, {
        terminalCommandId: commandId,
      });
      const previous = game.hostCommandResults.get(commandId);
      return (
        previous?.result.event.command_name === "deleteGame" &&
        previous.authorizingBindingId === authorization.bindingId &&
        previous.authorizingBindingVersion === authorization.bindingVersion
      );
    } catch {
      return false;
    }
  }

  executeHostCommand(
    authorization: HostAuthorization,
    input: unknown,
    options: { afterCommit?: (event: ManagementEvent) => void } = {},
  ): HostManagementResult {
    const game = this.#requireGame(authorization.gameId);
    const parsed = hostManagementCommandSchema.safeParse(input);
    if (!parsed.success) {
      return this.#failure(
        game.state,
        "invalid_payload",
        "Host-management command is invalid.",
      );
    }
    const command = parsed.data as HostManagementCommand;
    if (command.game_id !== authorization.gameId) {
      return this.#failure(
        game.state,
        "unauthorized",
        "Command targets another game.",
      );
    }
    if (game.commandResults.has(command.command_id)) {
      return this.#failure(
        game.state,
        "command_id_conflict",
        "Command identifier was already used by a gameplay command.",
      );
    }

    const canonicalHash = canonicalHostManagementCommandHash(command);
    const previous = game.hostCommandResults.get(command.command_id);
    if (previous !== undefined) {
      if (
        previous.authorizingBindingId !== authorization.bindingId ||
        previous.authorizingBindingVersion !== authorization.bindingVersion
      ) {
        return this.#failure(
          game.state,
          "unauthorized",
          "Command identifier belongs to another host binding.",
        );
      }
      if (previous.canonicalizationVersion !== COMMAND_SCHEMA_VERSION) {
        return this.#failure(
          game.state,
          "version_unavailable",
          "This command retry uses an unavailable canonicalization version.",
        );
      }
      if (!hashesEqual(previous.canonicalHash, canonicalHash)) {
        return this.#failure(
          game.state,
          "command_id_conflict",
          "Command identifier was already used for different input.",
        );
      }
      const session = this.#sessionsById.get(authorization.sessionId);
      const binding = this.#hostBindings.find(
        (candidate) =>
          candidate.id === authorization.bindingId &&
          candidate.version === authorization.bindingVersion &&
          candidate.gameId === authorization.gameId &&
          candidate.sessionId === authorization.sessionId,
      );
      const terminalDeleteRetry =
        command.command_name === "deleteGame" &&
        binding?.revokedAt !== null &&
        game.deletedAt !== null &&
        game.deletedAt + DELETION_RETENTION_MS > this.#now();
      const credentialOnlyTerminalRetry =
        command.command_name === "deleteGame" &&
        game.deletedAt !== null &&
        authorization.sessionId === "terminal-delete-retry" &&
        previous.terminalCredentialHash !== undefined;
      if (
        !credentialOnlyTerminalRetry &&
        (session === undefined ||
          session.revokedAt !== null ||
          session.expiresAt <= this.#now() ||
          binding === undefined ||
          (binding.revokedAt !== null && !terminalDeleteRetry))
      ) {
        return this.#failure(
          game.state,
          "unauthorized",
          "Host binding is no longer authorized for this retry.",
        );
      }
      if (
        previous.invitationLookupId !== undefined &&
        previous.sealedInvitationSecret !== undefined
      ) {
        const target = this.#invitations.get(previous.invitationLookupId);
        if (
          target !== undefined &&
          target.claimedAt === null &&
          target.revokedAt === null &&
          target.expiresAt > this.#now()
        ) {
          try {
            return {
              ...structuredClone(previous.result),
              invitation: {
                lookup_id: previous.invitationLookupId,
                secret: openInvitationSecret(
                  this.#pepper,
                  previous.sealedInvitationSecret,
                ),
              },
            };
          } catch {
            throw new ServiceError(
              "invitation_unavailable",
              "The stored invitation secret is unavailable.",
            );
          }
        }
      }
      return structuredClone(previous.result);
    }
    this.#assertHostAuthorization(authorization);
    this.#requireActiveGame(authorization.gameId);
    if (command.expected_version !== game.state.version) {
      return this.#failure(
        game.state,
        "stale_version",
        "Game changed; the latest state has been restored.",
      );
    }

    let invitation: InvitationCredential | undefined;
    let terminalCredentialHash: string | undefined;
    let summary: string;
    const now = this.#now();
    switch (command.command_name) {
      case "issueInvitation":
        if (
          this.#activeSeatBindings(authorization.gameId).some(
            (binding) => binding.side === command.payload.seat,
          )
        ) {
          throw new ServiceError(
            "seat_unavailable",
            "That seat is already claimed.",
          );
        }
        invitation = this.#createInvitation(
          authorization.gameId,
          command.payload.seat,
        );
        summary = `${command.payload.seat} invitation issued`;
        break;
      case "revokeInvitation": {
        const target = this.#invitations.get(command.payload.lookup_id);
        if (
          target === undefined ||
          target.gameId !== authorization.gameId ||
          target.claimedAt !== null ||
          target.revokedAt !== null ||
          target.expiresAt <= now
        ) {
          throw new ServiceError(
            "invitation_unavailable",
            "Invitation cannot be revoked.",
          );
        }
        target.revokedAt = now;
        this.#destroyInvitationSecret(command.payload.lookup_id);
        summary = `${target.allowedSeat} invitation revoked`;
        break;
      }
      case "deleteGame":
        terminalCredentialHash = this.#sessionsById.get(
          authorization.sessionId,
        )?.credentialHash;
        summary = "Game deleted";
        game.deletedAt = now;
        game.deletedBy = authorization.bindingId;
        this.#deletionLedger.push({
          actor: authorization.bindingId,
          deletedAt: now,
          gameId: authorization.gameId,
          position: this.#deletionLedger.length + 1,
          purgedAt: null,
        });
        for (const binding of this.#seatBindings) {
          if (
            binding.gameId === authorization.gameId &&
            binding.revokedAt === null
          ) {
            binding.revokedAt = now;
            binding.inactiveFromSequence = game.state.event_sequence + 1;
          }
        }
        for (const binding of this.#hostBindings) {
          if (
            binding.gameId === authorization.gameId &&
            binding.revokedAt === null
          )
            binding.revokedAt = now;
        }
        for (const target of this.#invitations.values()) {
          if (
            target.gameId === authorization.gameId &&
            target.revokedAt === null
          ) {
            target.revokedAt = now;
            delete target.sealedClaimCredential;
            this.#destroyInvitationSecret(target.lookupId);
          }
        }
        for (const grant of this.#recoveryGrants.values()) {
          if (grant.gameId === authorization.gameId && grant.revokedAt === null)
            grant.revokedAt = now;
        }
        break;
    }

    game.state = {
      ...game.state,
      event_sequence: game.state.event_sequence + 1,
    };
    const result: HostManagementSuccess = {
      event: {
        command_id: command.command_id,
        command_name: command.command_name,
        event_sequence: game.state.event_sequence,
        kind: "host_management",
        state_version: game.state.version,
        summary,
      },
      ...(invitation === undefined ? {} : { invitation }),
      ok: true,
    };
    const persistedResult: HostManagementSuccess = {
      event: result.event,
      ok: true,
    };
    game.hostCommandResults.set(command.command_id, {
      authorizingBindingId: authorization.bindingId,
      authorizingBindingVersion: authorization.bindingVersion,
      canonicalHash,
      canonicalizationVersion: COMMAND_SCHEMA_VERSION,
      ...(invitation === undefined
        ? {}
        : {
            invitationLookupId: invitation.lookup_id,
            sealedInvitationSecret: sealInvitationSecret(
              this.#pepper,
              invitation.secret,
            ),
          }),
      ...(terminalCredentialHash === undefined
        ? {}
        : { terminalCredentialHash }),
      result: structuredClone(persistedResult),
    });
    game.actions.push({
      authorizingId: authorization.bindingId,
      authorizingType: "host",
      authorizingVersion: authorization.bindingVersion,
      canonicalRequestHash: canonicalHash,
      canonicalizationVersion: COMMAND_SCHEMA_VERSION,
      commandId: command.command_id,
      commandName: command.command_name,
      contentRevision: game.state.content_revision,
      expectedVersion: command.expected_version,
      kind: "host_management",
      operatorRequestId: null,
      payload: structuredClone(command.payload),
      result: structuredClone(persistedResult),
      resultingVersion: game.state.version,
      sequence: game.state.event_sequence,
      rulesetVersion: game.state.ruleset_version,
    });
    options.afterCommit?.(result.event);
    if (command.command_name === "deleteGame") {
      this.#dropBindingsForGame(authorization.gameId);
    }
    return structuredClone(result);
  }

  executeMove(
    authorization: GameAuthorization,
    input: unknown,
    options: { afterCommit?: () => void } = {},
  ): CommandResult {
    return this.executeCommand(authorization, input, options);
  }

  executeCommand(
    authorization: GameAuthorization,
    input: unknown,
    options: { afterCommit?: () => void } = {},
  ): CommandResult {
    const game = this.#games.get(authorization.gameId);
    if (game === undefined) {
      throw new ServiceError("game_not_found", "Game does not exist.");
    }

    const parsed = gameplayCommandSchema.safeParse(input);
    if (!parsed.success) {
      return this.#failure(
        game.state,
        "invalid_payload",
        "Move command is invalid.",
      );
    }

    const command = parsed.data as GameplayCommand;
    if (command.game_id !== authorization.gameId) {
      return this.#failure(
        game.state,
        "unauthorized",
        "Command targets another game.",
      );
    }
    if (game.hostCommandResults.has(command.command_id)) {
      return this.#failure(
        game.state,
        "command_id_conflict",
        "Command identifier was already used by a host-management command.",
      );
    }

    const canonicalHash = canonicalGameplayCommandHash(command);
    const previous = game.commandResults.get(command.command_id);
    if (previous !== undefined) {
      if (
        previous.authorizingBindingId !== authorization.bindingId ||
        previous.authorizingBindingVersion !== authorization.bindingVersion
      ) {
        return this.#failure(
          game.state,
          "unauthorized",
          "Command identifier belongs to another seat binding.",
        );
      }
      if (previous.canonicalizationVersion !== COMMAND_SCHEMA_VERSION) {
        return this.#failure(
          game.state,
          "version_unavailable",
          "This command retry uses an unavailable canonicalization version.",
        );
      }
      if (!hashesEqual(previous.canonicalHash, canonicalHash)) {
        return this.#failure(
          game.state,
          "command_id_conflict",
          "Command identifier was already used for different input.",
        );
      }
      const session = this.#sessionsById.get(authorization.sessionId);
      const binding = this.#seatBindings.find(
        (candidate) =>
          candidate.id === authorization.bindingId &&
          candidate.version === authorization.bindingVersion &&
          candidate.gameId === authorization.gameId &&
          candidate.sessionId === authorization.sessionId &&
          candidate.side === authorization.side,
      );
      if (
        session === undefined ||
        session.revokedAt !== null ||
        session.expiresAt <= this.#now() ||
        binding === undefined ||
        (binding.revokedAt !== null && command.command_name !== "surrenderSeat")
      ) {
        return this.#failure(
          game.state,
          "unauthorized",
          "Command binding is no longer authorized for this retry.",
        );
      }
      return structuredClone(previous.result);
    }

    this.#assertAuthorization(authorization);
    this.#requireActiveGame(authorization.gameId);

    if (command.expected_version !== game.state.version) {
      return this.#failure(
        game.state,
        "stale_version",
        "Game changed; the latest state has been restored.",
      );
    }

    if (command.command_name === "surrenderSeat") {
      if (
        Object.values(game.state.combats).some(
          (combat) =>
            combat.pending_choice !== null &&
            combat.pending_choice.side === authorization.side,
        )
      ) {
        return this.#failure(
          game.state,
          "pending_choice",
          "Resolve this seat's pending combat choice before surrendering.",
        );
      }

      const binding = this.#seatBindings.find(
        (candidate) =>
          candidate.id === authorization.bindingId &&
          candidate.version === authorization.bindingVersion &&
          candidate.revokedAt === null,
      )!;
      const now = this.#now();
      binding.revokedAt = now;
      binding.inactiveFromSequence = game.state.event_sequence + 2;
      for (const invitation of this.#invitations.values()) {
        if (
          invitation.gameId === authorization.gameId &&
          invitation.allowedSeat === authorization.side
        ) {
          delete invitation.sealedClaimCredential;
          if (invitation.claimedAt === null && invitation.revokedAt === null) {
            invitation.revokedAt = now;
          }
          this.#destroyInvitationSecret(invitation.lookupId);
        }
      }
      game.state = {
        ...game.state,
        event_sequence: game.state.event_sequence + 1,
        version: game.state.version + 1,
      };
      const result = toCommandSuccess(
        game.state,
        command,
        `${authorization.side} seat surrendered`,
      );
      game.commandResults.set(command.command_id, {
        authorizingBindingId: authorization.bindingId,
        authorizingBindingVersion: authorization.bindingVersion,
        canonicalHash,
        canonicalizationVersion: COMMAND_SCHEMA_VERSION,
        result: structuredClone(result),
      });
      game.actions.push({
        authorizingId: authorization.bindingId,
        authorizingType: "seat",
        authorizingVersion: authorization.bindingVersion,
        canonicalRequestHash: canonicalHash,
        canonicalizationVersion: COMMAND_SCHEMA_VERSION,
        commandId: command.command_id,
        commandName: command.command_name,
        contentRevision: game.state.content_revision,
        expectedVersion: command.expected_version,
        kind: "gameplay",
        operatorRequestId: null,
        payload: {},
        result: structuredClone(result),
        resultingVersion: result.state.version,
        sequence: result.event.event_sequence,
        rulesetVersion: game.state.ruleset_version,
      });
      options.afterCommit?.();
      return structuredClone(result);
    }

    const automaticSkirmishes =
      command.command_name === "endPhase" &&
      (game.state.phase === "movement" ||
        (game.state.phase === "combat" &&
          Object.keys(game.state.combats).length === 0))
        ? combatSkirmishes(game.state, authorization.side)
        : undefined;
    const reduced = reduceGameplayCommand(
      game.state,
      authorization.side,
      command,
      {
        ...(automaticSkirmishes !== undefined
          ? {
              automaticCombats: (automaticSkirmishes ?? []).map(() => ({
                combat_id: randomUUID(),
                dice: {
                  attacker: randomInt(1, 11),
                  defender: randomInt(1, 11),
                },
              })),
            }
          : {}),
        ...(command.command_name === "rollCombat" ||
        command.command_name === "declareCombat"
          ? { dice: { attacker: randomInt(1, 11), defender: randomInt(1, 11) } }
          : {}),
      },
    );
    if (!reduced.ok) {
      return reduced.failure;
    }

    const result = toCommandSuccess(reduced.state, command, reduced.summary);
    game.state = reduced.state;
    game.commandResults.set(command.command_id, {
      authorizingBindingId: authorization.bindingId,
      authorizingBindingVersion: authorization.bindingVersion,
      canonicalHash,
      canonicalizationVersion: COMMAND_SCHEMA_VERSION,
      result: structuredClone(result),
    });
    game.actions.push({
      authorizingId: authorization.bindingId,
      authorizingType: "seat",
      authorizingVersion: authorization.bindingVersion,
      canonicalRequestHash: canonicalHash,
      canonicalizationVersion: COMMAND_SCHEMA_VERSION,
      commandId: command.command_id,
      commandName: command.command_name,
      contentRevision: game.state.content_revision,
      expectedVersion: command.expected_version,
      kind: "gameplay",
      operatorRequestId: null,
      payload: structuredClone(command.payload),
      result: structuredClone(result),
      resultingVersion: result.state.version,
      sequence: result.event.event_sequence,
      rulesetVersion: game.state.ruleset_version,
    });

    options.afterCommit?.();
    return structuredClone(result);
  }

  issueSeatRecovery(
    gameId: string,
    side: Side,
    operatorIdentity: string,
  ): RecoveryIssueResult {
    this.#requireActiveGame(gameId);
    if (operatorIdentity.trim() === "") {
      throw new ServiceError("unauthorized", "Operator identity is required.");
    }

    const binding = this.#activeSeatBindings(gameId).find(
      (candidate) => candidate.side === side,
    );
    if (binding === undefined) {
      throw new ServiceError(
        "recovery_unavailable",
        "Active seat was not found.",
      );
    }

    const secret = generateCredential();
    const lookupId = randomUUID();
    this.#recoveryGrants.set(lookupId, {
      consumedAt: null,
      expiresAt: this.#now() + RECOVERY_LIFETIME_MS,
      gameId,
      lookupId,
      oldBindingId: binding.id,
      oldBindingVersion: binding.version,
      operatorIdentity,
      revokedAt: null,
      side,
      targetBindingType: "seat",
      tokenHash: credentialVerifier(this.#pepper, "recovery-grant", secret),
    });
    return { lookup_id: lookupId, secret };
  }

  claimSeatRecovery(
    input: {
      claimId?: string;
      credential?: string;
      lookupId: string;
      secret: string;
    },
    options: { afterCommit?: (event: AuditEvent) => void } = {},
  ): ClaimResult {
    const grant = this.#recoveryGrants.get(input.lookupId);
    const now = this.#now();
    if (
      grant === undefined ||
      grant.revokedAt !== null ||
      grant.expiresAt <= now ||
      grant.targetBindingType !== "seat" ||
      grant.side === null ||
      !this.#credentialMatches("recovery-grant", input.secret, grant.tokenHash)
    ) {
      throw new ServiceError(
        "recovery_unavailable",
        "Recovery grant is invalid, expired, or already used.",
      );
    }
    if (grant.consumedAt !== null) {
      if (
        grant.claimId !== input.claimId ||
        grant.sealedClaimCredential === undefined
      ) {
        throw new ServiceError(
          "recovery_unavailable",
          "Recovery grant is invalid, expired, or already used.",
        );
      }
      let credential: string;
      try {
        credential = openInvitationSecret(
          this.#pepper,
          grant.sealedClaimCredential,
        );
      } catch {
        throw new ServiceError(
          "recovery_unavailable",
          "The recovered seat credential is unavailable.",
        );
      }
      const session = this.#findSession(credential);
      const binding = this.#activeSeatBindings(grant.gameId).find(
        (candidate) =>
          candidate.side === grant.side &&
          candidate.version === grant.oldBindingVersion + 1 &&
          candidate.sessionId === session?.id,
      );
      if (session === undefined || binding === undefined) {
        throw new ServiceError(
          "recovery_unavailable",
          "The recovered seat is no longer available.",
        );
      }
      return {
        credential,
        gameId: grant.gameId,
        seat: grant.side,
        sessionId: session.id,
        state: this.getGameState(grant.gameId),
      };
    }

    const oldBinding = this.#seatBindings.find(
      (binding) =>
        binding.id === grant.oldBindingId &&
        binding.version === grant.oldBindingVersion &&
        binding.revokedAt === null,
    );
    if (oldBinding === undefined) {
      throw new ServiceError(
        "recovery_unavailable",
        "Original binding is unavailable.",
      );
    }
    this.#requireActiveGame(grant.gameId);

    const existingSession = this.#findSession(input.credential);
    if (
      existingSession !== undefined &&
      this.#activeSeatBindings(grant.gameId).some(
        (binding) =>
          binding.sessionId === existingSession.id &&
          binding.id !== oldBinding.id,
      )
    ) {
      throw new ServiceError(
        "seat_unavailable",
        "One browser session cannot hold both seats in a game.",
      );
    }

    const session = this.#resolveOrCreateSession(undefined);
    grant.claimId = input.claimId ?? randomUUID();
    grant.sealedClaimCredential = sealInvitationSecret(
      this.#pepper,
      session.credential,
    );
    oldBinding.revokedAt = now;
    oldBinding.inactiveFromSequence =
      this.#requireActiveGame(grant.gameId).state.event_sequence + 1;
    grant.consumedAt = now;
    for (const invitation of this.#invitations.values()) {
      if (
        invitation.gameId === grant.gameId &&
        invitation.allowedSeat === grant.side
      ) {
        delete invitation.sealedClaimCredential;
      }
    }
    this.#seatBindings.push({
      gameId: grant.gameId,
      activeAfterSequence:
        this.#requireActiveGame(grant.gameId).state.event_sequence + 1,
      id: randomUUID(),
      revokedAt: null,
      sessionId: session.sessionId,
      side: grant.side,
      version: oldBinding.version + 1,
    });

    const game = this.#requireGame(grant.gameId);
    const event = this.#appendOperatorAudit(
      grant.gameId,
      grant.operatorIdentity,
    );
    options.afterCommit?.(event);

    return {
      ...session,
      gameId: grant.gameId,
      seat: grant.side,
      state: cloneState(game.state),
    };
  }

  issueHostRecovery(
    gameId: string,
    operatorIdentity: string,
  ): RecoveryIssueResult {
    this.#requireActiveGame(gameId);
    if (operatorIdentity.trim() === "") {
      throw new ServiceError("unauthorized", "Operator identity is required.");
    }
    const binding = this.#hostBindings.find(
      (candidate) =>
        candidate.gameId === gameId && candidate.revokedAt === null,
    );
    if (binding === undefined) {
      throw new ServiceError(
        "recovery_unavailable",
        "Active host binding was not found.",
      );
    }
    const secret = generateCredential();
    const lookupId = randomUUID();
    this.#recoveryGrants.set(lookupId, {
      consumedAt: null,
      expiresAt: this.#now() + RECOVERY_LIFETIME_MS,
      gameId,
      lookupId,
      oldBindingId: binding.id,
      oldBindingVersion: binding.version,
      operatorIdentity,
      revokedAt: null,
      side: null,
      targetBindingType: "host",
      tokenHash: credentialVerifier(this.#pepper, "recovery-grant", secret),
    });
    return { lookup_id: lookupId, secret };
  }

  claimHostRecovery(
    input: {
      claimId?: string;
      credential?: string;
      lookupId: string;
      secret: string;
    },
    options: { afterCommit?: (event: AuditEvent) => void } = {},
  ): HostRecoveryClaimResult {
    const grant = this.#recoveryGrants.get(input.lookupId);
    const now = this.#now();
    if (
      grant === undefined ||
      grant.targetBindingType !== "host" ||
      grant.revokedAt !== null ||
      grant.expiresAt <= now ||
      !this.#credentialMatches("recovery-grant", input.secret, grant.tokenHash)
    ) {
      throw new ServiceError(
        "recovery_unavailable",
        "Recovery grant is invalid, expired, or already used.",
      );
    }
    if (grant.consumedAt !== null) {
      if (
        grant.claimId !== input.claimId ||
        grant.sealedClaimCredential === undefined
      ) {
        throw new ServiceError(
          "recovery_unavailable",
          "Recovery grant is invalid, expired, or already used.",
        );
      }
      let credential: string;
      try {
        credential = openInvitationSecret(
          this.#pepper,
          grant.sealedClaimCredential,
        );
      } catch {
        throw new ServiceError(
          "recovery_unavailable",
          "The recovered host credential is unavailable.",
        );
      }
      const session = this.#findSession(credential);
      const binding = this.#hostBindings.find(
        (candidate) =>
          candidate.gameId === grant.gameId &&
          candidate.version === grant.oldBindingVersion + 1 &&
          candidate.sessionId === session?.id &&
          candidate.revokedAt === null,
      );
      if (session === undefined || binding === undefined) {
        throw new ServiceError(
          "recovery_unavailable",
          "The recovered host binding is no longer available.",
        );
      }
      return { credential, gameId: grant.gameId, sessionId: session.id };
    }
    const oldBinding = this.#hostBindings.find(
      (binding) =>
        binding.id === grant.oldBindingId &&
        binding.version === grant.oldBindingVersion &&
        binding.revokedAt === null,
    );
    if (oldBinding === undefined) {
      throw new ServiceError(
        "recovery_unavailable",
        "Original host binding is unavailable.",
      );
    }
    this.#requireActiveGame(grant.gameId);
    const session = this.#resolveOrCreateSession(undefined);
    grant.claimId = input.claimId ?? randomUUID();
    grant.sealedClaimCredential = sealInvitationSecret(
      this.#pepper,
      session.credential,
    );
    oldBinding.revokedAt = now;
    grant.consumedAt = now;
    this.#hostBindings.push({
      gameId: grant.gameId,
      activeAfterSequence:
        this.#requireActiveGame(grant.gameId).state.event_sequence + 1,
      id: randomUUID(),
      revokedAt: null,
      sessionId: session.sessionId,
      version: oldBinding.version + 1,
    });
    oldBinding.inactiveFromSequence =
      this.#requireActiveGame(grant.gameId).state.event_sequence + 1;
    const event = this.#appendOperatorAudit(
      grant.gameId,
      grant.operatorIdentity,
    );
    options.afterCommit?.(event);
    return { ...session, gameId: grant.gameId };
  }

  getGameState(gameId: string): GameState {
    return cloneState(this.#requireActiveGame(gameId).state);
  }

  getAuthorizedState(authorization: GameAuthorization): GameState {
    this.#assertAuthorization(authorization);
    return this.getGameState(authorization.gameId);
  }

  getActions(gameId: string): readonly StoredAction[] {
    return structuredClone(this.#requireGame(gameId).actions);
  }

  getRecoveryExport(
    credential: string | undefined,
    gameId: string,
  ): RecoveryExport {
    const game = this.#requireGame(gameId);
    if (game.deletedAt !== null) {
      throw new ServiceError("game_deleted", "Game has been deleted.");
    }
    const session = this.#findSession(credential);
    if (
      session === undefined ||
      ![...this.#hostBindings, ...this.#seatBindings].some(
        (binding) =>
          binding.gameId === gameId &&
          binding.sessionId === session.id &&
          binding.revokedAt === null,
      )
    ) {
      throw new ServiceError(
        "unauthorized",
        "A valid game binding is required for recovery export.",
      );
    }
    return structuredClone({
      action_log: game.actions,
      snapshot_metadata: {
        content_revision: game.state.content_revision,
        event_sequence: game.state.event_sequence,
        game_id: game.state.game_id,
        ruleset_version: game.state.ruleset_version,
        state_version: game.state.version,
      },
    });
  }

  getActiveInvitations(
    gameId: string,
  ): readonly { lookup_id: string; seat: Side }[] {
    this.#requireActiveGame(gameId);
    const now = this.#now();
    return [...this.#invitations.values()]
      .filter(
        (invitation) =>
          invitation.gameId === gameId &&
          invitation.claimedAt === null &&
          invitation.revokedAt === null &&
          invitation.expiresAt > now,
      )
      .map((invitation) => ({
        lookup_id: invitation.lookupId,
        seat: invitation.allowedSeat,
      }));
  }

  #dropBindingsForGame(gameId: string): void {
    for (let index = this.#hostBindings.length - 1; index >= 0; index -= 1) {
      if (this.#hostBindings[index]?.gameId === gameId)
        this.#hostBindings.splice(index, 1);
    }
    for (let index = this.#seatBindings.length - 1; index >= 0; index -= 1) {
      if (this.#seatBindings[index]?.gameId === gameId)
        this.#seatBindings.splice(index, 1);
    }
    const retainedSessionIds = new Set([
      ...this.#hostBindings.map((binding) => binding.sessionId),
      ...this.#seatBindings.map((binding) => binding.sessionId),
    ]);
    for (const [sessionId, session] of this.#sessionsById) {
      if (!retainedSessionIds.has(sessionId)) {
        this.#sessionsById.delete(sessionId);
        this.#sessionsByHash.delete(session.credentialHash);
      }
    }
  }

  #activeSeatBindings(gameId: string): SeatBinding[] {
    return this.#seatBindings.filter(
      (binding) => binding.gameId === gameId && binding.revokedAt === null,
    );
  }

  #assertHostAuthorization(authorization: HostAuthorization): void {
    const session = this.#sessionsById.get(authorization.sessionId);
    const binding = this.#hostBindings.find(
      (candidate) =>
        candidate.id === authorization.bindingId &&
        candidate.version === authorization.bindingVersion &&
        candidate.gameId === authorization.gameId &&
        candidate.sessionId === authorization.sessionId &&
        candidate.revokedAt === null,
    );
    if (
      session === undefined ||
      session.revokedAt !== null ||
      session.expiresAt <= this.#now() ||
      binding === undefined
    ) {
      throw new ServiceError(
        "unauthorized",
        "Host binding is no longer active.",
      );
    }
  }

  #appendOperatorAudit(gameId: string, operatorIdentity: string): AuditEvent {
    const game = this.#requireActiveGame(gameId);
    const commandId = randomUUID();
    game.state = {
      ...game.state,
      event_sequence: game.state.event_sequence + 1,
    };
    game.actions.push({
      authorizingId: operatorIdentity,
      authorizingType: "operator",
      authorizingVersion: 1,
      canonicalRequestHash: null,
      canonicalizationVersion: null,
      commandId: null,
      commandName: null,
      contentRevision: game.state.content_revision,
      expectedVersion: game.state.version,
      kind: "operator_audit",
      operatorRequestId: commandId,
      payload: null,
      result: null,
      resultingVersion: game.state.version,
      sequence: game.state.event_sequence,
      rulesetVersion: game.state.ruleset_version,
    });
    return {
      command_id: commandId,
      command_name: "operatorRecovery",
      event_sequence: game.state.event_sequence,
      kind: "operator_audit",
      state_version: game.state.version,
      summary: "Operator recovery completed",
    };
  }

  #assertAuthorization(authorization: GameAuthorization): void {
    const session = this.#sessionsById.get(authorization.sessionId);
    const binding = this.#seatBindings.find(
      (candidate) =>
        candidate.id === authorization.bindingId &&
        candidate.version === authorization.bindingVersion &&
        candidate.gameId === authorization.gameId &&
        candidate.sessionId === authorization.sessionId &&
        candidate.side === authorization.side &&
        candidate.revokedAt === null,
    );

    if (
      session === undefined ||
      session.revokedAt !== null ||
      session.expiresAt <= this.#now() ||
      binding === undefined
    ) {
      throw new ServiceError(
        "unauthorized",
        "Seat binding is no longer active.",
      );
    }
  }

  #createInvitation(gameId: string, allowedSeat: Side): InvitationCredential {
    const secret = generateCredential();
    const lookupId = randomUUID();
    this.#invitations.set(lookupId, {
      allowedSeat,
      claimedAt: null,
      expiresAt: this.#now() + INVITATION_LIFETIME_MS,
      gameId,
      lookupId,
      revokedAt: null,
      tokenHash: credentialVerifier(this.#pepper, "invitation", secret),
    });
    return { lookup_id: lookupId, secret };
  }

  #credentialMatches(
    domain: "invitation" | "recovery-grant",
    credential: string,
    expectedHash: string,
  ): boolean {
    if (!isCanonicalCredential(credential)) {
      return false;
    }
    return hashesEqual(
      credentialVerifier(this.#pepper, domain, credential),
      expectedHash,
    );
  }

  #destroyInvitationSecret(lookupId: string): void {
    for (const game of this.#games.values()) {
      if (game.creation?.invitationLookupId === lookupId) {
        delete game.creation.sealedCredential;
        delete game.creation.sealedInvitationSecret;
      }
      for (const record of game.hostCommandResults.values()) {
        if (record.invitationLookupId === lookupId) {
          delete record.sealedInvitationSecret;
        }
      }
    }
  }

  #failure(
    state: GameState,
    error: CommandFailure["error"],
    message: string,
  ): CommandFailure {
    return { current_version: state.version, error, message, ok: false };
  }

  #findSession(credential: string | undefined): BrowserSession | undefined {
    if (credential === undefined || !isCanonicalCredential(credential)) {
      return undefined;
    }

    const hash = credentialVerifier(
      this.#pepper,
      "browser-session",
      credential,
    );
    const session = this.#sessionsByHash.get(hash);
    if (
      session === undefined ||
      session.revokedAt !== null ||
      session.expiresAt <= this.#now()
    ) {
      return undefined;
    }
    return session;
  }

  #requireGame(gameId: string): GameRecord {
    const game = this.#games.get(gameId);
    if (game === undefined) {
      if (this.#deletionLedger.some((receipt) => receipt.gameId === gameId)) {
        throw new ServiceError("game_purged", "Game has been purged.");
      }
      throw new ServiceError("game_not_found", "Game does not exist.");
    }
    return game;
  }

  #requireActiveGame(gameId: string): GameRecord {
    const game = this.#requireGame(gameId);
    if (game.deletedAt !== null) {
      throw new ServiceError("game_deleted", "Game has been deleted.");
    }
    if (gameVersionHandler(game.state) === undefined) {
      throw new ServiceError(
        "version_unavailable",
        "The game's ruleset/content version is unavailable on this server.",
      );
    }
    return game;
  }

  #resolveOrCreateSession(
    credential: string | undefined,
    requestedCredential?: string,
  ): SessionResult {
    if (
      requestedCredential !== undefined &&
      !isCanonicalCredential(requestedCredential)
    ) {
      throw new ServiceError(
        "credential_invalid",
        "Browser credential is invalid.",
      );
    }
    const effectiveCredential = credential ?? requestedCredential;
    const existing = this.#findSession(effectiveCredential);
    if (existing !== undefined && effectiveCredential !== undefined) {
      const renewed = {
        ...existing,
        expiresAt: this.#now() + SESSION_LIFETIME_MS,
      };
      this.#sessionsByHash.set(renewed.credentialHash, renewed);
      this.#sessionsById.set(renewed.id, renewed);
      return { credential: effectiveCredential, sessionId: renewed.id };
    }

    const createdCredential = requestedCredential ?? generateCredential();
    const session: BrowserSession = {
      credentialHash: credentialVerifier(
        this.#pepper,
        "browser-session",
        createdCredential,
      ),
      expiresAt: this.#now() + SESSION_LIFETIME_MS,
      id: randomUUID(),
      revokedAt: null,
    };
    this.#sessionsByHash.set(session.credentialHash, session);
    this.#sessionsById.set(session.id, session);
    return { credential: createdCredential, sessionId: session.id };
  }
}

export const FIXED_CANONICAL_COMMAND = {
  command_id: "22222222-2222-4222-8222-222222222222",
  command_name: "moveUnit",
  expected_version: 0,
  game_id: "11111111-1111-4111-8111-111111111111",
  payload: { destination: "A1", unit_id: "u1" },
  schema: COMMAND_SCHEMA_VERSION,
} as const satisfies MoveUnitCommand;
