import type { GameState, GameplayCommandName, Side } from "@gettysburg/game";
import { useState } from "react";
import { advanceGroups, previewAdvance } from "./advance-preview";

interface AdvanceControlsProps {
  readonly combatId: string;
  readonly disabled: boolean;
  readonly onCommand: (
    name: GameplayCommandName,
    payload: Record<string, unknown>,
  ) => void;
  readonly seat: Side;
  readonly state: GameState;
}

export function AdvanceControls({
  combatId,
  disabled,
  onCommand,
  seat,
  state,
}: AdvanceControlsProps) {
  const [selection, setSelection] = useState<readonly string[]>([]);
  const groups = advanceGroups(state, seat, combatId);
  const selected =
    groups.find(
      (group) =>
        group.ids.length === selection.length &&
        group.ids.every((id) => selection.includes(id)),
    ) ?? groups[0];
  const decline = previewAdvance(state, seat, combatId, [], null);
  const choice = state.combats[combatId]?.pending_choice;
  if (
    state.phase !== "combat" ||
    choice?.kind !== "advance" ||
    choice.side !== seat
  )
    return null;
  return (
    <section className="mandatory-advance" aria-label="Advance choice">
      <strong>Advance a victorious group, or decline</strong>
      <p>
        Advance is free, even into enemy zones at night. A general must
        accompany a victorious combat counter. Artillery cannot enter wooded
        rough hills.
      </p>
      {groups.length ? (
        <fieldset disabled={disabled}>
          <legend>Eligible advancing groups</legend>
          {groups.map((group) => (
            <label key={group.ids.join(":")}>
              <input
                type="radio"
                name={`advance-${combatId}`}
                checked={selected === group}
                onChange={() => setSelection(group.ids)}
              />
              {group.ids.map((id) => state.units[id]!.label).join(" + ")} from{" "}
              {state.units[group.ids[0]!]!.location}
            </label>
          ))}
        </fieldset>
      ) : (
        <p>
          No selected combat group can legally enter a vacated hex. Decline to
          continue.
        </p>
      )}
      <div>
        {selected?.destinations.map((hex) => (
          <button
            key={hex}
            disabled={disabled}
            onClick={() => {
              if (
                !disabled &&
                previewAdvance(state, seat, combatId, selected.ids, hex).ok
              )
                onCommand("advanceAfterCombat", {
                  combat_id: combatId,
                  decline: false,
                  destination: hex,
                  unit_ids: selected.ids,
                });
            }}
          >
            Confirm advance to {hex}
          </button>
        ))}
      </div>
      <button
        disabled={disabled || !decline.ok}
        onClick={() => {
          if (!disabled && decline.ok)
            onCommand("advanceAfterCombat", {
              combat_id: combatId,
              decline: true,
            });
        }}
      >
        Decline this advance
      </button>
    </section>
  );
}
