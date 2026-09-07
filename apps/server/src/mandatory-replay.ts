import { createHash } from "node:crypto";
import { createMandatoryInitialState } from "@gettysburg/content";
import {
  COMMAND_SCHEMA_VERSION,
  combatSkirmishes,
  gameplayCommandSchema,
  reduceGameplayCommand,
  type GameState,
  type GameplayCommand,
} from "@gettysburg/game";
import canonicalize from "canonicalize";
import type { SeatBinding, StoredAction } from "./game-service.js";

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
const storedCommandId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
): GameState {
  let state = createMandatoryInitialState(gameId);
  const commandIds = new Set<string>();
  const operatorRequestIds = new Set<string>();
  const surrenderedBindings = new Set<string>();
  let deleted = false;
  let sequence = 0;
  try {
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
              ["issueInvitation", "revokeInvitation", "deleteGame"].includes(
                action.commandName ?? "",
              ) &&
              action.canonicalizationVersion === COMMAND_SCHEMA_VERSION &&
              typeof action.commandId === "string" &&
              storedCommandId.test(action.commandId) &&
              action.operatorRequestId === null,
            "invalid management metadata",
          );
          assertReplay(
            !commandIds.has(action.commandId!),
            "duplicate command identifier",
          );
          commandIds.add(action.commandId!);
          deleted = action.commandName === "deleteGame";
        } else {
          assertReplay(
            action.authorizingType === "operator" &&
              action.commandName === null &&
              action.commandId === null &&
              typeof action.operatorRequestId === "string" &&
              generatedId.test(action.operatorRequestId) &&
              action.canonicalizationVersion === null &&
              action.canonicalRequestHash === null,
            "invalid audit metadata",
          );
          assertReplay(
            !operatorRequestIds.has(action.operatorRequestId!),
            "duplicate operator request identifier",
          );
          operatorRequestIds.add(action.operatorRequestId!);
        }
        // Private host/operator payloads are not replayed or exposed. Their only
        // gameplay-state effect is consuming a sequence number, not a version.
        state = { ...state, event_sequence: sequence };
        continue;
      }
      assertReplay(
        action.authorizingType === "seat",
        "gameplay actor is not a seat",
      );
      const actor = bindings.filter(
        (binding) =>
          binding.id === action.authorizingId &&
          binding.version === action.authorizingVersion &&
          binding.gameId === gameId,
      );
      assertReplay(
        actor.length === 1,
        "missing or ambiguous historical seat binding",
      );
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
      const hash = createHash("sha256")
        .update(
          canonicalize({
            command_name: command.command_name,
            payload: command.payload,
            schema: command.schema,
          })!,
        )
        .digest("hex");
      assertReplay(
        hash === action.canonicalRequestHash,
        "command hash mismatch",
      );
      const result = action.result;
      if (!result?.ok || !("state" in result))
        throw new ReplayError(sequence, "missing accepted result");
      assertReplay(
        result.event.command_id === command.command_id &&
          result.event.command_name === command.command_name &&
          result.event.kind === "gameplay" &&
          result.event.event_sequence === sequence &&
          result.event.state_version === action.resultingVersion,
        "event metadata mismatch",
      );
      if (command.command_name === "surrenderSeat") {
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
    if (expectedFinal !== undefined && !equal(state, expectedFinal))
      throw new ReplayError(state.event_sequence, "final snapshot mismatch");
    return state;
  } catch (error) {
    if (error instanceof ReplayError) throw error;
    throw new ReplayError(sequence, "malformed recorded data");
  }
}
