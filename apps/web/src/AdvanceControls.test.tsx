import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { advanceGroups, previewAdvance } from "./advance-preview";
import { TabletopControls } from "./TabletopControls";
import { Board } from "./Board";
import { advanceFixture, ADVANCE_COMBAT_ID } from "./test/advance-fixture";

describe("mandatory advance controls", () => {
  it("offers only terrain-safe victorious groups without normal movement limits", () => {
    const state = advanceFixture("mixed");
    const before = JSON.stringify(state);
    expect(advanceGroups(state, "confederate", ADVANCE_COMBAT_ID)).toEqual([
      { ids: ["b"], destinations: ["F4"] },
      { ids: ["b", "g"], destinations: ["F4"] },
    ]);
    const preview = previewAdvance(
      state,
      "confederate",
      ADVANCE_COMBAT_ID,
      ["b", "g"],
      "F4",
    );
    expect(preview).toMatchObject({
      ok: true,
      state: {
        units: {
          b: { location: "F4", movement_spent: 5 },
          g: { location: "F4", movement_spent: 5 },
        },
        victory: { confederate: 2 },
      },
    });
    expect(JSON.stringify(state)).toBe(before);
  });
  it("rejects general-only, missing terrain, wrong-seat and stale choice previews", () => {
    const state = advanceFixture("mixed");
    expect(
      previewAdvance(state, "confederate", ADVANCE_COMBAT_ID, ["g"], "F4").ok,
    ).toBe(false);
    expect(
      previewAdvance(
        { ...state, terrain: {} },
        "confederate",
        ADVANCE_COMBAT_ID,
        ["b"],
        "F4",
      ).ok,
    ).toBe(false);
    expect(
      previewAdvance(state, "union", ADVANCE_COMBAT_ID, ["b"], "F4").ok,
    ).toBe(false);
    expect(
      previewAdvance(
        { ...state, combats: {} },
        "confederate",
        ADVANCE_COMBAT_ID,
        ["b"],
        "F4",
      ).ok,
    ).toBe(false);
  });
  it("preserves selection focus and waits for confirmation before advancing a pair", async () => {
    const onCommand = vi.fn();
    render(
      <TabletopControls
        state={advanceFixture("mixed")}
        seat="confederate"
        disabled={false}
        onCommand={onCommand}
      />,
    );
    const pair = screen.getByRole("radio", {
      name: "Fixture infantry + Fixture general from F5",
    });
    await userEvent.click(pair);
    expect(pair).toHaveFocus();
    expect(onCommand).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm advance to F4" }),
    );
    expect(onCommand).toHaveBeenCalledWith("advanceAfterCombat", {
      combat_id: ADVANCE_COMBAT_ID,
      decline: false,
      destination: "F4",
      unit_ids: ["b", "g"],
    });
  });
  it("can decline even when no group can enter the destination", () => {
    const onCommand = vi.fn();
    render(
      <TabletopControls
        state={advanceFixture("blocked")}
        seat="confederate"
        disabled={false}
        onCommand={onCommand}
      />,
    );
    expect(screen.queryByRole("radio")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Confirm advance/ }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Decline this advance" }),
    );
    expect(onCommand).toHaveBeenCalledWith("advanceAfterCombat", {
      combat_id: ADVANCE_COMBAT_ID,
      decline: true,
    });
  });
  it("disables pending requests and hides the other seat's controls", () => {
    const state = advanceFixture("mixed");
    const onCommand = vi.fn();
    const view = render(
      <TabletopControls
        state={state}
        seat="confederate"
        disabled
        onCommand={onCommand}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Confirm advance to F4" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Decline this advance" }),
    ).toBeDisabled();
    for (const radio of screen.getAllByRole("radio"))
      expect(radio).toBeDisabled();
    view.rerender(
      <TabletopControls
        state={state}
        seat="union"
        disabled={false}
        onCommand={onCommand}
      />,
    );
    expect(screen.queryByRole("region", { name: "Advance choice" })).toBeNull();
    expect(onCommand).not.toHaveBeenCalled();
  });
  it.each(["blocked", "clear"] as const)(
    "validates %s artillery board clicks before sending",
    (name) => {
      const onAdvance = vi.fn();
      const { container } = render(
        <Board
          state={advanceFixture(name)}
          seat="confederate"
          onMove={vi.fn()}
          onAdvance={onAdvance}
        />,
      );
      fireEvent.keyDown(
        screen.getByRole("button", {
          name: /Fixture artillery, F5, selectable/,
        }),
        { key: "Enter" },
      );
      fireEvent.click(container.querySelector('[data-coordinate="F4"]')!);
      if (name === "clear")
        expect(onAdvance).toHaveBeenCalledWith(ADVANCE_COMBAT_ID, ["a"], "F4");
      else {
        expect(onAdvance).not.toHaveBeenCalled();
        expect(screen.getByText(/known passable terrain/)).toBeVisible();
      }
    },
  );
});
