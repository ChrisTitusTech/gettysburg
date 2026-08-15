import {
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import {
  SCENARIO_CONTENT_REVISION,
  SCENARIO_HEXES,
  SCENARIO_UNITS,
} from "@gettysburg/content";
import {
  COMMAND_SCHEMA_VERSION,
  gameplayCommandSchema,
  isHexCoordinate,
  reduceGameplayCommand,
  RULESET_VERSION,
  toCommandSuccess,
  type CommandFailure,
  type CommandResult,
  type GameState,
  type GameplayCommand,
  type HexCoordinate,
  type MoveUnitCommand,
  type Side,
} from "@gettysburg/game";
import canonicalize from "canonicalize";

import {
  credentialVerifier,
  generateCredential,
  isCanonicalCredential,
} from "./credentials.js";

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;
const INVITATION_LIFETIME_MS = 24 * 60 * 60 * 1_000;
const RECOVERY_LIFETIME_MS = 15 * 60 * 1_000;

export interface BrowserSession {
  readonly credentialHash: string;
  readonly expiresAt: number;
  readonly id: string;
  revokedAt: number | null;
}

export interface HostBinding {
  readonly gameId: string;
  readonly id: string;
  readonly sessionId: string;
  readonly version: number;
  revokedAt: number | null;
}

export interface SeatBinding {
  readonly gameId: string;
  readonly id: string;
  readonly sessionId: string;
  readonly side: Side;
  readonly version: number;
  revokedAt: number | null;
}

export interface Invitation {
  readonly allowedSeat: Side;
  claimedAt: number | null;
  readonly expiresAt: number;
  readonly gameId: string;
  readonly lookupId: string;
  revokedAt: number | null;
  readonly tokenHash: string;
}

export interface RecoveryGrant {
  consumedAt: number | null;
  readonly expiresAt: number;
  readonly gameId: string;
  readonly lookupId: string;
  readonly oldBindingId: string;
  readonly oldBindingVersion: number;
  readonly operatorIdentity: string;
  revokedAt: number | null;
  readonly side: Side;
  readonly tokenHash: string;
}

export interface StoredAction {
  readonly authorizingId: string;
  readonly authorizingType: "operator" | "seat";
  readonly authorizingVersion: number;
  readonly canonicalRequestHash: string | null;
  readonly canonicalizationVersion: string | null;
  readonly commandId: string | null;
  readonly commandName: GameplayCommand["command_name"] | null;
  readonly contentRevision: string;
  readonly expectedVersion: number;
  readonly kind: "gameplay" | "operator_audit";
  readonly operatorRequestId: string | null;
  readonly payload: unknown;
  readonly resultingVersion: number;
  readonly result: CommandResult | null;
  readonly sequence: number;
  readonly rulesetVersion: string;
}

interface GameRecord {
  readonly actions: StoredAction[];
  readonly commandResults: Map<
    string,
    {
      readonly authorizingBindingId: string;
      readonly authorizingBindingVersion: number;
      readonly canonicalHash: string;
      readonly result: CommandResult;
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
          readonly result: CommandResult;
        },
      ][];
      readonly state: GameState;
    },
  ][];
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

export interface InvitationCredential {
  readonly lookup_id: string;
  readonly secret: string;
}

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

export type ServiceErrorCode =
  | "credential_invalid"
  | "game_not_found"
  | "invitation_mismatch"
  | "invitation_unavailable"
  | "recovery_unavailable"
  | "seat_unavailable"
  | "unauthorized";

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
  if (declaration?.result?.ok === true) {
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
  return normalizeCombatDragChoices(
    normalizePendingRetreatStacks(normalizeEmptyConfederateOpening(state)),
    actions,
  );
}

export function canonicalGameplayCommand(command: GameplayCommand): string {
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

export class InMemoryGameService {
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
        this.#games.set(gameId, {
          actions: [...structuredClone(game.actions)],
          commandResults: new Map(structuredClone(game.commandResults)),
          state: normalizeSavedState(
            structuredClone(game.state),
            structuredClone(game.actions),
          ),
        });
      }
      this.#hostBindings.push(
        ...structuredClone(options.snapshot.hostBindings),
      );
      for (const [lookupId, invitation] of options.snapshot.invitations) {
        this.#invitations.set(lookupId, structuredClone(invitation));
      }
      for (const [lookupId, grant] of options.snapshot.recoveryGrants) {
        this.#recoveryGrants.set(lookupId, structuredClone(grant));
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
          state: game.state,
        },
      ]),
      hostBindings: this.#hostBindings,
      invitations: [...this.#invitations],
      recoveryGrants: [...this.#recoveryGrants],
      seatBindings: this.#seatBindings,
      sessions: [...this.#sessionsById.values()],
    });
  }

  createGame(side: Side, existingCredential?: string): CreateGameResult {
    const session = this.#resolveOrCreateSession(existingCredential);
    const gameId = randomUUID();
    const state: GameState = {
      active_side: "union",
      combats: {},
      content_revision: SCENARIO_CONTENT_REVISION,
      event_sequence: 0,
      game_id: gameId,
      night: false,
      objectives: Object.fromEntries(
        SCENARIO_HEXES.filter((hex) => hex.objective_value !== null).map(
          (hex) => [
            hex.coordinate,
            { controlled_by: "union" as const, value: hex.objective_value! },
          ],
        ),
      ),
      phase: "movement",
      ruleset_version: RULESET_VERSION,
      turn: 1,
      units: Object.fromEntries(
        SCENARIO_UNITS.map((unit) => [
          unit.id,
          {
            combat: unit.combat,
            entry_hexes: unit.entry_hexes,
            entry_turn: unit.entry_turn,
            id: unit.id,
            kind: unit.kind,
            label: unit.label,
            location: unit.setup_hex,
            movement: unit.movement,
            organization: unit.organization,
            side: unit.side,
            status: unit.setup_hex === null ? "reinforcement" : "deployed",
            steps_remaining: unit.kind === "general" ? 1 : 2,
            strength: "full",
          },
        ]),
      ),
      version: 0,
      victory: {
        confederate: 0,
        status: "in-progress",
        union: 16,
      },
    };

    this.#games.set(gameId, {
      actions: [],
      commandResults: new Map(),
      state,
    });
    this.#hostBindings.push({
      gameId,
      id: randomUUID(),
      revokedAt: null,
      sessionId: session.sessionId,
      version: 1,
    });
    this.#seatBindings.push({
      gameId,
      id: randomUUID(),
      revokedAt: null,
      sessionId: session.sessionId,
      side,
      version: 1,
    });

    return {
      ...session,
      gameId,
      invitation: this.#createInvitation(gameId, otherSide(side)),
      seat: side,
      state: cloneState(state),
    };
  }

  claimInvitation(input: {
    credential?: string;
    lookupId: string;
    requestedGameId?: string;
    requestedSeat?: Side;
    secret: string;
  }): ClaimResult {
    const invitation = this.#invitations.get(input.lookupId);
    const now = this.#now();
    if (
      invitation === undefined ||
      invitation.claimedAt !== null ||
      invitation.revokedAt !== null ||
      invitation.expiresAt <= now ||
      !this.#credentialMatches("invitation", input.secret, invitation.tokenHash)
    ) {
      throw new ServiceError(
        "invitation_unavailable",
        "Invitation is invalid, expired, or already used.",
      );
    }

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
    invitation.claimedAt = now;
    this.#seatBindings.push({
      gameId: invitation.gameId,
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
    this.#assertAuthorization(authorization);
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
      if (!hashesEqual(previous.canonicalHash, canonicalHash)) {
        return this.#failure(
          game.state,
          "command_id_conflict",
          "Command identifier was already used for different input.",
        );
      }
      return structuredClone(previous.result);
    }

    if (command.expected_version !== game.state.version) {
      return this.#failure(
        game.state,
        "stale_version",
        "Game changed; the latest state has been restored.",
      );
    }

    const reduced = reduceGameplayCommand(
      game.state,
      authorization.side,
      command,
      {
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
      tokenHash: credentialVerifier(this.#pepper, "recovery-grant", secret),
    });
    return { lookup_id: lookupId, secret };
  }

  claimSeatRecovery(input: {
    credential?: string;
    lookupId: string;
    secret: string;
  }): ClaimResult {
    const grant = this.#recoveryGrants.get(input.lookupId);
    const now = this.#now();
    if (
      grant === undefined ||
      grant.consumedAt !== null ||
      grant.revokedAt !== null ||
      grant.expiresAt <= now ||
      !this.#credentialMatches("recovery-grant", input.secret, grant.tokenHash)
    ) {
      throw new ServiceError(
        "recovery_unavailable",
        "Recovery grant is invalid, expired, or already used.",
      );
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

    const session = this.#resolveOrCreateSession(input.credential);
    oldBinding.revokedAt = now;
    grant.consumedAt = now;
    this.#seatBindings.push({
      gameId: grant.gameId,
      id: randomUUID(),
      revokedAt: null,
      sessionId: session.sessionId,
      side: grant.side,
      version: oldBinding.version + 1,
    });

    const game = this.#requireGame(grant.gameId);
    game.state = {
      ...game.state,
      event_sequence: game.state.event_sequence + 1,
    };
    game.actions.push({
      authorizingId: grant.operatorIdentity,
      authorizingType: "operator",
      authorizingVersion: 1,
      canonicalRequestHash: null,
      canonicalizationVersion: null,
      commandId: null,
      commandName: null,
      contentRevision: game.state.content_revision,
      expectedVersion: game.state.version,
      kind: "operator_audit",
      operatorRequestId: randomUUID(),
      payload: null,
      result: null,
      resultingVersion: game.state.version,
      sequence: game.state.event_sequence,
      rulesetVersion: game.state.ruleset_version,
    });

    return {
      ...session,
      gameId: grant.gameId,
      seat: grant.side,
      state: cloneState(game.state),
    };
  }

  getGameState(gameId: string): GameState {
    return cloneState(this.#requireGame(gameId).state);
  }

  getAuthorizedState(authorization: GameAuthorization): GameState {
    this.#assertAuthorization(authorization);
    return this.getGameState(authorization.gameId);
  }

  getActions(gameId: string): readonly StoredAction[] {
    return structuredClone(this.#requireGame(gameId).actions);
  }

  #activeSeatBindings(gameId: string): SeatBinding[] {
    return this.#seatBindings.filter(
      (binding) => binding.gameId === gameId && binding.revokedAt === null,
    );
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
      throw new ServiceError("game_not_found", "Game does not exist.");
    }
    return game;
  }

  #resolveOrCreateSession(credential: string | undefined): SessionResult {
    const existing = this.#findSession(credential);
    if (existing !== undefined && credential !== undefined) {
      return { credential, sessionId: existing.id };
    }

    const createdCredential = generateCredential();
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
