import {
  currentCombatValue,
  prepareReinforcement,
  reinforcementEntryHexes,
  type GameState,
  type GameplayCommandName,
  type Side,
} from "@gettysburg/game";
import { useState } from "react";

interface ReinforcementControlsProps {
  readonly disabled: boolean;
  readonly onCommand: (
    name: GameplayCommandName,
    payload: Record<string, unknown>,
  ) => void;
  readonly seat: Side;
  readonly state: GameState;
}

/** Selection is local only and the parent resets it on an authoritative update. */
export function ReinforcementControls({
  disabled,
  onCommand,
  seat,
  state,
}: ReinforcementControlsProps) {
  const [ids, setIds] = useState<readonly string[]>([]);
  const available = Object.values(state.units).filter(
    (unit) =>
      unit.side === seat &&
      unit.status === "reinforcement" &&
      unit.entry_turn !== null &&
      unit.entry_turn <= state.turn,
  );
  const first = state.units[ids[0] ?? ""];
  const entries = first ? reinforcementEntryHexes(state, first) : [];
  if (state.phase !== "movement" || state.active_side !== seat) return null;
  return (
    <section
      className="reinforcement-entry-controls"
      aria-label="Reinforcement entry"
    >
      <p>
        Select a counter or a group with a common scheduled entry. A general can
        enter with up to two combat counters to accompany their whole move.
        Entry spends movement; counters may wait off-board.
      </p>
      <fieldset disabled={disabled}>
        <legend>Scheduled counters ready to enter</legend>
        {available.map((unit) => (
          <label key={unit.id}>
            <input
              type="checkbox"
              checked={ids.includes(unit.id)}
              disabled={!ids.includes(unit.id) && ids.length >= 3}
              onChange={(event) =>
                setIds(
                  event.target.checked
                    ? [...ids, unit.id].sort()
                    : ids.filter((id) => id !== unit.id),
                )
              }
            />
            {unit.label} ({unit.kind},{" "}
            {currentCombatValue(unit, state.ruleset_version) ?? "-"}-
            {unit.movement}) - scheduled {unit.entry_hexes.join(", ")}
          </label>
        ))}
      </fieldset>
      {first ? (
        <>
          <p>
            If enemies block a scheduled entry, choose a nearest safe board-edge
            hex below. Friendly congestion requires clearing the hex or waiting.
          </p>
          {entries.length === 0 ? (
            <p>No enemy-free board-edge entry is available.</p>
          ) : (
            <ul>
              {entries.map((hex) => {
                const preview = prepareReinforcement(state, seat, ids, hex);
                return (
                  <li key={hex}>
                    <button
                      disabled={disabled || !preview.ok}
                      aria-describedby={
                        !preview.ok ? `entry-error-${hex}` : undefined
                      }
                      onClick={() => {
                        if (disabled || !preview.ok) return;
                        if (ids.length === 1)
                          onCommand("enterReinforcement", {
                            unit_id: ids[0],
                            destination: hex,
                          });
                        else
                          onCommand("enterReinforcementStack", {
                            unit_ids: ids,
                            destination: hex,
                          });
                      }}
                    >
                      Enter selected at {hex}
                      {preview.ok ? ` (${preview.cost} movement each)` : ""}
                    </button>
                    {!preview.ok ? (
                      <p id={`entry-error-${hex}`}>{preview.message}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : (
        <p>
          Select the counters you want to enter; nothing is committed until you
          choose an entry.
        </p>
      )}
    </section>
  );
}
