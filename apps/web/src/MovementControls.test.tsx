import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  MANDATORY_RULESET_VERSION,
  type GameState,
  type UnitState,
} from "@gettysburg/game";
import { normalMovementGroups } from "./MovementControls";
import { Board } from "./Board";

function unit(id: string, patch: Partial<UnitState> = {}): UnitState {
  return {
    id,
    label: id.toUpperCase(),
    side: "confederate",
    location: "F5",
    kind: "infantry",
    combat: 3,
    movement: 5,
    entry_hexes: [],
    entry_turn: null,
    organization: "fixture",
    status: "deployed",
    strength: "full",
    steps_remaining: 2,
    ...patch,
  };
}
function state(patch: Partial<GameState> = {}): GameState {
  return {
    game_id: "11111111-1111-4111-8111-111111111111",
    content_revision: "fixture",
    ruleset_version: MANDATORY_RULESET_VERSION,
    phase: "movement",
    active_side: "confederate",
    night: false,
    turn: 1,
    version: 0,
    event_sequence: 0,
    terrain: {},
    movement_edges: { roads: [], railroads: [], streams: [] },
    combats: {},
    objectives: {},
    victory: { confederate: 0, union: 0, status: "in-progress" },
    units: {
      a: unit("a", { movement: 1 }),
      b: unit("b"),
      g: unit("g", { kind: "general", combat: null }),
    },
    ...patch,
  };
}
function selectA(location = "F5") {
  fireEvent.keyDown(
    screen.getByRole("button", {
      name: new RegExp(`^A, ${location}, selectable`),
    }),
    { key: "Enter" },
  );
}
describe("mandatory movement group controls", () => {
  it("offers all legal subsets, source capacity, and whole-move general bonuses", () => {
    const current = state();
    const before = JSON.stringify(current);
    expect(normalMovementGroups(current, "confederate", "F5")).toEqual([
      { ids: ["a"], allowance: 1 },
      { ids: ["b"], allowance: 5 },
      { ids: ["a", "g"], allowance: 2 },
      { ids: ["b", "g"], allowance: 5 },
      { ids: ["a", "b", "g"], allowance: 2 },
    ]);
    expect(JSON.stringify(current)).toBe(before);
  });
  it("does not reopen active or closed counters as a different group", () => {
    const current = state({
      normal_movement: {
        active_unit_ids: ["a", "g"],
        closed_unit_ids: ["b"],
        bonus_unit_ids: ["a"],
      },
    });
    expect(normalMovementGroups(current, "confederate", "F5")).toEqual([
      { ids: ["a", "g"], allowance: 2 },
    ]);
    expect(normalMovementGroups(current, "union", "F5")).toEqual([]);
    expect(
      normalMovementGroups(
        { ...current, phase: "combat" },
        "confederate",
        "F5",
      ),
    ).toEqual([]);
  });
  it("selects a pair without moving or losing focus, then sends that pair through board input", async () => {
    const onMove = vi.fn();
    const { container } = render(
      <Board state={state()} seat="confederate" onMove={onMove} />,
    );
    selectA();
    const pair = screen.getByRole("radio", {
      name: "A + G (2 movement remaining)",
    });
    await userEvent.click(pair);
    expect(pair).toHaveFocus();
    expect(onMove).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector('[data-coordinate="F4"]')!);
    expect(onMove).toHaveBeenCalledWith(["a", "g"], "F4");
  });
  it("requires explicit confirmation for a permanent normal edge exit", () => {
    const onExit = vi.fn();
    render(
      <Board
        state={state({
          units: { a: unit("a", { location: "A2", movement: 1 }) },
        })}
        seat="confederate"
        onMove={vi.fn()}
        onExit={onExit}
      />,
    );
    selectA("A2");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Leave board with selected counters",
      }),
    );
    expect(onExit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel board exit" }));
    expect(
      screen.queryByRole("button", { name: "Confirm permanent board exit" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Leave board with selected counters",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm permanent board exit" }),
    );
    expect(onExit).toHaveBeenCalledWith(["a"]);
  });
  it("discards exit confirmation on a new authoritative version and disables requests", () => {
    const current = state({ units: { a: unit("a", { location: "A2" }) } });
    const onExit = vi.fn();
    const view = render(
      <Board
        state={current}
        seat="confederate"
        onMove={vi.fn()}
        onExit={onExit}
      />,
    );
    selectA("A2");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Leave board with selected counters",
      }),
    );
    view.rerender(
      <Board
        state={{ ...current, version: 1 }}
        seat="confederate"
        onMove={vi.fn()}
        onExit={onExit}
        disabled
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Confirm permanent board exit" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", {
        name: "Leave board with selected counters",
      }),
    ).toBeDisabled();
    expect(screen.getByRole("radio")).toBeDisabled();
    expect(onExit).not.toHaveBeenCalled();
  });
  it("does not offer unaffordable or non-edge exits", () => {
    const view = render(
      <Board
        state={state({
          units: { a: unit("a", { location: "A2", movement_spent: 5 }) },
        })}
        seat="confederate"
        onMove={vi.fn()}
      />,
    );
    selectA("A2");
    expect(screen.queryByRole("button", { name: /Leave board/ })).toBeNull();
    view.rerender(
      <Board state={state()} seat="confederate" onMove={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: /Leave board/ })).toBeNull();
  });
  it("does not restore a prior exit confirmation after selecting another group and returning", () => {
    const initial = state();
    const current: GameState = {
      ...initial,
      units: Object.fromEntries(
        Object.entries(initial.units).map(([id, unit]) => [
          id,
          { ...unit, location: "A2" as const },
        ]),
      ),
    };
    render(<Board state={current} seat="confederate" onMove={vi.fn()} />);
    selectA("A2");
    const pair = screen.getByRole("radio", {
      name: "A + G (2 movement remaining)",
    });
    fireEvent.click(pair);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Leave board with selected counters",
      }),
    );
    expect(
      screen.getByRole("button", { name: "Confirm permanent board exit" }),
    ).toBeEnabled();
    fireEvent.click(
      screen.getByRole("radio", {
        name: "A (1 movement remaining)",
      }),
    );
    fireEvent.click(pair);
    expect(
      screen.queryByRole("button", { name: "Confirm permanent board exit" }),
    ).toBeNull();
  });
});
