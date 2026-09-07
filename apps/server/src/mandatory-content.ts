import { createMandatoryInitialState } from "@gettysburg/content";
import type { GameState } from "@gettysburg/game";
import canonicalize from "canonicalize";

function immutableContent(state: GameState) {
  return {
    ruleset: state.ruleset_version,
    revision: state.content_revision,
    terrain: state.terrain,
    edges: state.movement_edges,
    objectives: Object.fromEntries(
      Object.entries(state.objectives).map(([hex, objective]) => [
        hex,
        objective.value,
      ]),
    ),
    units: Object.fromEntries(
      Object.entries(state.units).map(([id, unit]) => [
        id,
        {
          id: unit.id,
          label: unit.label,
          kind: unit.kind,
          side: unit.side,
          combat: unit.combat,
          reduced_combat: unit.reduced_combat,
          movement: unit.movement,
          organization: unit.organization,
          entry_hexes: unit.entry_hexes,
          entry_turn: unit.entry_turn,
        },
      ]),
    ),
  };
}

const expectedContent = canonicalize(
  immutableContent(createMandatoryInitialState("pinned")),
);

/** Never fill missing mandatory data from today's defaults or run legacy
 * repairs. JSON object order is irrelevant (PostgreSQL jsonb reorders keys). */
export function hasPinnedMandatoryContent(state: GameState): boolean {
  try {
    if (canonicalize(immutableContent(state)) !== expectedContent) return false;
    const activation = state.normal_movement;
    if (!activation) return false;
    const knownUniqueIds = (ids: readonly string[]) =>
      Array.isArray(ids) &&
      new Set(ids).size === ids.length &&
      ids.every((id) => Object.hasOwn(state.units, id));
    if (
      !knownUniqueIds(activation.active_unit_ids) ||
      !knownUniqueIds(activation.closed_unit_ids) ||
      !knownUniqueIds(activation.bonus_unit_ids) ||
      activation.active_unit_ids.length > 3 ||
      activation.active_unit_ids.some((id) =>
        activation.closed_unit_ids.includes(id),
      )
    )
      return false;
    return Object.values(state.units).every(
      (unit) =>
        typeof unit.movement_spent === "number" &&
        Number.isFinite(unit.movement_spent) &&
        unit.movement_spent >= 0 &&
        Number.isInteger(unit.movement_spent * 2) &&
        typeof unit.steps_remaining === "number" &&
        Number.isInteger(unit.steps_remaining) &&
        unit.steps_remaining >= 0 &&
        unit.steps_remaining <=
          (unit.kind === "general" || unit.combat === 1 ? 1 : 2),
    );
  } catch {
    // Malformed persisted JSON is unavailable, not a reason to invent a repair.
    return false;
  }
}
