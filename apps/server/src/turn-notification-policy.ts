import {
  MANDATORY_RULESET_VERSION,
  type GameState,
  type Side,
} from "@gettysburg/game";

export interface TurnNotificationIntent {
  readonly gameId: string;
  readonly eventSequence: number;
  readonly side: Side;
}

function requiredDecisions(state: GameState): Record<Side, Set<string>> {
  const decisions = {
    union: new Set<string>(),
    confederate: new Set<string>(),
  };
  if (
    state.phase === "completed" ||
    state.victory.status !== "in-progress" ||
    !state.active_side
  )
    return decisions;
  if (state.phase === "movement") {
    decisions[state.active_side].add(`movement:${state.turn}`);
    return decisions;
  }
  const unresolved = Object.values(state.combats).filter(
    (combat) => combat.status !== "resolved",
  );
  if (unresolved.length === 0)
    decisions[state.active_side].add(`end-combat:${state.turn}`);
  for (const combat of unresolved) {
    const choice = combat.pending_choice;
    if (!choice) {
      decisions[state.active_side].add(`combat:${combat.id}:${combat.status}`);
      continue;
    }
    const units =
      choice.kind === "advance" ? choice.eligible_unit_ids : choice.unit_ids;
    decisions[choice.side].add(
      JSON.stringify([
        combat.id,
        choice.kind,
        [...units].sort(),
        choice.kind === "loss" ? choice.count : null,
        choice.kind === "advance"
          ? [...(choice.destination_hexes ?? [])].sort()
          : null,
      ]),
    );
  }
  return decisions;
}

export function hasRequiredTurnDecision(state: GameState, side: Side): boolean {
  return requiredDecisions(state)[side].size > 0;
}

// Called only with the before/after snapshots of a newly committed gameplay
// command. Subscription authorization and durable outbox delivery are separate.
export function turnNotificationIntents(
  before: GameState,
  after: GameState,
  actor: Side,
): readonly TurnNotificationIntent[] {
  if (
    before.game_id !== after.game_id ||
    before.ruleset_version !== MANDATORY_RULESET_VERSION ||
    after.ruleset_version !== before.ruleset_version ||
    after.content_revision !== before.content_revision ||
    after.version !== before.version + 1 ||
    after.event_sequence !== before.event_sequence + 1
  )
    return [];
  const previous = requiredDecisions(before);
  const next = requiredDecisions(after);
  return (["union", "confederate"] as const)
    .filter(
      (side) =>
        side !== actor &&
        [...next[side]].some((key) => !previous[side].has(key)),
    )
    .map((side) => ({
      gameId: after.game_id,
      eventSequence: after.event_sequence,
      side,
    }));
}
