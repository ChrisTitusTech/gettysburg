import {
  prepareForcedRetreat,
  prepareTrappedLoss,
  retreatOptions,
  suggestedRetreat,
  type GameState,
  type GameplayCommandName,
  type HexCoordinate,
  type Side,
} from "@gettysburg/game";
import { useState } from "react";

interface RetreatControlsProps {
  readonly combatId: string;
  readonly disabled: boolean;
  readonly ids: readonly string[];
  readonly onCommand: (
    name: GameplayCommandName,
    payload: Record<string, unknown>,
  ) => void;
  readonly seat: Side;
  readonly state: GameState;
}

/** The parent keys this by state version and original group so an accepted
 * server update discards an uncommitted route or loss confirmation. */
export function RetreatControls({
  combatId,
  disabled,
  ids,
  onCommand,
  seat,
  state,
}: RetreatControlsProps) {
  const origin = state.units[ids[0] ?? ""]?.location;
  const [path, setPath] = useState<readonly HexCoordinate[]>(
    origin ? [origin] : [],
  );
  const [lossId, setLossId] = useState("");
  const options = retreatOptions(state, ids, path);
  const suggestion = suggestedRetreat(state, ids);
  const preview = prepareForcedRetreat(state, seat, combatId, ids, path);
  const exit = prepareForcedRetreat(state, seat, combatId, ids, path, true);
  const loss = prepareTrappedLoss(state, seat, combatId, lossId);
  const choice = state.combats[combatId]?.pending_choice;
  if (
    !origin ||
    state.phase !== "combat" ||
    choice?.kind !== "retreat" ||
    choice.side !== seat ||
    !ids.every((id) => choice.unit_ids.includes(id))
  )
    return null;

  return (
    <section
      className="choice-form mandatory-retreat"
      aria-label={`Retreat from ${origin}`}
    >
      <strong>
        Retreat from {origin}:{" "}
        {ids.map((id) => state.units[id]?.label).join(" + ")}
      </strong>
      <p>
        Choose each legal next hex below. Prefer safe zones, continue through
        friendly counters, and stop at the first empty hex. Artillery cannot
        cross wooded rough hills. Nothing moves until you confirm.
      </p>
      <output aria-label={`Retreat route from ${origin}`}>
        {path.join(" -> ")}
      </output>
      {options === null ? (
        <p>The pinned retreat data or route is unavailable.</p>
      ) : (
        <>
          <div>
            {options.next_hexes.map((hex) => (
              <button
                key={hex}
                disabled={disabled}
                onClick={() => setPath([...path, hex])}
              >
                Next {hex}
              </button>
            ))}
          </div>
          <div>
            <button
              disabled={disabled || path.length < 2}
              onClick={() => setPath(path.slice(0, -1))}
            >
              Undo route step
            </button>
            <button
              disabled={disabled || suggestion === null}
              onClick={() => {
                if (suggestion) setPath(suggestion.path);
              }}
            >
              Use suggested route
            </button>
          </div>
          {options.complete ? (
            <button
              disabled={disabled || !preview.ok}
              onClick={() => {
                if (!disabled && preview.ok)
                  onCommand("retreatStack", {
                    combat_id: combatId,
                    unit_ids: ids,
                    path,
                  });
              }}
            >
              Confirm retreat to {path.at(-1)}
            </button>
          ) : null}
          {options.can_exit ? (
            <>
              <p>
                Leaving is permanent, costs no movement, and scores no casualty
                points. These counters cannot return.
              </p>
              <button
                disabled={disabled || !exit.ok}
                onClick={() => {
                  if (!disabled && exit.ok)
                    onCommand("retreatOffBoard", {
                      combat_id: combatId,
                      unit_ids: ids,
                      path,
                    });
                }}
              >
                Confirm permanent retreat off board
              </button>
            </>
          ) : null}
          {options.can_hold ? (
            <>
              <p>
                No on-board retreat is possible. Hold this stack and assign one
                extra step loss to a combat counter.
              </p>
              <label>
                Extra loss at {origin}
                <select
                  disabled={disabled}
                  value={lossId}
                  onChange={(event) => setLossId(event.target.value)}
                >
                  <option value="">Choose a combat counter</option>
                  {ids
                    .filter(
                      (id) => prepareTrappedLoss(state, seat, combatId, id).ok,
                    )
                    .map((id) => (
                      <option key={id} value={id}>
                        {state.units[id]?.label}
                      </option>
                    ))}
                </select>
              </label>
              <button
                disabled={disabled || !loss.ok}
                onClick={() => {
                  if (!disabled && loss.ok)
                    onCommand("acceptTrappedLoss", {
                      combat_id: combatId,
                      unit_id: lossId,
                    });
                }}
              >
                Confirm one extra loss and hold
              </button>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
