// Development-only fixture for browser input acceptance.
import {
  COMMAND_SCHEMA_VERSION,
  gameplayCommandSchema,
  reduceGameplayCommand,
  type GameplayCommandName,
} from "@gettysburg/game";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Board } from "../Board";
import { TabletopControls } from "../TabletopControls";
import { turnFixture, type TurnFixtureName } from "./turn-fixture";
import "../styles.css";

function TurnFixture({ name }: { readonly name: TurnFixtureName }) {
  const [state, setState] = useState(() => turnFixture(name));
  const [error, setError] = useState<string>();
  function command(
    command_name: GameplayCommandName,
    payload: Record<string, unknown>,
  ) {
    const result = reduceGameplayCommand(
      state,
      "confederate",
      gameplayCommandSchema.parse({
        schema: COMMAND_SCHEMA_VERSION,
        command_id: crypto.randomUUID(),
        game_id: state.game_id,
        expected_version: state.version,
        command_name,
        payload,
      }),
    );
    if (result.ok) {
      setState(result.state);
      setError(undefined);
    } else setError(result.failure.message);
  }
  return (
    <main>
      <h1>Turn test fixture - not a live game</h1>
      <output aria-label="Fixture state">
        v{state.version}: {state.active_side} {state.phase}
      </output>
      <output aria-label="Fixture counters">
        {Object.values(state.units)
          .map(
            (unit) =>
              `${unit.id}=${unit.location ?? unit.status}, spent=${unit.movement_spent ?? 0}`,
          )
          .join("; ")}
      </output>
      {error ? <p role="alert">{error}</p> : null}
      <Board
        state={state}
        seat="confederate"
        onMove={(unit_ids, destination) => {
          if (unit_ids.length === 1)
            command("moveUnit", { unit_id: unit_ids[0], destination });
          else command("moveStack", { unit_ids, destination });
        }}
      />
      <TabletopControls
        state={state}
        seat="confederate"
        disabled={false}
        onCommand={command}
      />
    </main>
  );
}
export function mountTurnFixture(name: TurnFixtureName) {
  const application = document.getElementById("root");
  if (application) application.hidden = true;
  const container = document.createElement("div");
  document.body.append(container);
  createRoot(container).render(<TurnFixture name={name} />);
}
