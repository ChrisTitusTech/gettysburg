import {
  movementStackFits,
  planNormalMove,
  prepareBoardExit,
  type GameState,
  type HexCoordinate,
  type Side,
  type UnitState,
} from "@gettysburg/game";
import { useState } from "react";

/** Group choices do not begin a move. Only an accepted command changes activation. */
export function normalMovementGroups(
  state: GameState,
  seat: Side,
  source: HexCoordinate,
) {
  if (state.active_side !== seat || state.phase !== "movement") return [];
  const stack = Object.values(state.units).filter(
    (unit) =>
      unit.side === seat &&
      unit.status === "deployed" &&
      unit.location === source,
  );
  let groups: UnitState[][] = [[]];
  for (const unit of stack)
    groups = [
      ...groups,
      ...groups
        .filter((group) => group.length < 3)
        .map((group) => [...group, unit]),
    ];
  return groups.flatMap((movers) => {
    const plan = planNormalMove(state.normal_movement, movers);
    const ids = movers.map((unit) => unit.id).sort();
    return plan.ok &&
      plan.allowance > 0 &&
      movementStackFits(movers) &&
      movementStackFits(stack.filter((unit) => !ids.includes(unit.id)))
      ? [{ ids, allowance: plan.allowance }]
      : [];
  });
}

interface MovementControlsProps {
  readonly state: GameState;
  readonly seat: Side;
  readonly source: HexCoordinate;
  readonly ids: readonly string[];
  readonly disabled: boolean;
  readonly onSelect: (ids: readonly string[]) => void;
  readonly onExit: (ids: readonly string[]) => void;
}

// Only this confirmation remounts when selection changes; the radio group keeps
// focus. Board separately keys the containing controls by version and source.
function ExitConfirmation({
  ids,
  disabled,
  onExit,
}: Pick<MovementControlsProps, "ids" | "disabled" | "onExit">) {
  const [confirmExit, setConfirmExit] = useState(false);
  return (
    <div>
      <p>
        Leaving the board costs 1 movement point per counter, is permanent, and
        scores no casualty points. The selected counters cannot return.
      </p>
      {confirmExit ? (
        <>
          <button
            disabled={disabled}
            onClick={() => {
              if (!disabled) onExit(ids);
            }}
          >
            Confirm permanent board exit
          </button>
          <button disabled={disabled} onClick={() => setConfirmExit(false)}>
            Cancel board exit
          </button>
        </>
      ) : (
        <button disabled={disabled} onClick={() => setConfirmExit(true)}>
          Leave board with selected counters
        </button>
      )}
    </div>
  );
}

export function MovementControls({
  state,
  seat,
  source,
  ids,
  disabled,
  onSelect,
  onExit,
}: MovementControlsProps) {
  const groups = normalMovementGroups(state, seat, source);
  const exit = prepareBoardExit(state, seat, ids);
  return (
    <section
      className="movement-group-controls"
      aria-label="Normal movement group"
    >
      <fieldset disabled={disabled}>
        <legend>Choose counters to move together from {source}</legend>
        <p>
          Selection does not end a move. After moving, continue that exact group
          until you successfully move another group.
        </p>
        {groups.length === 0 ? (
          <p>No group here has an available normal move.</p>
        ) : (
          groups.map((group) => (
            <label key={group.ids.join(":")}>
              <input
                type="radio"
                name="movement-group"
                checked={
                  ids.length === group.ids.length &&
                  group.ids.every((id) => ids.includes(id))
                }
                onChange={() => onSelect(group.ids)}
              />
              {group.ids.map((id) => state.units[id]!.label).join(" + ")} (
              {group.allowance} movement remaining)
            </label>
          ))
        )}
      </fieldset>
      {exit.ok ? (
        <ExitConfirmation
          key={ids.join(":")}
          ids={ids}
          disabled={disabled}
          onExit={onExit}
        />
      ) : null}
    </section>
  );
}
