import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { reinforcementEntryHexes } from "@gettysburg/game";
import { TabletopControls } from "./TabletopControls";
import { turnFixture } from "./test/turn-fixture";

describe("mandatory reinforcement and night guidance", () => {
  it("selects a joint arrival and shows its explicit road entry cost", () => {
    const onCommand = vi.fn();
    render(
      <TabletopControls
        state={turnFixture("entry")}
        seat="confederate"
        disabled={false}
        onCommand={onCommand}
      />,
    );
    expect(
      screen.queryByRole("checkbox", { name: /Later arrival/ }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: /Fixture infantry/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Fixture general/ }));
    expect(onCommand).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Enter selected at A2 (0.5 movement each)",
      }),
    );
    expect(onCommand).toHaveBeenCalledWith("enterReinforcementStack", {
      unit_ids: ["a", "g"],
      destination: "A2",
    });
  });
  it("offers nearest enemy-free alternatives through the shared entry calculator", () => {
    const state = turnFixture("blocked-entry");
    const onCommand = vi.fn();
    render(
      <TabletopControls
        state={state}
        seat="confederate"
        disabled={false}
        onCommand={onCommand}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /Fixture infantry/ }));
    expect(
      screen.queryByRole("button", { name: /Enter selected at A2 / }),
    ).toBeNull();
    const alternatives = reinforcementEntryHexes(state, state.units.a!);
    expect(alternatives.length).toBeGreaterThan(0);
    for (const hex of alternatives)
      expect(
        screen.getByRole("button", {
          name: `Enter selected at ${hex} (1 movement each)`,
        }),
      ).toBeEnabled();
    fireEvent.click(
      screen.getByRole("button", {
        name: `Enter selected at ${alternatives[0]} (1 movement each)`,
      }),
    );
    expect(onCommand).toHaveBeenCalledWith("enterReinforcement", {
      unit_id: "a",
      destination: alternatives[0],
    });
  });
  it("explains friendly congestion instead of inventing alternate entries", () => {
    render(
      <TabletopControls
        state={turnFixture("congested")}
        seat="confederate"
        disabled={false}
        onCommand={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /Fixture infantry/ }));
    expect(
      screen.getByRole("button", { name: "Enter selected at A2" }),
    ).toBeDisabled();
    expect(screen.getByText(/clear it or wait/)).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: /^Enter selected/ }),
    ).toHaveLength(1);
    fireEvent.click(screen.getByRole("checkbox", { name: /Fixture general/ }));
    expect(
      screen.getByRole("button", {
        name: "Enter selected at A2 (0.5 movement each)",
      }),
    ).toBeEnabled();
  });
  it("resets selections after a server update and disables pending requests", () => {
    const state = turnFixture("entry");
    const view = render(
      <TabletopControls
        state={state}
        seat="confederate"
        disabled={false}
        onCommand={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /Fixture infantry/ }));
    view.rerender(
      <TabletopControls
        state={{ ...state, version: 1 }}
        seat="confederate"
        disabled
        onCommand={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /^Enter selected/ }),
    ).toBeNull();
    for (const checkbox of screen.getAllByRole("checkbox")) {
      expect(checkbox).not.toBeChecked();
      expect(checkbox).toBeDisabled();
    }
  });
  it("requires an affordable night withdrawal before offering end movement", () => {
    render(
      <TabletopControls
        state={turnFixture("night")}
        seat="confederate"
        disabled={false}
        onCommand={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/Must withdraw: Fixture infantry \(F5\)/),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Withdraw 1 counter(s) before ending movement",
      }),
    ).toBeDisabled();
  });
  it("does not block ending movement for a terrain-trapped night counter", () => {
    const onCommand = vi.fn();
    render(
      <TabletopControls
        state={turnFixture("trapped-night")}
        seat="confederate"
        disabled={false}
        onCommand={onCommand}
      />,
    );
    expect(screen.queryByText(/Must withdraw:/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "End movement phase" }));
    expect(onCommand).toHaveBeenCalledWith("endPhase", {});
  });
  it("fails closed when the pinned night movement bundle is unavailable", () => {
    const { movement_edges, ...missing } = turnFixture("night");
    expect(movement_edges).toBeDefined();
    render(
      <TabletopControls
        state={missing}
        seat="confederate"
        disabled={false}
        onCommand={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      /pinned movement data is unavailable/,
    );
    expect(
      screen.getByRole("button", {
        name: "Pinned night movement data unavailable",
      }),
    ).toBeDisabled();
  });
  it("leaves inactive seats waiting rather than inviting a withdrawal command", () => {
    render(
      <TabletopControls
        state={turnFixture("night")}
        seat="union"
        disabled={false}
        onCommand={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Must withdraw:/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Waiting for Confederate player" }),
    ).toBeDisabled();
  });
});
