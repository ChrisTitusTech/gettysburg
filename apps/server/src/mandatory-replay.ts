import { createHash } from "node:crypto";
import { createMandatoryInitialState } from "@gettysburg/content";
import {
  COMMAND_SCHEMA_VERSION,
  combatSkirmishes,
  gameplayCommandSchema,
  hostManagementCommandSchema,
  reduceGameplayCommand,
  type GameState,
  type GameplayCommand,
} from "@gettysburg/game";
import canonicalize from "canonicalize";
import {
  SPECTATOR_INVITATION_LIMIT,
  SPECTATOR_INVITATION_LIFETIME_MS,
} from "./spectator-policy.js";
import type {
  HostBinding,
  Invitation,
  RecoveryGrant,
  SeatBinding,
  StoredAction,
} from "./game-service.js";

export interface ReplayManagementEvidence {
  readonly spectatorInvitations?: readonly (Omit<
    ReplayManagementEvidence["invitations"][number],
    "allowedSeat"
  > & { readonly issuedAt: number })[];
  readonly hosts: readonly HostBinding[];
  readonly invitations: readonly Pick<
    Invitation,
    | "gameId"
    | "lookupId"
    | "allowedSeat"
    | "claimedAt"
    | "claimedAfterSequence"
    | "expiresAt"
    | "revokedAt"
    | "activeAfterSequence"
    | "revokedAtSequence"
  >[];
  readonly recoveries?: readonly Pick<
    RecoveryGrant,
    | "gameId"
    | "oldBindingId"
    | "oldBindingVersion"
    | "newBindingId"
    | "targetBindingType"
    | "side"
    | "operatorIdentity"
    | "operatorRequestId"
    | "auditSequence"
    | "consumedAt"
    | "revokedAt"
    | "expiresAt"
  >[];
}

function bindingIndex<T extends HostBinding>(
  gameId: string,
  bindings: readonly T[],
) {
  const index = new Map<string, T[]>();
  for (const binding of bindings) {
    if (binding.gameId !== gameId) continue;
    const key = JSON.stringify([binding.id, binding.version]);
    index.set(key, [...(index.get(key) ?? []), binding]);
  }
  return index;
}

function bindingInterval(actor: HostBinding, sequence: number) {
  const after = actor.activeAfterSequence;
  const until = actor.inactiveFromSequence;
  if (
    !Number.isSafeInteger(after) ||
    after! < 0 ||
    (until === undefined
      ? actor.revokedAt !== null
      : !Number.isSafeInteger(until) ||
        until <= after! ||
        actor.revokedAt === null ||
        !Number.isFinite(actor.revokedAt))
  )
    throw new ReplayError(sequence, "binding chronology unavailable");
  return { start: after! + 1, end: until ?? Infinity };
}

function activeBinding<T extends HostBinding>(
  index: Map<string, T[]>,
  action: StoredAction,
  kind: "seat" | "host",
): T {
  const actors = index.get(
    JSON.stringify([action.authorizingId, action.authorizingVersion]),
  );
  if (actors?.length !== 1)
    throw new ReplayError(
      action.sequence,
      `missing or ambiguous historical ${kind} binding`,
    );
  const actor = actors[0]!;
  const interval = bindingInterval(actor, action.sequence);
  if (action.sequence < interval.start || action.sequence >= interval.end)
    throw new ReplayError(
      action.sequence,
      "binding was not active at this sequence",
    );
  return actor;
}

type BindingInterval = ReturnType<typeof bindingInterval>;
function bindingTimeline<T extends HostBinding>(
  index: Map<string, T[]>,
  kind: "seat" | "host",
  role: (binding: T) => string,
) {
  const roles = new Map<string, BindingInterval[]>();
  for (const actors of index.values()) {
    if (actors.length !== 1)
      throw new ReplayError(
        0,
        `missing or ambiguous historical ${kind} binding`,
      );
    const actor = actors[0]!;
    const interval = bindingInterval(actor, 0);
    // Recovery can retire a binding before it has any action-bearing interval.
    if (interval.start === interval.end) continue;
    const key = role(actor);
    const intervals = roles.get(key) ?? [];
    intervals.push(interval);
    roles.set(key, intervals);
  }
  for (const intervals of roles.values()) {
    intervals.sort((a, b) => a.start - b.start);
    for (let i = 1; i < intervals.length; i++)
      if (intervals[i - 1]!.end > intervals[i]!.start)
        throw new ReplayError(
          intervals[i]!.start,
          `overlapping ${kind} bindings`,
        );
  }
  return roles;
}

function occupiedAt(intervals: readonly BindingInterval[], sequence: number) {
  let low = 0;
  let high = intervals.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (intervals[middle]!.start <= sequence) low = middle + 1;
    else high = middle;
  }
  return low > 0 && sequence < intervals[low - 1]!.end;
}

export class ReplayError extends Error {
  constructor(
    readonly sequence: number,
    readonly reason: string,
  ) {
    super(`Replay cannot verify action ${sequence}: ${reason}`);
  }
}

const equal = (a: unknown, b: unknown) => canonicalize(a) === canonicalize(b);
const sameIds = (a: readonly string[], b: readonly string[]) =>
  equal([...a].sort(), [...b].sort());
const generatedId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function commandHash(command: {
  command_name: string;
  payload: unknown;
  schema: string;
}): string {
  return createHash("sha256")
    .update(
      canonicalize({
        command_name: command.command_name,
        payload: command.payload,
        schema: command.schema,
      })!,
    )
    .digest("hex");
}

function randomInputs(
  state: GameState,
  actor: SeatBinding["side"],
  command: GameplayCommand,
  recorded: GameState,
): Parameters<typeof reduceGameplayCommand>[3] {
  if (
    command.command_name === "declareCombat" ||
    command.command_name === "rollCombat"
  ) {
    const dice = recorded.combats[command.payload.combat_id]?.rolls;
    if (!dice)
      throw new ReplayError(state.event_sequence + 1, "missing recorded dice");
    return { dice: { attacker: dice.attacker, defender: dice.defender } };
  }
  if (
    command.command_name !== "endPhase" ||
    !(
      state.phase === "movement" ||
      (state.phase === "combat" && Object.keys(state.combats).length === 0)
    )
  )
    return {};
  const skirmishes = combatSkirmishes(state, actor);
  if (skirmishes === null)
    throw new ReplayError(state.event_sequence + 1, "invalid skirmishes");
  // jsonb may reorder combat keys. Match rolls to participants, not object order.
  const combats = Object.values(recorded.combats);
  return {
    automaticCombats: skirmishes.map((skirmish) => {
      const matches = combats.filter(
        (combat) =>
          sameIds(combat.attackers, skirmish.attackers) &&
          sameIds(combat.defenders, skirmish.defenders),
      );
      if (matches.length !== 1 || !matches[0]!.rolls)
        throw new ReplayError(
          state.event_sequence + 1,
          "missing or ambiguous skirmish dice",
        );
      const dice = matches[0]!.rolls!;
      if (!generatedId.test(matches[0]!.id))
        throw new ReplayError(
          state.event_sequence + 1,
          "invalid automatic combat identifier",
        );
      return {
        combat_id: matches[0]!.id,
        dice: { attacker: dice.attacker, defender: dice.defender },
      };
    }),
  };
}

/** Pure verification: never generates dice, repairs saves, mutates bindings, or
 * trusts a recorded resulting state as the starting state of the next action.
 * Passing a prefix supports a historical cursor; pass expectedFinal for a full
 * snapshot comparison. This is not a public API or an authorization substitute. */
export function replayMandatoryActions(
  gameId: string,
  actions: readonly StoredAction[],
  bindings: readonly SeatBinding[],
  expectedFinal?: GameState,
  management: ReplayManagementEvidence = { hosts: [], invitations: [] },
): GameState {
  let state = createMandatoryInitialState(gameId);
  const seatIndex = bindingIndex(gameId, bindings);
  const hostIndex = bindingIndex(gameId, management.hosts);
  const invitationIndex = new Map<
    string,
    ReplayManagementEvidence["invitations"][number][]
  >();
  const issuedInvitations = new Map<
    number,
    ReplayManagementEvidence["invitations"][number][]
  >();
  for (const invitation of management.invitations) {
    if (invitation.gameId !== gameId) continue;
    invitationIndex.set(invitation.lookupId, [
      ...(invitationIndex.get(invitation.lookupId) ?? []),
      invitation,
    ]);
    if (invitation.activeAfterSequence !== undefined)
      issuedInvitations.set(invitation.activeAfterSequence, [
        ...(issuedInvitations.get(invitation.activeAfterSequence) ?? []),
        invitation,
      ]);
  }
  const recoveryIndex = new Map<
    string,
    NonNullable<ReplayManagementEvidence["recoveries"]>[number][]
  >();
  for (const recovery of management.recoveries ?? []) {
    if (recovery.gameId !== gameId || recovery.operatorRequestId === undefined)
      continue;
    recoveryIndex.set(recovery.operatorRequestId, [
      ...(recoveryIndex.get(recovery.operatorRequestId) ?? []),
      recovery,
    ]);
  }
  const commandIds = new Set<string>();
  const operatorRequestIds = new Set<string>();
  const surrenderedBindings = new Set<string>();
  let deleted = false;
  let sequence = 0;
  try {
    const spectators = (management.spectatorInvitations ?? []).filter(
      (invitation) => invitation.gameId === gameId,
    );
    const spectatorBySequence = new Map<number, typeof spectators>();
    const spectatorById = new Map<string, typeof spectators>();
    const consumedSpectatorIssues = new Set<string>();
    const consumedSpectatorRevocations = new Set<string>();
    for (const invitation of spectators) {
      if (
        !Number.isSafeInteger(invitation.activeAfterSequence) ||
        invitation.activeAfterSequence! < 1 ||
        (invitation.revokedAt === null
          ? invitation.revokedAtSequence !== undefined
          : !Number.isFinite(invitation.revokedAt) ||
            !Number.isSafeInteger(invitation.revokedAtSequence) ||
            invitation.revokedAtSequence! <= invitation.activeAfterSequence!)
      )
        throw new ReplayError(0, "spectator invitation chronology unavailable");
      spectatorById.set(invitation.lookupId, [
        ...(spectatorById.get(invitation.lookupId) ?? []),
        invitation,
      ]);
      if (invitation.activeAfterSequence !== undefined)
        spectatorBySequence.set(invitation.activeAfterSequence, [
          ...(spectatorBySequence.get(invitation.activeAfterSequence) ?? []),
          invitation,
        ]);
    }
    const activeSpectators = new Map<string, (typeof spectators)[number]>();
    const seats = bindingTimeline(seatIndex, "seat", (binding) => binding.side);
    bindingTimeline(hostIndex, "host", () => "host");
    for (const action of actions) {
      sequence = state.event_sequence + 1;
      const assertReplay = (valid: boolean, reason: string) => {
        if (!valid) throw new ReplayError(sequence, reason);
      };
      assertReplay(!deleted, "action after game deletion");
      assertReplay(
        Number.isSafeInteger(action.authorizingVersion) &&
          action.authorizingVersion > 0,
        "invalid authorization version",
      );
      assertReplay(action.sequence === sequence, "sequence gap or duplicate");
      assertReplay(
        action.rulesetVersion === state.ruleset_version &&
          action.contentRevision === state.content_revision,
        "unavailable version pair",
      );
      assertReplay(
        action.expectedVersion === state.version,
        "expected version mismatch",
      );
      assertReplay(
        action.resultingVersion ===
          state.version + Number(action.kind === "gameplay"),
        "resulting version mismatch",
      );
      if (action.kind !== "gameplay") {
        assertReplay(
          action.kind === "host_management" || action.kind === "operator_audit",
          "unknown action kind",
        );
        if (action.kind === "host_management") {
          assertReplay(
            action.authorizingType === "host" &&
              [
                "issueInvitation",
                "revokeInvitation",
                "deleteGame",
                "issueSpectatorInvitation",
                "revokeSpectatorInvitation",
              ].includes(action.commandName ?? "") &&
              action.canonicalizationVersion === COMMAND_SCHEMA_VERSION &&
              typeof action.commandId === "string" &&
              typeof action.authorizingId === "string" &&
              generatedId.test(action.authorizingId) &&
              action.operatorRequestId === null,
            "invalid management metadata",
          );
          const parsedHost = hostManagementCommandSchema.safeParse({
            command_id: action.commandId,
            command_name: action.commandName,
            expected_version: action.expectedVersion,
            game_id: gameId,
            payload: action.payload,
            schema: action.canonicalizationVersion,
          });
          assertReplay(parsedHost.success, "invalid management metadata");
          if (!parsedHost.success)
            throw new ReplayError(sequence, "invalid management metadata");
          const host = parsedHost.data;
          activeBinding(hostIndex, action, "host");
          if (host.command_name === "issueSpectatorInvitation") {
            const issued = spectatorBySequence.get(sequence) ?? [];
            assertReplay(
              issued.length === 1,
              "missing or ambiguous issued spectator invitation",
            );
            const invitation = issued[0]!;
            assertReplay(
              spectatorById.get(invitation.lookupId)?.length === 1 &&
                Number.isFinite(invitation.issuedAt) &&
                invitation.expiresAt ===
                  invitation.issuedAt + SPECTATOR_INVITATION_LIFETIME_MS,
              "invalid spectator invitation lifetime",
            );
            const occupied = [...activeSpectators.values()].filter(
              (prior) =>
                prior.expiresAt > invitation.issuedAt ||
                (prior.claimedAt !== null &&
                  Number.isSafeInteger(prior.claimedAfterSequence) &&
                  prior.claimedAfterSequence! < sequence),
            );
            assertReplay(
              occupied.length < SPECTATOR_INVITATION_LIMIT,
              "spectator invitation limit exceeded",
            );
            activeSpectators.set(invitation.lookupId, invitation);
            consumedSpectatorIssues.add(invitation.lookupId);
          }
          if (host.command_name === "revokeSpectatorInvitation") {
            const targets = spectatorById.get(host.payload.lookup_id) ?? [];
            assertReplay(
              targets.length === 1,
              "missing or ambiguous spectator invitation",
            );
            const target = targets[0]!;
            assertReplay(
              activeSpectators.has(target.lookupId) &&
                target.claimedAt === null &&
                target.revokedAtSequence === sequence &&
                target.revokedAt !== null &&
                Number.isFinite(target.revokedAt) &&
                target.revokedAt < target.expiresAt,
              "spectator invitation was not available",
            );
            activeSpectators.delete(target.lookupId);
            consumedSpectatorRevocations.add(target.lookupId);
          }
          if (host.command_name === "issueInvitation") {
            const issued = issuedInvitations.get(sequence) ?? [];
            assertReplay(
              issued.length === 1 &&
                issued[0]!.allowedSeat === host.payload.seat,
              "missing or ambiguous issued invitation evidence",
            );
            assertReplay(
              !occupiedAt(seats.get(host.payload.seat) ?? [], sequence),
              "invitation issued to an occupied seat",
            );
          }
          assertReplay(
            commandHash(host) === action.canonicalRequestHash,
            "management hash mismatch",
          );
          const hostResult = action.result;
          assertReplay(
            hostResult?.ok === true &&
              equal(Object.keys(hostResult ?? {}).sort(), ["event", "ok"]),
            "invalid management result",
          );
          if (!hostResult?.ok)
            throw new ReplayError(sequence, "invalid management result");
          const target =
            host.command_name === "revokeInvitation"
              ? (invitationIndex.get(host.payload.lookup_id) ?? [])
              : [];
          if (host.command_name === "revokeInvitation")
            assertReplay(
              target.length === 1 &&
                ["union", "confederate"].includes(target[0]!.allowedSeat),
              "missing or ambiguous historical invitation",
            );
          if (host.command_name === "revokeInvitation") {
            const invitation = target[0]!;
            assertReplay(
              Number.isSafeInteger(invitation.activeAfterSequence) &&
                invitation.activeAfterSequence! >= 0 &&
                sequence > invitation.activeAfterSequence! &&
                invitation.claimedAt === null &&
                invitation.revokedAtSequence === sequence &&
                Number.isFinite(invitation.revokedAt) &&
                invitation.revokedAt !== null &&
                Number.isFinite(invitation.expiresAt) &&
                invitation.revokedAt < invitation.expiresAt,
              "invitation was not available at this sequence",
            );
          }
          const summary =
            host.command_name === "issueSpectatorInvitation"
              ? "Spectator invitation issued"
              : host.command_name === "revokeSpectatorInvitation"
                ? "Spectator invitation revoked"
                : host.command_name === "deleteGame"
                  ? "Game deleted"
                  : host.command_name === "issueInvitation"
                    ? `${host.payload.seat} invitation issued`
                    : `${target[0]!.allowedSeat} invitation revoked`;
          assertReplay(
            equal(hostResult.event, {
              command_id: host.command_id,
              command_name: host.command_name,
              event_sequence: sequence,
              kind: "host_management",
              state_version: state.version,
              summary,
            }),
            "invalid management event",
          );
          assertReplay(
            !commandIds.has(action.commandId!),
            "duplicate command identifier",
          );
          commandIds.add(action.commandId!);
          if (host.command_name === "deleteGame") {
            for (const invitation of activeSpectators.values()) {
              assertReplay(
                invitation.revokedAtSequence === sequence &&
                  invitation.revokedAt !== null,
                "deletion did not retire its spectator invitations",
              );
              consumedSpectatorRevocations.add(invitation.lookupId);
            }
          }
          deleted = action.commandName === "deleteGame";
        } else {
          assertReplay(
            action.authorizingType === "operator" &&
              typeof action.authorizingId === "string" &&
              action.authorizingId.trim().length > 0 &&
              action.authorizingVersion === 1 &&
              action.commandName === null &&
              action.commandId === null &&
              typeof action.operatorRequestId === "string" &&
              generatedId.test(action.operatorRequestId) &&
              action.canonicalizationVersion === null &&
              action.canonicalRequestHash === null &&
              action.payload === null &&
              action.result === null,
            "invalid audit metadata",
          );
          assertReplay(
            !operatorRequestIds.has(action.operatorRequestId!),
            "duplicate operator request identifier",
          );
          operatorRequestIds.add(action.operatorRequestId!);
          const recoveries = recoveryIndex.get(action.operatorRequestId!) ?? [];
          assertReplay(
            recoveries.length === 1,
            "missing or ambiguous recovery audit evidence",
          );
          const recovery = recoveries[0]!;
          assertReplay(
            recovery.auditSequence === sequence &&
              recovery.operatorIdentity === action.authorizingId &&
              recovery.consumedAt !== null &&
              recovery.revokedAt === null &&
              Number.isFinite(recovery.consumedAt) &&
              Number.isFinite(recovery.expiresAt) &&
              recovery.consumedAt < recovery.expiresAt &&
              (recovery.targetBindingType === "host"
                ? recovery.side === null
                : recovery.targetBindingType === "seat" &&
                  ["union", "confederate"].includes(recovery.side ?? "")),
            "invalid recovery audit evidence",
          );
          const index =
            recovery.targetBindingType === "host" ? hostIndex : seatIndex;
          const old =
            index.get(
              JSON.stringify([
                recovery.oldBindingId,
                recovery.oldBindingVersion,
              ]),
            ) ?? [];
          const replacement =
            index.get(
              JSON.stringify([
                recovery.newBindingId,
                recovery.oldBindingVersion + 1,
              ]),
            ) ?? [];
          assertReplay(
            old.length === 1 &&
              replacement.length === 1 &&
              old[0]!.inactiveFromSequence === sequence &&
              Number.isSafeInteger(old[0]!.activeAfterSequence) &&
              old[0]!.activeAfterSequence! >= 0 &&
              old[0]!.activeAfterSequence! < sequence &&
              old[0]!.revokedAt === recovery.consumedAt &&
              replacement[0]!.activeAfterSequence === sequence &&
              replacement[0]!.id !== old[0]!.id &&
              (recovery.targetBindingType === "host" ||
                ((old[0] as SeatBinding).side === recovery.side &&
                  (replacement[0] as SeatBinding).side === recovery.side)),
            "recovery audit does not match binding rotation",
          );
        }
        // Validate management records without executing or exposing them. Their
        // only gameplay-state effect is consuming a sequence, not a version.
        state = { ...state, event_sequence: sequence };
        continue;
      }
      assertReplay(
        action.authorizingType === "seat" && action.operatorRequestId === null,
        "gameplay actor is not a seat",
      );
      const actor = [activeBinding(seatIndex, action, "seat")];
      assertReplay(
        actor[0]!.side === "union" || actor[0]!.side === "confederate",
        "invalid historical side",
      );
      const bindingKey = JSON.stringify([actor[0]!.id, actor[0]!.version]);
      assertReplay(
        !surrenderedBindings.has(bindingKey),
        "surrendered binding cannot act again",
      );
      assertReplay(
        action.canonicalizationVersion === COMMAND_SCHEMA_VERSION,
        "unavailable command schema",
      );
      const parsed = gameplayCommandSchema.safeParse({
        command_id: action.commandId,
        command_name: action.commandName,
        expected_version: action.expectedVersion,
        game_id: gameId,
        payload: action.payload,
        schema: action.canonicalizationVersion,
      });
      assertReplay(parsed.success, "invalid recorded command");
      if (!parsed.success)
        throw new ReplayError(sequence, "invalid recorded command");
      const command = parsed.data;
      assertReplay(
        !commandIds.has(command.command_id),
        "duplicate command identifier",
      );
      commandIds.add(command.command_id);
      const hash = commandHash(command);
      assertReplay(
        hash === action.canonicalRequestHash,
        "command hash mismatch",
      );
      const result = action.result;
      if (result?.ok !== true || !("state" in result))
        throw new ReplayError(sequence, "missing accepted result");
      assertReplay(
        equal(Object.keys(result).sort(), ["event", "ok", "state"]),
        "invalid accepted result",
      );
      assertReplay(
        equal(result.event, {
          command_id: command.command_id,
          command_name: command.command_name,
          kind: "gameplay",
          event_sequence: sequence,
          state_version: action.resultingVersion,
          summary: result.event.summary,
        }),
        "event metadata mismatch",
      );
      if (command.command_name === "surrenderSeat") {
        assertReplay(
          actor[0]!.revokedAt !== null &&
            Number.isFinite(actor[0]!.revokedAt) &&
            actor[0]!.inactiveFromSequence === sequence + 1,
          "surrender did not retire its binding",
        );
        for (const invitation of management.invitations) {
          if (
            invitation.gameId !== gameId ||
            invitation.allowedSeat !== actor[0]!.side
          )
            continue;
          assertReplay(
            Number.isSafeInteger(invitation.activeAfterSequence) &&
              invitation.activeAfterSequence! >= 0,
            "invitation chronology unavailable at surrender",
          );
          // Evidence is the latest retained snapshot, including future issues.
          if (invitation.activeAfterSequence! >= sequence) continue;
          if (invitation.claimedAt !== null) {
            assertReplay(
              Number.isFinite(invitation.claimedAt) &&
                Number.isSafeInteger(invitation.claimedAfterSequence) &&
                invitation.claimedAfterSequence! >=
                  invitation.activeAfterSequence!,
              "invitation claim chronology unavailable at surrender",
            );
            if (invitation.claimedAfterSequence! < sequence) continue;
          }
          if (
            invitation.claimedAt === null &&
            invitation.revokedAt !== null &&
            Number.isFinite(invitation.revokedAt) &&
            Number.isSafeInteger(invitation.revokedAtSequence) &&
            invitation.revokedAtSequence! > invitation.activeAfterSequence! &&
            invitation.revokedAtSequence! < sequence
          )
            continue;
          assertReplay(
            invitation.claimedAt === null &&
              invitation.revokedAtSequence === sequence &&
              invitation.revokedAt === actor[0]!.revokedAt,
            "surrender did not retire its outstanding invitations",
          );
        }
        surrenderedBindings.add(bindingKey);
        assertReplay(
          result.event.summary === `${actor[0]!.side} seat surrendered`,
          "gameplay summary mismatch",
        );
        assertReplay(
          !Object.values(state.combats).some(
            (combat) => combat.pending_choice?.side === actor[0]!.side,
          ),
          "surrender with pending choice",
        );
        state = {
          ...state,
          event_sequence: sequence,
          version: state.version + 1,
        };
      } else {
        const reduced = reduceGameplayCommand(
          state,
          actor[0]!.side,
          command,
          randomInputs(state, actor[0]!.side, command, result.state),
        );
        assertReplay(reduced.ok, "recorded command is illegal");
        if (!reduced.ok)
          throw new ReplayError(sequence, "recorded command is illegal");
        assertReplay(
          result.event.summary === reduced.summary,
          "gameplay summary mismatch",
        );
        state = reduced.state;
      }
      assertReplay(equal(state, result.state), "resulting state mismatch");
    }
    // Prefixes may legitimately receive the latest snapshot's future records.
    // Full replay must account for every retained spectator issue/revocation.
    for (const invitation of spectators) {
      if (
        (expectedFinal !== undefined ||
          invitation.activeAfterSequence! <= state.event_sequence) &&
        !consumedSpectatorIssues.has(invitation.lookupId)
      )
        throw new ReplayError(
          state.event_sequence,
          "spectator invitation has no matching issue action",
        );
      if (
        invitation.revokedAtSequence !== undefined &&
        (expectedFinal !== undefined ||
          invitation.revokedAtSequence <= state.event_sequence) &&
        !consumedSpectatorRevocations.has(invitation.lookupId)
      )
        throw new ReplayError(
          state.event_sequence,
          "spectator invitation has no matching revoke action",
        );
    }
    if (expectedFinal !== undefined && !equal(state, expectedFinal))
      throw new ReplayError(state.event_sequence, "final snapshot mismatch");
    return state;
  } catch (error) {
    if (error instanceof ReplayError) throw error;
    throw new ReplayError(sequence, "malformed recorded data");
  }
}
