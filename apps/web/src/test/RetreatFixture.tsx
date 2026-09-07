// Development-only fixture; it is not imported into the application bundle.
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
import { retreatFixture, type RetreatFixtureName } from "./retreat-fixture";
import "../styles.css";

function RetreatFixture({ name }: { readonly name: RetreatFixtureName }) {
  const [state, setState] = useState(() => retreatFixture(name));
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
      <h1>Retreat test fixture - not a live game</h1>
      <output aria-label="Fixture state">
        v{state.version}: a={state.units.a!.location ?? state.units.a!.status},
        steps={state.units.a!.steps_remaining}
      </output>
      {error ? <p role="alert">{error}</p> : null}
      <Board
        state={state}
        seat="confederate"
        onMove={() => {
          throw new Error("Normal movement is unavailable");
        }}
        onRetreat={(combat_id, unit_ids, path) =>
          command("retreatStack", { combat_id, unit_ids, path })
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
export function mountRetreatFixture(name: RetreatFixtureName) {
  const application = document.getElementById("root");
  if (application) application.hidden = true;
  const container = document.createElement("div");
  document.body.append(container);
  createRoot(container).render(<RetreatFixture name={name} />);
}
