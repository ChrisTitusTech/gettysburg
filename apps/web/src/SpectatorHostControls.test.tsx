import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SpectatorHostControls } from "./SpectatorHostControls";
import type { SpectatorGrant } from "./api";

const invited: SpectatorGrant = {
  lookup_id: "test-grant",
  status: "invited",
  invitation_expires_at: 86_400_000,
};
describe("host spectator management", () => {
  it.each(["invited", "claimed"] as const)(
    "refreshes before choosing the current %s revocation command",
    async (status) => {
      const load = vi
        .fn()
        .mockResolvedValueOnce({ grants: [invited] })
        .mockResolvedValueOnce({ grants: [{ ...invited, status }] })
        .mockResolvedValueOnce({ grants: [] });
      const execute = vi.fn().mockResolvedValue({ ok: true });
      const user = userEvent.setup();
      render(
        <SpectatorHostControls gameId="game" execute={execute} load={load} />,
      );
      const revoke = await screen.findByRole("button", {
        name: "Revoke spectator grant test-grant",
      });
      await user.click(revoke);
      await screen.findByText("No outstanding spectator grants.");
      expect(execute).toHaveBeenCalledWith(
        "spectator-revoke:test-grant",
        status === "claimed"
          ? "revokeSpectatorAccess"
          : "revokeSpectatorInvitation",
        { lookup_id: "test-grant" },
      );
    },
  );
  it("does not revoke an already retired grant and exposes retryable read failures", async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValueOnce({ grants: [invited] })
      .mockResolvedValueOnce({ grants: [] });
    const execute = vi.fn();
    const user = userEvent.setup();
    render(
      <SpectatorHostControls gameId="game" execute={execute} load={load} />,
    );
    await screen.findByRole("alert");
    await user.click(
      screen.getByRole("button", { name: "Refresh spectator grants" }),
    );
    await user.click(
      await screen.findByRole("button", {
        name: "Revoke spectator grant test-grant",
      }),
    );
    await screen.findByText("No outstanding spectator grants.");
    expect(execute).not.toHaveBeenCalled();
  });
  it("ignores a previous game's delayed response", async () => {
    let finish!: (result: { grants: SpectatorGrant[] }) => void;
    const delayed = new Promise<{ grants: SpectatorGrant[] }>((resolve) => {
      finish = resolve;
    });
    const load = vi
      .fn()
      .mockReturnValueOnce(delayed)
      .mockResolvedValue({ grants: [] });
    const execute = vi.fn();
    const view = render(
      <SpectatorHostControls gameId="old" execute={execute} load={load} />,
    );
    view.rerender(
      <SpectatorHostControls gameId="new" execute={execute} load={load} />,
    );
    await screen.findByText("No outstanding spectator grants.");
    await act(async () => finish({ grants: [invited] }));
    await waitFor(() =>
      expect(screen.queryByText("test-grant")).not.toBeInTheDocument(),
    );
  });
});
