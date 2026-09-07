import {
  COMMAND_SCHEMA_VERSION,
  reduceGameplayCommand,
  type GameState,
  type HexCoordinate,
  type Side,
} from "@gettysburg/game";

/** A pure preview, never persisted or sent. Real commands get a new ID in App. */
export function previewAdvance(
  state: GameState,
  seat: Side,
  combatId: string,
  ids: readonly string[],
  destination: HexCoordinate | null,
) {
  return reduceGameplayCommand(state, seat, {
    command_id: "00000000-0000-4000-8000-000000000001",
    expected_version: state.version,
    game_id: state.game_id,
    schema: COMMAND_SCHEMA_VERSION,
    command_name: "advanceAfterCombat",
    payload:
      destination === null
        ? { combat_id: combatId, decline: true }
        : {
            combat_id: combatId,
            decline: false,
            destination,
            unit_ids: [...ids],
          },
  });
}

export function advanceGroups(state: GameState, seat: Side, combatId: string) {
  const choice = state.combats[combatId]?.pending_choice;
  if (
    state.phase !== "combat" ||
    choice?.kind !== "advance" ||
    choice.side !== seat
  )
    return [];
  const stacks = new Map<HexCoordinate, string[]>();
  for (const id of choice.eligible_unit_ids) {
    const unit = state.units[id];
    if (unit?.status !== "deployed" || unit.side !== seat || !unit.location)
      continue;
    const stack = stacks.get(unit.location) ?? [];
    if (!stack.includes(id)) stack.push(id);
    stacks.set(unit.location, stack);
  }
  return [...stacks.values()].flatMap((stack) => {
    let groups: string[][] = [[]];
    for (const id of stack)
      groups = [
        ...groups,
        ...groups
          .filter((group) => group.length < 3)
          .map((group) => [...group, id]),
      ];
    return groups
      .filter((ids) => ids.length > 0)
      .flatMap((ids) => {
        const destinations = (choice.destination_hexes ?? []).filter(
          (hex) => previewAdvance(state, seat, combatId, ids, hex).ok,
        );
        return destinations.length ? [{ ids: ids.sort(), destinations }] : [];
      });
  });
}
