import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PushControls } from "./PushControls";
import {
  getPushConfig,
  getPushStatus,
  removePushSubscription,
  setPushSubscription,
} from "./api";
import { subscribeThisBrowser } from "./browser-push";

vi.mock("./api", () => ({
  getPushConfig: vi.fn(),
  getPushStatus: vi.fn(),
  removePushSubscription: vi.fn(),
  setPushSubscription: vi.fn(),
}));
vi.mock("./browser-push", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./browser-push")>()),
  pushSupportProblem: () => null,
  subscribeThisBrowser: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPushConfig).mockResolvedValue({
    enabled: true,
    applicationServerKey: "key",
  });
  vi.mocked(getPushStatus).mockResolvedValue({ enabled: false });
  vi.mocked(setPushSubscription).mockResolvedValue({
    enabled: true,
    expires_at: Date.now() + 1_000,
  });
  vi.mocked(removePushSubscription).mockResolvedValue({ enabled: false });
  vi.mocked(subscribeThisBrowser).mockResolvedValue({ endpoint: "test" });
});
describe("seat notification controls", () => {
  it("never prompts on load, and enrolls only after an explicit click", async () => {
    render(<PushControls gameId="game-one" />);
    const enable = screen.getByRole("button", {
      name: "Enable in this browser",
    });
    await waitFor(() => expect(enable).toBeEnabled());
    expect(subscribeThisBrowser).not.toHaveBeenCalled();
    fireEvent.click(enable);
    await screen.findByText(
      "Notifications enabled in this browser for this seat.",
    );
    expect(setPushSubscription).toHaveBeenCalledWith(
      "game-one",
      { endpoint: "test" },
      expect.any(AbortSignal),
    );
  });
  it("offers per-seat opt-out even while server push is disabled", async () => {
    vi.mocked(getPushConfig).mockResolvedValue({ enabled: false });
    vi.mocked(getPushStatus).mockResolvedValue({
      enabled: true,
      expires_at: Date.now() + 1_000,
    });
    render(<PushControls gameId="game-one" />);
    const disable = screen.getByRole("button", {
      name: "Turn off for this seat",
    });
    await waitFor(() => expect(disable).toBeEnabled());
    expect(
      screen.getByRole("button", { name: "Enable in this browser" }),
    ).toBeDisabled();
    fireEvent.click(disable);
    await screen.findByText("Notifications turned off for this seat.");
    expect(removePushSubscription).toHaveBeenCalledWith(
      "game-one",
      expect.any(AbortSignal),
    );
    expect(subscribeThisBrowser).not.toHaveBeenCalled();
  });
  it("does not send consent from a late native prompt after unmount", async () => {
    let finish!: (value: PushSubscriptionJSON) => void;
    vi.mocked(subscribeThisBrowser).mockImplementationOnce(
      (_key, signal) =>
        new Promise((resolve, reject) => {
          finish = resolve;
          signal.addEventListener("abort", () => reject(signal.reason));
        }),
    );
    const view = render(<PushControls gameId="old-game" />);
    const enable = screen.getByRole("button", {
      name: "Enable in this browser",
    });
    await waitFor(() => expect(enable).toBeEnabled());
    fireEvent.click(enable);
    view.unmount();
    finish({ endpoint: "late" });
    await Promise.resolve();
    expect(setPushSubscription).not.toHaveBeenCalled();
  });
  it("blocks overlapping enrollment and reports failures without raw credentials", async () => {
    vi.mocked(subscribeThisBrowser).mockRejectedValueOnce(
      new Error("private endpoint"),
    );
    render(<PushControls gameId="game-one" />);
    const enable = screen.getByRole("button", {
      name: "Enable in this browser",
    });
    await waitFor(() => expect(enable).toBeEnabled());
    fireEvent.click(enable);
    fireEvent.click(enable);
    await screen.findByText(/Could not update notifications/);
    expect(subscribeThisBrowser).toHaveBeenCalledOnce();
    expect(screen.queryByText(/private endpoint/)).not.toBeInTheDocument();
    expect(setPushSubscription).not.toHaveBeenCalled();
  });
  it("allows retry after a failed settings read", async () => {
    vi.mocked(getPushConfig).mockRejectedValueOnce(new Error("offline"));
    render(<PushControls gameId="game-one" />);
    await screen.findByText(/Could not check notification settings/);
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh notifications" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Enable in this browser" }),
      ).toBeEnabled(),
    );
  });
});
