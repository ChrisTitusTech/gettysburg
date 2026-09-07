// Development-only browser fixture, not imported by the application bundle.
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
import {
  advanceFixture,
  ADVANCE_COMBAT_ID,
  type AdvanceFixtureName,
} from "./advance-fixture";
import "../styles.css";

function AdvanceFixture({ name }: { readonly name: AdvanceFixtureName }) {
  const [state, setState] = useState(() => advanceFixture(name));
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
      <h1>Advance test fixture - not a live game</h1>
      <output aria-label="Fixture state">
        v{state.version}: {state.combats[ADVANCE_COMBAT_ID]!.status}
      </output>
      <output aria-label="Fixture counters">
        {Object.values(state.units)
          .map(
            (unit) =>
              `${unit.id}=${unit.location}, spent=${unit.movement_spent}`,
          )
          .join("; ")}
      </output>
      {error ? <p role="alert">{error}</p> : null}
      <Board
        state={state}
        seat="confederate"
        onMove={() => {
          throw new Error("Normal movement is unavailable");
        }}
        onAdvance={(combat_id, unit_ids, destination) =>
          command("advanceAfterCombat", {
            combat_id,
            unit_ids,
            decline: destination === null,
            ...(destination ? { destination } : {}),
          })
        }
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
export function mountAdvanceFixture(name: AdvanceFixtureName) {
  const application = document.getElementById("root");
  if (application) application.hidden = true;
  const container = document.createElement("div");
  document.body.append(container);
  createRoot(container).render(<AdvanceFixture name={name} />);
}
