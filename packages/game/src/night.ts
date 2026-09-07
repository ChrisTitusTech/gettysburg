import { prepareBoardExit } from "./board-exit.js";
import { eliminateLoneGenerals } from "./generals.js";
import { normalMovementRange } from "./movement.js";
import {
  movementStackFits,
  prepareNormalMovement,
} from "./movement-validation.js";
import { planNormalMove } from "./normal-move.js";
import type { GameState, Side, UnitState } from "./protocol.js";
import { enemyZoneOfControl } from "./zoc.js";

/** Null means the pinned movement bundle is missing, not that withdrawal is
 * impossible. Use only for the mandatory ruleset's movement-phase exit gate. */
export function mandatoryNightWithdrawals(
  state: GameState,
  side: Side,
): readonly UnitState[] | null {
  if (!state.night) return [];
  if (state.terrain === undefined || state.movement_edges === undefined)
    return null;
  const settled = { ...state, units: eliminateLoneGenerals(state) };
  const zoc = enemyZoneOfControl(settled, side);
  const stacks = new Map<string, UnitState[]>();
  for (const unit of Object.values(settled.units)) {
    if (
      unit.side !== side ||
      unit.status !== "deployed" ||
      unit.location === null ||
      !zoc.has(unit.location)
    )
      continue;
    const stack = stacks.get(unit.location) ?? [];
    stacks.set(unit.location, [...stack, unit]);
  }
  const mustWithdraw = new Set<string>();
  for (const stack of stacks.values()) {
    let groups: UnitState[][] = [[]];
    for (const unit of stack)
      groups = [
        ...groups,
        ...groups
          .filter((group) => group.length < 3)
          .map((group) => [...group, unit]),
      ];
    for (const movers of groups) {
      if (
        movers.length === 0 ||
        movers.every((unit) => mustWithdraw.has(unit.id))
      )
        continue;
      const ids = movers.map((unit) => unit.id);
      const source = movers[0]!.location!;
      const plan = planNormalMove(settled.normal_movement, movers);
      if (
        !plan.ok ||
        plan.allowance <= 0 ||
        !movementStackFits(movers) ||
        !movementStackFits(stack.filter((unit) => !ids.includes(unit.id)))
      )
        continue;
      let possible = prepareBoardExit(settled, side, ids).ok;
      if (!possible) {
        const range = normalMovementRange(
          settled,
          side,
          movers.map((unit) => unit.kind),
          state.movement_edges,
          source,
          plan.allowance,
        );
        possible = [...range.keys()].some(
          (destination) =>
            destination !== source &&
            !zoc.has(destination) &&
            prepareNormalMovement(settled, side, ids, destination).ok,
        );
      }
      if (possible) for (const id of ids) mustWithdraw.add(id);
    }
  }
  return Object.values(settled.units).filter((unit) =>
    mustWithdraw.has(unit.id),
  );
}
