import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TabletopControls } from "./TabletopControls";
import { Board } from "./Board";
import { retreatFixture, RETREAT_COMBAT_ID } from "./test/retreat-fixture";
import type { GameState } from "@gettysburg/game";

function mount(state: GameState, disabled = false) {
  const onCommand = vi.fn();
  return {
    onCommand,
    ...render(
      <TabletopControls
        disabled={disabled}
        onCommand={onCommand}
        seat="confederate"
        state={state}
      />,
    ),
  };
}
describe("mandatory retreat controls", () => {
  it("previews a complete friendly-transit path and sends nothing until confirmation", () => {
    const { onCommand } = mount(retreatFixture("chain"));
    fireEvent.click(screen.getByRole("button", { name: "Next F4" }));
    expect(
      screen.queryByRole("button", { name: /Confirm retreat/ }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next F3" }));
    expect(
      screen.getByRole("status", { name: "Retreat route from F5" }),
    ).toHaveTextContent("F5 -> F4 -> F3");
    expect(screen.queryByRole("button", { name: /^Next / })).toBeNull();
    expect(onCommand).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm retreat to F3" }),
    );
    expect(onCommand).toHaveBeenCalledWith("retreatStack", {
      combat_id: RETREAT_COMBAT_ID,
      unit_ids: ["a"],
      path: ["F5", "F4", "F3"],
    });
  });
  it("supports undo and suggested routes without committing", () => {
    const { onCommand } = mount(retreatFixture("chain"));
    fireEvent.click(
      screen.getByRole("button", { name: "Use suggested route" }),
    );
    expect(
      screen.getByRole("button", { name: "Confirm retreat to F3" }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Undo route step" }));
    expect(
      screen.queryByRole("button", { name: /Confirm retreat/ }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Next F3" })).toBeEnabled();
    expect(onCommand).not.toHaveBeenCalled();
  });
  it("offers exactly one extra combat-counter loss for a terrain trap", () => {
    const state = retreatFixture("trapped");
    const general = {
      ...state.units.a!,
      id: "g",
      label: "General",
      kind: "general" as const,
      combat: null,
    };
    const combat = state.combats[RETREAT_COMBAT_ID]!;
    const current: GameState = {
      ...state,
      units: { ...state.units, g: general },
      combats: {
        [combat.id]: {
          ...combat,
          pending_choice: {
            kind: "retreat",
            side: "confederate",
            unit_ids: ["a", "g"],
          },
        },
      },
    };
    const { onCommand } = mount(current);
    const select = screen.getByRole("combobox", { name: "Extra loss at F5" });
    expect(
      within(select).queryByRole("option", { name: "General" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Confirm one extra loss and hold" }),
    ).toBeDisabled();
    fireEvent.change(select, { target: { value: "a" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm one extra loss and hold" }),
    );
    expect(onCommand).toHaveBeenCalledWith("acceptTrappedLoss", {
      combat_id: RETREAT_COMBAT_ID,
      unit_id: "a",
    });
    expect(
      screen.queryByRole("button", { name: /permanent retreat/ }),
    ).toBeNull();
  });
  it("offers the approved blocked-edge exit alongside holding", () => {
    const { onCommand } = mount(retreatFixture("edge"));
    expect(screen.getByText(/Leaving is permanent/)).toBeVisible();
    expect(
      screen.getByRole("combobox", { name: "Extra loss at A2" }),
    ).toBeEnabled();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Confirm permanent retreat off board",
      }),
    );
    expect(onCommand).toHaveBeenCalledWith("retreatOffBoard", {
      combat_id: RETREAT_COMBAT_ID,
      unit_ids: ["a"],
      path: ["A2"],
    });
  });
  it("disables every choice during a pending server request", () => {
    const { onCommand } = mount(retreatFixture("edge"), true);
    for (const button of within(
      screen.getByRole("region", { name: "Retreat from A2" }),
    ).getAllByRole("button"))
      expect(button).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Confirm permanent retreat off board",
      }),
    );
    expect(onCommand).not.toHaveBeenCalled();
  });
  it("resets the uncommitted route when the authoritative version changes", () => {
    const state = retreatFixture("chain");
    const view = mount(state);
    fireEvent.click(
      screen.getByRole("button", { name: "Use suggested route" }),
    );
    view.rerender(
      <TabletopControls
        disabled={false}
        onCommand={view.onCommand}
        seat="confederate"
        state={{ ...state, version: 1 }}
      />,
    );
    expect(
      screen.getByRole("status", { name: "Retreat route from F5" }),
    ).toHaveTextContent(/^F5$/);
    expect(
      screen.queryByRole("button", { name: /Confirm retreat/ }),
    ).toBeNull();
  });
  it("does not expose an opposing seat's controls or authorize missing terrain", () => {
    const state = retreatFixture("edge");
    const view = render(
      <TabletopControls
        disabled={false}
        onCommand={vi.fn()}
        seat="union"
        state={state}
      />,
    );
    expect(
      screen.queryByRole("region", { name: "Retreat from A2" }),
    ).toBeNull();
    const { terrain, ...missing } = state;
    expect(terrain).toBeDefined();
    view.rerender(
      <TabletopControls
        disabled={false}
        onCommand={vi.fn()}
        seat="confederate"
        state={missing}
      />,
    );
    expect(
      screen.getByText(/pinned retreat data or route is unavailable/),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: /Confirm/ })).toBeNull();
  });
  it("rejects an impassable board click and directs the player to the choices", () => {
    const onRetreat = vi.fn();
    const { container } = render(
      <Board
        onMove={vi.fn()}
        onRetreat={onRetreat}
        seat="confederate"
        state={retreatFixture("trapped")}
      />,
    );
    fireEvent.keyDown(
      screen.getByRole("button", { name: /Fixture artillery, F5, selectable/ }),
      { key: "Enter" },
    );
    fireEvent.click(container.querySelector('[data-coordinate="F4"]')!);
    expect(onRetreat).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Use the retreat controls to choose legal steps/),
    ).toBeVisible();
  });
});
