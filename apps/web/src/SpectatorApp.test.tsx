import { StrictMode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMandatoryInitialState } from "@gettysburg/content";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpectatorApp } from "./SpectatorApp";

const mocks = vi.hoisted(() => ({
  join: vi.fn(),
  resume: vi.fn(),
  claim: vi.fn(),
}));
vi.mock("@colyseus/sdk", () => ({
  Client: class {
    joinOrCreate = mocks.join;
  },
}));
vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  resumeSpectator: mocks.resume,
  claimSpectatorInvitation: mocks.claim,
}));
const id = "11111111-1111-4111-8111-111111111111";
function snapshot(sequence = 0) {
  return {
    game_id: id,
    action_log: [],
    state: {
      ...createMandatoryInitialState(id),
      event_sequence: sequence,
      version: sequence,
    },
  };
}
function fakeRoom() {
  const handlers = new Map<string, (event: unknown) => void>();
  let leaveHandler = (code: number) => {
    void code;
  };
  return {
    handlers,
    reconnection: { enabled: true },
    connection: { isOpen: true },
    send: vi.fn(),
    leave: vi.fn().mockResolvedValue(1000),
    onMessage: (name: string, callback: (event: unknown) => void) =>
      handlers.set(name, callback),
    onLeave: (callback: (code: number) => void) => {
      leaveHandler = callback;
    },
    onError: vi.fn(),
    close: (code: number) => leaveHandler(code),
  };
}
let rooms: ReturnType<typeof fakeRoom>[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.history.replaceState(null, "", `/observe/game/${id}`);
  rooms = [];
  mocks.resume.mockResolvedValue(snapshot());
  mocks.claim.mockResolvedValue(snapshot());
  mocks.join.mockImplementation(async () => {
    const room = fakeRoom();
    rooms.push(room);
    return room;
  });
});
describe("read-only spectator browser", () => {
  it("resumes explicitly as an observer, inspects either side, and never sends commands", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("gettysburg:last-game-id", "other-player-game");
    render(
      <StrictMode>
        <SpectatorApp />
      </StrictMode>,
    );
    await screen.findByText("connected", { exact: true });
    expect(mocks.join).toHaveBeenCalledWith("game", {
      gameId: id,
      spectator: true,
    });
    await user.click(
      screen.getByRole("button", { name: /Wadsworth, D3, selectable/ }),
    );
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(
      screen.getByText("Read-only live board; no commands are sent."),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "End movement phase" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete game" }),
    ).not.toBeInTheDocument();
    expect(rooms).toHaveLength(1);
    expect(rooms[0]!.reconnection.enabled).toBe(false);
    expect(rooms[0]!.send).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("gettysburg:last-game-id")).toBe(
      "other-player-game",
    );
  });
  it("keeps accepted state monotonic, repairs event gaps, and clears the board on revocation", async () => {
    render(<SpectatorApp />);
    await screen.findByText("connected", { exact: true });
    const room = rooms[0]!;
    await act(async () => {
      room.handlers.get("gameplayEvent")!({
        kind: "gameplay",
        event_sequence: 1,
        summary: "Test accepted move",
      });
      room.handlers.get("snapshot")!(snapshot(1).state);
      room.handlers.get("snapshot")!(snapshot(0).state);
    });
    expect(screen.getByText(/State v1. Event 1./)).toBeVisible();
    mocks.resume.mockResolvedValue(snapshot(3));
    await act(async () =>
      room.handlers.get("managementEvent")!({
        kind: "host_management",
        event_sequence: 3,
        summary: "Gap",
      }),
    );
    await screen.findByText(/State v3. Event 3./);
    await act(async () => room.close(4001));
    expect(
      screen.getByText("Spectator access ended or the game was deleted."),
    ).toBeVisible();
    expect(
      screen.queryByLabelText(/Read-only live board/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "View replay" }),
    ).not.toBeInTheDocument();
    expect(room.send).not.toHaveBeenCalled();
  });
  it("merges missing history from a delayed read without rewinding newer socket state", async () => {
    render(<SpectatorApp />);
    await screen.findByText("connected", { exact: true });
    let finish!: (value: unknown) => void;
    mocks.resume.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const event = (sequence: number) => ({
      kind: "gameplay",
      event_sequence: sequence,
      summary: `Observed action ${sequence}`,
    });
    const room = rooms[0]!;
    await act(async () => {
      room.handlers.get("gameplayEvent")!(event(2));
      room.handlers.get("snapshot")!(snapshot(2).state);
      room.handlers.get("gameplayEvent")!(event(3));
      room.handlers.get("snapshot")!(snapshot(3).state);
    });
    await act(async () =>
      finish({ ...snapshot(2), action_log: [event(1), event(2)] }),
    );
    expect(screen.getByText(/State v3. Event 3./)).toBeVisible();
    for (const sequence of [1, 2, 3])
      expect(screen.getByText(`Observed action ${sequence}`)).toBeVisible();
    expect(screen.getAllByText("Observed action 2")).toHaveLength(1);
  });
  it.each(["http", "socket"])(
    "reconciles missed gameplay after a newer management event using %s",
    async (source) => {
      render(<SpectatorApp />);
      await screen.findByText("connected", { exact: true });
      let finish!: (value: unknown) => void;
      mocks.resume.mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      const room = rooms[0]!;
      await act(async () => {
        room.handlers.get("gameplayEvent")!({
          kind: "gameplay",
          event_sequence: 2,
          summary: "Missed move",
        });
        room.handlers.get("managementEvent")!({
          kind: "host_management",
          event_sequence: 3,
          state_version: 2,
          summary: "New invitation",
        });
      });
      await act(async () => {
        if (source === "http") finish(snapshot(2));
        else room.handlers.get("snapshot")!(snapshot(2).state);
      });
      expect(screen.getByText(/State v2. Event 3./)).toBeVisible();
      await act(async () => room.handlers.get("snapshot")!(snapshot(1).state));
      expect(screen.getByText(/State v2. Event 3./)).toBeVisible();
      await act(async () => finish(snapshot(2)));
    },
  );
  it.each([4002, 1006])(
    "reauthorizes on explicit reconnect after disconnect %s",
    async (code) => {
      const user = userEvent.setup();
      render(<SpectatorApp />);
      await screen.findByText("connected", { exact: true });
      await act(async () => rooms[0]!.close(code));
      expect(
        screen.queryByLabelText(/Read-only live board/),
      ).not.toBeInTheDocument();
      mocks.resume.mockResolvedValue(snapshot(4));
      await user.click(
        screen.getByRole("button", { name: "Reconnect spectator" }),
      );
      await screen.findByText("connected", { exact: true });
      expect(screen.getByText(/State v4. Event 4./)).toBeVisible();
      expect(rooms).toHaveLength(2);
    },
  );
  it("retains an exact claim ID across failure and removes the grant after success", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", `/observe/join/${id}`);
    mocks.claim.mockRejectedValueOnce(new Error("lost response"));
    render(
      <SpectatorApp initialGrant={{ lookupId: id, secret: "s".repeat(43) }} />,
    );
    await user.click(
      screen.getByRole("button", { name: "Claim spectator access" }),
    );
    await screen.findByRole("alert");
    await user.click(
      screen.getByRole("button", { name: "Claim spectator access" }),
    );
    await screen.findByText("connected", { exact: true });
    expect(mocks.claim.mock.calls[0]).toEqual(mocks.claim.mock.calls[1]);
    expect(window.location.pathname).toBe(`/observe/game/${id}`);
    expect(
      screen.queryByRole("button", { name: "Claim spectator access" }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.resume).toHaveBeenCalled());
  });
});
