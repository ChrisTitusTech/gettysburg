import type { NormalMovementActivation, UnitState } from "./protocol.js";

export type NormalMovePlan =
  | { readonly ok: false; readonly reason: "invalid_group" | "move_finished" }
  | {
      readonly ok: true;
      readonly activation: NormalMovementActivation;
      readonly allowance: number;
    };

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id) => right.includes(id));
}

// Pure proposal only. Persist this activation together with a successful move;
// rejected commands and merely selecting/dragging counters must not close it.
// A move group is the exact set of counters selected for its first step. Picking
// up or dropping counters is a different group and cannot resume earlier movers.
export function planNormalMove(
  current: NormalMovementActivation | undefined,
  movers: readonly UnitState[],
): NormalMovePlan {
  const ids = movers.map((unit) => unit.id).sort();
  const first = movers[0];
  if (
    first === undefined ||
    first.location === null ||
    new Set(ids).size !== ids.length ||
    movers.some(
      (unit) =>
        unit.status !== "deployed" ||
        unit.side !== first.side ||
        unit.location !== first.location,
    )
  )
    return { ok: false, reason: "invalid_group" };

  const continuing =
    current !== undefined && sameIds(current.active_unit_ids, ids);
  if (
    ids.some((id) => current?.closed_unit_ids.includes(id)) ||
    (!continuing && ids.some((id) => current?.active_unit_ids.includes(id)))
  )
    return { ok: false, reason: "move_finished" };

  const activation: NormalMovementActivation = continuing
    ? current
    : {
        active_unit_ids: ids,
        closed_unit_ids: [
          ...new Set([
            ...(current?.closed_unit_ids ?? []),
            ...(current?.active_unit_ids ?? []),
          ]),
        ].sort(),
        // A late-arriving general cannot retroactively accompany earlier steps.
        bonus_unit_ids: movers.some((unit) => unit.kind === "general")
          ? movers
              .filter(
                (unit) =>
                  unit.kind !== "general" && (unit.movement_spent ?? 0) === 0,
              )
              .map((unit) => unit.id)
              .sort()
          : [],
      };
  const allowance = Math.max(
    0,
    Math.min(
      ...movers.map(
        (unit) =>
          unit.movement +
          Number(activation.bonus_unit_ids.includes(unit.id)) -
          (unit.movement_spent ?? 0),
      ),
    ),
  );
  return { ok: true, activation, allowance };
}
