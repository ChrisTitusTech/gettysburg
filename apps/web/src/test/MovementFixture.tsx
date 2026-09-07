// Imported only by the development-server browser harness, never by the app.
import { BOARD_TERRAIN } from "@gettysburg/content";
import {
  COMMAND_SCHEMA_VERSION,
  MANDATORY_RULESET_VERSION,
  gameplayCommandSchema,
  reduceGameplayCommand,
  type GameState,
  type HexCoordinate,
  type UnitState,
} from "@gettysburg/game";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Board } from "../Board";
import "../styles.css";

export type MovementFixtureName =
  "roads" | "woods" | "activation" | "bonus" | "continuation";
function initialState(name: MovementFixtureName): GameState {
  const accompanied = name === "bonus" || name === "continuation";
  const a: UnitState = {
    id: "a",
    label: "Fixture infantry",
    side: "confederate",
    location: "F5",
    kind: "infantry",
    combat: 3,
    movement: 1,
    entry_hexes: [],
    entry_turn: null,
    organization: "fixture",
    status: "deployed",
    strength: "full",
    steps_remaining: 2,
    movement_spent: accompanied ? 1 : 0,
  };
  return {
    game_id: "11111111-1111-4111-8111-111111111111",
    ruleset_version: MANDATORY_RULESET_VERSION,
    content_revision: "browser-fixture",
    version: 0,
    event_sequence: 0,
    turn: 1,
    phase: "movement",
    active_side: "confederate",
    night: false,
    combats: {},
    objectives: {},
    terrain: {
      ...BOARD_TERRAIN,
      F4: { ...BOARD_TERRAIN.F4, kind: "woods", woods: true, defense: 2 },
    },
    movement_edges: {
      roads:
        name === "woods"
          ? []
          : [
              ["F5", "F4"],
              ["F4", "F3"],
            ],
      railroads: [],
      streams: [],
    },
    units: accompanied
      ? {
          a,
          g: {
            ...a,
            id: "g",
            label: "Fixture general",
            kind: "general",
            combat: null,
            movement: 5,
          },
          ...(name === "continuation"
            ? {
                b: {
                  ...a,
                  id: "b",
                  label: "Stationary friend",
                  movement_spent: 0,
                },
              }
            : {}),
        }
      : { a },
    normal_movement: {
      active_unit_ids: accompanied ? ["a", "g"] : [],
      closed_unit_ids: name === "activation" ? ["a"] : [],
      bonus_unit_ids: accompanied ? ["a"] : [],
    },
    victory: { confederate: 0, union: 0, status: "in-progress" },
  };
}
function MovementFixture({ name }: { readonly name: MovementFixtureName }) {
  const [state, setState] = useState(() => initialState(name));
  const [error, setError] = useState<string>();
  function move(unitIds: readonly string[], destination: HexCoordinate) {
    const command = gameplayCommandSchema.parse({
      schema: COMMAND_SCHEMA_VERSION,
      command_id: crypto.randomUUID(),
      game_id: state.game_id,
      expected_version: state.version,
      ...(unitIds.length === 1
        ? {
            command_name: "moveUnit",
            payload: { unit_id: unitIds[0], destination },
          }
        : {
            command_name: "moveStack",
            payload: { unit_ids: [...unitIds], destination },
          }),
    });
    const result = reduceGameplayCommand(state, "confederate", command);
    if (result.ok) {
      setState(result.state);
      setError(undefined);
    } else setError(result.failure.message);
  }
  return (
    <main>
      <h1>Movement test fixture - not a live game</h1>
      <output aria-label="Fixture state">
        v{state.version}:{" "}
        {Object.values(state.units)
          .map((unit) => `${unit.id}=${unit.location}`)
          .join(", ")}
      </output>
      <Board state={state} seat="confederate" onMove={move} error={error} />
    </main>
  );
}
export function mountMovementFixture(name: MovementFixtureName) {
  const application = document.getElementById("root");
  if (application) application.hidden = true;
  const container = document.createElement("div");
  document.body.append(container);
  createRoot(container).render(<MovementFixture name={name} />);
}
