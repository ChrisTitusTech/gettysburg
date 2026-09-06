import type {
  CombatConfirmation,
  CombatState,
  GameState,
  GameplayCommandName,
  Side,
} from "@gettysburg/game";
import {
  automaticCombatResolution,
  currentCombatValue,
} from "@gettysburg/game";
import { type FormEvent, useMemo, useState } from "react";

interface TabletopControlsProps {
  readonly disabled: boolean;
  readonly onCommand: (
    name: GameplayCommandName,
    payload: Record<string, unknown>,
  ) => void;
  readonly seat: Side;
  readonly state: GameState;
}

function outcomeSummary(
  confirmation: CombatConfirmation,
  margin: number,
): string {
  const attackerWins = confirmation.result === "attacker_win";
  const winner = attackerWins ? "Attacker" : "Defender";
  const loser = attackerWins ? "Defender" : "Attacker";
  const losses = attackerWins
    ? confirmation.defender_losses
    : confirmation.attacker_losses;
  const marginText =
    margin === 0 ? " wins the tied total" : ` wins by ${margin}`;
  return `${winner}${marginText}. ${loser} retreats and takes ${losses} step loss${losses === 1 ? "" : "es"}.`;
}

function participantSummary(
  state: GameState,
  unitIds: readonly string[],
): string {
  return unitIds
    .map((id) => {
      const unit = state.units[id];
      if (unit === undefined) return id;
      const location = unit.location === null ? "" : " (" + unit.location + ")";
      return unit.label + location;
    })
    .join(" + ");
}

function CombatCard({
  combat,
  disabled,
  onCommand,
  seat,
  state,
}: {
  readonly combat: CombatState;
  readonly disabled: boolean;
  readonly onCommand: TabletopControlsProps["onCommand"];
  readonly seat: Side;
  readonly state: GameState;
}) {
  const [losses, setLosses] = useState<Record<string, number>>({});
  const resolution = automaticCombatResolution(state, combat);

  function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCommand("confirmCombatResult", {
      combat_id: combat.id,
    });
  }

  const choice = combat.pending_choice;
  return (
    <article className="combat-card">
      <h3>Skirmish {combat.id.slice(0, 8)}</h3>
      <p>
        Attackers: {participantSummary(state, combat.attackers)}
        <br />
        Defenders: {participantSummary(state, combat.defenders)}
      </p>
      {combat.rolls === null ? null : (
        <p className="dice-result">
          Server dice: {combat.rolls.attacker} - {combat.rolls.defender}
        </p>
      )}
      {combat.status === "declared" ? (
        <button
          disabled={disabled || seat !== state.active_side}
          onClick={() => onCommand("rollCombat", { combat_id: combat.id })}
        >
          Roll server dice
        </button>
      ) : null}
      {combat.status === "awaiting_result_confirmation" ? (
        <form className="combat-form" onSubmit={confirm}>
          {resolution === null ? (
            <p>Waiting for the server dice.</p>
          ) : (
            <div className="wide-field calculated-combat-result">
              <strong>Calculated battle result</strong>
              <p>
                Attacker: die {combat.rolls?.attacker} + units +
                {resolution.confirmation.attacker_modifier} ={" "}
                <strong>{resolution.attacker_total}</strong>
                <br />
                Defender: die {combat.rolls?.defender} + units/terrain +
                {resolution.confirmation.defender_modifier} ={" "}
                <strong>{resolution.defender_total}</strong>
              </p>
              <p>
                {outcomeSummary(resolution.confirmation, resolution.margin)}
              </p>
              <p className="modifier-guidance">
                Unit factors and eligible terrain are capped together at +10. A
                participating attacker in the same connected forest or hill
                cancels that terrain component. Repeated terrain does not stack
                per hex.
              </p>
            </div>
          )}
          <button
            disabled={
              disabled || resolution === null || seat !== state.active_side
            }
            type="submit"
          >
            Confirm skirmish result
          </button>
        </form>
      ) : null}
      {combat.confirmation !== null && combat.rolls !== null ? (
        <div className="confirmed-combat-result">
          <strong>Confirmed result</strong>
          <p>
            {outcomeSummary(
              combat.confirmation,
              Math.abs(
                combat.rolls.attacker +
                  combat.confirmation.attacker_modifier -
                  (combat.rolls.defender +
                    combat.confirmation.defender_modifier),
              ),
            )}
          </p>
        </div>
      ) : null}
      {choice?.kind === "loss" && choice.side === seat ? (
        <form
          className="choice-form"
          onSubmit={(event) => {
            event.preventDefault();
            onCommand("allocateLoss", {
              allocations: Object.fromEntries(
                choice.unit_ids.map((id) => [id, losses[id] ?? 0]),
              ),
              combat_id: combat.id,
            });
          }}
        >
          <strong>Allocate {choice.count} step loss(es)</strong>
          {choice.unit_ids.map((id) => (
            <label key={id}>
              {state.units[id]?.label ?? id}
              <input
                min="0"
                max={state.units[id]?.steps_remaining}
                onChange={(event) =>
                  setLosses((current) => ({
                    ...current,
                    [id]: Number(event.target.value),
                  }))
                }
                type="number"
                value={losses[id] ?? 0}
              />
            </label>
          ))}
          <button disabled={disabled} type="submit">
            Allocate losses
          </button>
        </form>
      ) : null}
      {choice?.kind === "retreat" && choice.side === seat ? (
        <div className="choice-form retreat-drag-guidance">
          <strong>Retreat {choice.unit_ids.length} counter(s) on board</strong>
          <p>
            Drag any highlighted retreating counter. Counters in the same hex
            move together and the route stops at the first empty hex.
          </p>
        </div>
      ) : null}
      {choice?.kind === "advance" && choice.side === seat ? (
        <div className="choice-form advance-drag-guidance">
          <strong>Advance or decline on the board</strong>
          <p>
            Drag a highlighted eligible stack onto a highlighted vacated enemy
            hex. To decline, drag it into the Decline advance tray. Hold Ctrl
            before dragging to advance only the grabbed eligible counter.
          </p>
        </div>
      ) : null}
      {choice !== null && choice.side !== seat ? (
        <p>Waiting for the {choice.side} seat to resolve its choice.</p>
      ) : null}
      {combat.status === "resolved" ? <p>Battle resolved.</p> : null}
    </article>
  );
}

export function TabletopControls({
  disabled,
  onCommand,
  seat,
  state,
}: TabletopControlsProps) {
  const active = state.active_side === seat && state.phase !== "completed";
  const available = useMemo(
    () =>
      Object.values(state.units).filter(
        (unit) =>
          unit.side === seat &&
          unit.status === "reinforcement" &&
          unit.entry_turn !== null &&
          unit.entry_turn <= state.turn,
      ),
    [seat, state.turn, state.units],
  );
  const deployed = Object.values(state.units).filter(
    (unit) => unit.status === "deployed",
  );
  const combats = Object.values(state.combats);
  const unresolvedCombat = Object.values(state.combats).find(
    (combat) => combat.status !== "resolved",
  );
  const pendingChoice = unresolvedCombat?.pending_choice;
  const choiceOwner = pendingChoice?.side === "union" ? "Union" : "Confederate";
  const choiceName =
    pendingChoice?.kind === "loss"
      ? "loss allocation"
      : pendingChoice?.kind === "retreat"
        ? "retreat"
        : "advance decision";
  const combatBlockerLabel =
    state.phase === "combat" && combats.length === 0
      ? "Generate automatic skirmishes"
      : state.phase !== "combat" || unresolvedCombat === undefined
        ? null
        : pendingChoice === null || pendingChoice === undefined
          ? "Confirm each automatic skirmish below"
          : pendingChoice.side === seat
            ? pendingChoice.kind === "retreat"
              ? "Complete your retreat on the board"
              : pendingChoice.kind === "advance"
                ? "Complete your advance decision on the board"
                : `Complete your ${choiceName} below`
            : `Waiting for ${choiceOwner} ${choiceName}`;
  const phaseButtonLabel =
    combatBlockerLabel ??
    (active
      ? `End ${state.phase} phase`
      : state.phase === "completed"
        ? "Game complete"
        : `Waiting for ${state.active_side === "union" ? "Union" : "Confederate"} player`);

  return (
    <section className="tabletop-controls" aria-labelledby="turn-heading">
      <div className="turn-summary">
        <div>
          <p className="eyebrow">24-turn tabletop</p>
          <h2 id="turn-heading">
            Turn {state.turn} · {state.phase}
            {state.night ? " · night" : ""}
          </h2>
          <p>
            Active seat: {state.active_side ?? "game complete"}. Adjacent combat
            units are automatically separated into mandatory legal skirmishes
            and rolled independently by the server.
          </p>
          {state.night && state.phase === "movement" ? (
            <p className="night-guidance">
              Night movement: withdraw every counter from enemy zones of control
              when possible. Counters cannot enter enemy zones, and only
              counters unable to withdraw will fight.
            </p>
          ) : null}
          <p>
            Victory points: Confederate {state.victory.confederate} · Union{" "}
            {state.victory.union}
            {state.victory.status === "in-progress"
              ? ""
              : ` · ${state.victory.status} result`}
          </p>
        </div>
        <button
          disabled={disabled || !active || unresolvedCombat !== undefined}
          onClick={() => onCommand("endPhase", {})}
        >
          {phaseButtonLabel}
        </button>
      </div>

      {state.phase === "movement" && active ? (
        <details
          className={available.length > 0 ? "reinforcements-ready" : undefined}
          open={available.length > 0}
        >
          <summary>
            {available.length > 0 ? "Reinforcements ready" : "Reinforcements"} (
            {available.length})
          </summary>
          {available.length === 0 ? (
            <p>No scheduled counters are available for this seat this turn.</p>
          ) : (
            <>
              <p className="reinforcement-guidance">
                Scheduled counters remain off-board until entered. Enter one,
                then move it clear before entering another counter through the
                same hex.
              </p>
              <ul className="reinforcement-list">
                {available.map((unit) => (
                  <li key={unit.id}>
                    <span>
                      <strong>{unit.label}</strong> · {unit.kind} ·{" "}
                      {currentCombatValue(unit, state.ruleset_version) === null
                        ? `Move ${unit.movement}`
                        : `${currentCombatValue(unit, state.ruleset_version)}-${unit.movement} combat-move`}{" "}
                      · {unit.organization} <code>{unit.id}</code>
                    </span>
                    {unit.entry_hexes.map((hex) => (
                      <button
                        disabled={disabled}
                        key={hex}
                        onClick={() =>
                          onCommand("enterReinforcement", {
                            destination: hex,
                            unit_id: unit.id,
                          })
                        }
                      >
                        Enter {hex}
                      </button>
                    ))}
                  </li>
                ))}
              </ul>
            </>
          )}
        </details>
      ) : null}

      {state.phase === "combat" && active ? (
        <section
          aria-labelledby="detected-combats-heading"
          className="combat-opportunities"
        >
          <h3 id="detected-combats-heading">Automatic skirmishes</h3>
          <p>
            {combats.length === 0
              ? "This saved combat predates automatic separation. Generate its mandatory skirmishes to continue."
              : `${combats.length} independent skirmish${combats.length === 1 ? " was" : "es were"} created from every adjacent combat stack. No touching combat unit can be omitted, and each skirmish has its own server dice and result.`}
          </p>
        </section>
      ) : null}

      {combats.map((combat) => (
        <CombatCard
          combat={combat}
          disabled={disabled}
          key={combat.id}
          onCommand={onCommand}
          seat={seat}
          state={state}
        />
      ))}

      <details className="counter-roster">
        <summary>
          Counter roster ({deployed.length} deployed /{" "}
          {Object.values(state.units).length} total)
        </summary>
        <div>
          {Object.values(state.units).map((unit) => (
            <span key={unit.id}>
              <code>{unit.id}</code> · {unit.label} · {unit.kind} ·{" "}
              {currentCombatValue(unit, state.ruleset_version) === null
                ? `Move ${unit.movement}`
                : `${currentCombatValue(unit, state.ruleset_version)}-${unit.movement} combat-move`}{" "}
              · {unit.organization} · {unit.side} · {unit.status}
              {unit.location === null ? "" : ` ${unit.location}`}
            </span>
          ))}
        </div>
      </details>
    </section>
  );
}
