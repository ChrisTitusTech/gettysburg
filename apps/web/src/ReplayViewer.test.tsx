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
import { ApiResponseError, type ReplayResponse } from "./api";

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
  it("retains the board, zoom, and selected counter while an adjacent event loads", async () => {
    const user = userEvent.setup();
    let finish!: (value: ReplayResponse) => void;
    const pending = new Promise<ReplayResponse>((resolve) => {
      finish = resolve;
    });
    const load = vi
      .fn()
      .mockResolvedValueOnce(snapshot(0))
      .mockReturnValueOnce(pending);
    const view = render(
      <ReplayViewer gameId={gameId} latestSequence={2} load={load} />,
    );
    await screen.findByText(/Viewing event 0 of 2/);
    await user.click(
      screen.getByRole("button", { name: /Wadsworth, D3, selectable/ }),
    );
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    const board = view.container.querySelector(".board-svg");
    const viewport = board?.getAttribute("viewBox");
    await user.click(screen.getByRole("button", { name: "Next event" }));
    expect(screen.getByText(/Still showing event 0/)).toBeVisible();
    expect(view.container.querySelector(".board-svg")).toBe(board);
    const next = snapshot(1);
    await act(async () =>
      finish({
        ...next,
        state: {
          ...next.state,
          units: {
            ...next.state.units,
            "u-wadsworth": {
              ...next.state.units["u-wadsworth"]!,
              location: "E4",
            },
          },
        },
      }),
    );
    await screen.findByText(/Viewing event 1 of 2/);
    expect(view.container.querySelector(".board-svg")).toBe(board);
    expect(board?.getAttribute("viewBox")).toBe(viewport);
    expect(
      screen.getByRole("button", { name: /Wadsworth, E4, selectable/ }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it.each([5, undefined])(
    "pauses navigation for a 429 retry window (%s seconds)",
    async (seconds) => {
      vi.useFakeTimers();
      try {
        const load = vi
          .fn()
          .mockResolvedValueOnce(snapshot(0))
          .mockRejectedValueOnce(
            new ApiResponseError(
              "limited",
              429,
              "replay_rate_limited",
              seconds,
            ),
          )
          .mockResolvedValueOnce(snapshot(1));
        render(<ReplayViewer gameId={gameId} latestSequence={2} load={load} />);
        await act(async () => {});
        await act(async () =>
          fireEvent.click(screen.getByRole("button", { name: "Next event" })),
        );
        expect(screen.getByRole("alert")).toHaveTextContent(
          `Try again in ${seconds ?? 60} seconds`,
        );
        expect(screen.getByText(/Viewing event 0 of 2/)).toBeVisible();
        expect(
          screen.getByLabelText(/Read-only replay board/),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: "Latest event" }),
        ).toBeDisabled();
        fireEvent.submit(
          screen.getByLabelText("Event number").closest("form")!,
        );
        expect(load).toHaveBeenCalledTimes(2);
        await act(async () =>
          vi.advanceTimersByTimeAsync((seconds ?? 60) * 1_000 - 1),
        );
        expect(
          screen.getByRole("button", { name: "Next event" }),
        ).toBeDisabled();
        await act(async () => vi.advanceTimersByTimeAsync(1));
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: "Next event" }),
        ).toBeEnabled();
        expect(load).toHaveBeenCalledTimes(2);
        await act(async () =>
          fireEvent.click(screen.getByRole("button", { name: "Next event" })),
        );
        expect(screen.getByText(/Viewing event 1 of 2/)).toBeVisible();
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("does not retain another game's board while its first read is pending", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce(snapshot(0))
      .mockReturnValueOnce(new Promise(() => {}));
    const view = render(
      <ReplayViewer gameId={gameId} latestSequence={2} load={load} />,
    );
    await screen.findByText(/Viewing event 0 of 2/);
    view.rerender(
      <ReplayViewer gameId="another-game" latestSequence={0} load={load} />,
    );
    expect(
      screen.queryByLabelText(/Read-only replay board/),
    ).not.toBeInTheDocument();
  });

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
