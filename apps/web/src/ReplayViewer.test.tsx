import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMandatoryInitialState } from "@gettysburg/content";
import { describe, expect, it, vi } from "vitest";
import { ReplayViewer } from "./ReplayViewer";
import type { ReplayResponse } from "./api";

const gameId = "11111111-1111-4111-8111-111111111111";
function snapshot(sequence: number): ReplayResponse {
  return {
    sequence,
    latest_sequence: 2,
    state: {
      ...createMandatoryInitialState(gameId),
      event_sequence: sequence,
      version: sequence,
    },
  };
}

describe("read-only replay viewer", () => {
  it("navigates opening, next, previous, explicit cursor, and latest", async () => {
    const user = userEvent.setup();
    const load = vi.fn(async (_gameId: string, sequence?: number) =>
      snapshot(sequence ?? 2),
    );
    render(<ReplayViewer gameId={gameId} latestSequence={2} load={load} />);
    await screen.findByText(/Viewing event 0 of 2/);
    expect(
      screen.getByRole("button", { name: "Previous event" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next event" }));
    await screen.findByText(/Viewing event 1 of 2/);
    await user.click(screen.getByRole("button", { name: "Previous event" }));
    await screen.findByText(/Viewing event 0 of 2/);
    fireEvent.change(screen.getByLabelText("Event number"), {
      target: { value: "1" },
    });
    await user.click(screen.getByRole("button", { name: "Go to event" }));
    await screen.findByText(/Viewing event 1 of 2/);
    await user.click(screen.getByRole("button", { name: "Latest event" }));
    await screen.findByText(/Viewing event 2 of 2/);
    expect(screen.getByRole("button", { name: "Next event" })).toBeDisabled();
    expect(load.mock.calls.map((args) => args[1])).toEqual([
      0,
      1,
      0,
      1,
      undefined,
    ]);
    expect(
      screen.queryByRole("button", { name: "One counter" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Your seat")).not.toBeInTheDocument();
  });

  it("clears old replay data when the next authorized read fails", async () => {
    const user = userEvent.setup();
    const load = vi
      .fn()
      .mockResolvedValueOnce(snapshot(0))
      .mockRejectedValueOnce(new Error("unauthorized"));
    render(<ReplayViewer gameId={gameId} latestSequence={2} load={load} />);
    await screen.findByText(/Viewing event 0 of 2/);
    await user.click(screen.getByRole("button", { name: "Next event" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Replay is unavailable",
    );
    expect(
      screen.queryByLabelText(/Read-only replay board/),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Latest event" })).toBeEnabled();
  });

  it("aborts a pending read when the viewer closes and ignores its late response", async () => {
    let finish!: (value: ReplayResponse) => void;
    let signal: AbortSignal | undefined;
    const pending = new Promise<ReplayResponse>((resolve) => {
      finish = resolve;
    });
    const load = vi.fn(
      (_id: string, _sequence?: number, inputSignal?: AbortSignal) => {
        signal = inputSignal;
        return pending;
      },
    );
    const view = render(
      <ReplayViewer gameId={gameId} latestSequence={2} load={load} />,
    );
    await waitFor(() => expect(load).toHaveBeenCalledOnce());
    view.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => finish(snapshot(0)));
    expect(screen.queryByText(/Viewing event/)).not.toBeInTheDocument();
  });

  it("rejects a response for a different game without displaying it", async () => {
    const result = snapshot(0);
    const load = vi.fn().mockResolvedValue({
      ...result,
      state: { ...result.state, game_id: "another game" },
    });
    render(<ReplayViewer gameId={gameId} latestSequence={2} load={load} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Replay is unavailable",
    );
    expect(
      screen.queryByLabelText(/Read-only replay board/),
    ).not.toBeInTheDocument();
  });
});
