import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GameState } from "@gettysburg/game";
import { describe, expect, it, vi } from "vitest";

import { Board } from "./Board";

const state: GameState = {
  active_side: "confederate",
  content_revision: "phase-1-fixture-v1",
  event_sequence: 0,
  game_id: "11111111-1111-4111-8111-111111111111",
  ruleset_version: "phase-1-rules-v1",
  turn: 1,
  units: {
    "fixture-confederate-1": {
      id: "fixture-confederate-1",
      label: "Confederate fixture counter",
      location: "F5",
      side: "confederate",
    },
    "fixture-union-1": {
      id: "fixture-union-1",
      label: "Union fixture counter",
      location: "P7",
      side: "union",
    },
  },
  version: 0,
};

describe("Board", () => {
  it("selects only the acting seat and sends pointer move intent", async () => {
    const onMove = vi.fn();
    const { container } = render(
      <Board onMove={onMove} seat="confederate" state={state} />,
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: /Confederate fixture counter, F5, selectable/,
      }),
    );
    fireEvent.click(container.querySelector('[data-coordinate="G5"]')!);

    expect(onMove).toHaveBeenCalledWith("fixture-confederate-1", "G5");
    expect(
      screen.getByRole("button", { name: /Union fixture counter, P7/ }),
    ).toHaveAttribute("tabindex", "-1");
  });

  it("supports keyboard counter selection and coordinate entry", async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    render(<Board onMove={onMove} seat="union" state={state} />);
    const counter = screen.getByRole("button", {
      name: /Union fixture counter, P7, selectable/,
    });
    counter.focus();
    await user.keyboard("{Enter}");
    await user.type(screen.getByLabelText("Destination coordinate"), "Q7");
    await user.click(screen.getByRole("button", { name: "Move" }));

    expect(onMove).toHaveBeenCalledWith("fixture-union-1", "Q7");
  });

  it("rejects an invalid coordinate before creating move intent", async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    render(<Board onMove={onMove} seat="union" state={state} />);
    await user.click(
      screen.getByRole("button", {
        name: /Union fixture counter, P7, selectable/,
      }),
    );
    await user.type(screen.getByLabelText("Destination coordinate"), "Z99");
    await user.click(screen.getByRole("button", { name: "Move" }));

    expect(onMove).not.toHaveBeenCalled();
  });

  it("zooms and returns to its calibrated fit", async () => {
    const user = userEvent.setup();
    render(<Board onMove={vi.fn()} seat="union" state={state} />);
    await user.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(screen.getByLabelText("Current zoom")).toHaveTextContent("65%");
    await user.click(screen.getByRole("button", { name: "Fit" }));
    expect(screen.getByLabelText("Current zoom")).toHaveTextContent("100%");
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByLabelText("Current zoom")).toHaveTextContent("135%");
    await user.click(screen.getByRole("button", { name: "Fit" }));
    expect(screen.getByLabelText("Current zoom")).toHaveTextContent("100%");
  });

  it("keeps a rejected counter at the confirmed authoritative location", () => {
    render(
      <Board
        error="That fixture hex is occupied."
        onMove={vi.fn()}
        seat="confederate"
        state={state}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: /Confederate fixture counter, F5, selectable/,
      }),
    ).toHaveAttribute("transform", expect.stringContaining("358"));
    expect(screen.getByText("That fixture hex is occupied.")).toBeVisible();
  });
});
