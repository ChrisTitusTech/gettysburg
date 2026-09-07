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
  it("creates a fragment-only private link, copies it, and hides it after claim refresh", async () => {
    const user = userEvent.setup();
    const invitation = { lookup_id: "test-grant", secret: "A".repeat(43) };
    const load = vi.fn().mockResolvedValue({ grants: [invited] });
    const execute = vi.fn().mockResolvedValue({ ok: true, invitation });
    const clipboard = vi.spyOn(navigator.clipboard, "writeText");
    render(
      <SpectatorHostControls gameId="game" execute={execute} load={load} />,
    );
    await screen.findByText("test-grant");
    await user.click(
      screen.getByRole("button", { name: "Create spectator link" }),
    );
    const url = `${window.location.origin}/observe/join/test-grant#${invitation.secret}`;
    expect(
      screen.getByLabelText("Private spectator invitation URL"),
    ).toHaveValue(url);
    expect(execute).toHaveBeenCalledWith(
      "spectator-issue",
      "issueSpectatorInvitation",
      {},
    );
    await user.click(
      screen.getByRole("button", { name: "Copy spectator link" }),
    );
    expect(clipboard).toHaveBeenCalledWith(url);
    expect(screen.getByText("Spectator link copied.")).toBeVisible();
    load.mockResolvedValue({ grants: [{ ...invited, status: "claimed" }] });
    await user.click(
      screen.getByRole("button", { name: "Refresh spectator grants" }),
    );
    expect(
      screen.queryByLabelText("Private spectator invitation URL"),
    ).not.toBeInTheDocument();
  });
  it("reuses the issuance operation on failure and preserves the created link if metadata refresh fails", async () => {
    const user = userEvent.setup();
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValue({
        ok: true,
        invitation: { lookup_id: invited.lookup_id, secret: "A".repeat(43) },
      });
    const load = vi
      .fn()
      .mockResolvedValueOnce({ grants: [] })
      .mockRejectedValue(new Error("metadata unavailable"));
    render(
      <SpectatorHostControls gameId="game" execute={execute} load={load} />,
    );
    await screen.findByText("No outstanding spectator grants.");
    const create = screen.getByRole("button", {
      name: "Create spectator link",
    });
    await user.click(create);
    expect(screen.getByRole("alert")).toHaveTextContent("could not be created");
    await user.click(create);
    expect(execute.mock.calls[0]).toEqual(execute.mock.calls[1]);
    expect(screen.getByRole("alert")).toHaveTextContent("Link created");
    expect(
      screen.getByLabelText("Private spectator invitation URL"),
    ).toBeVisible();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(
      new Error("denied"),
    );
    await user.click(
      screen.getByRole("button", { name: "Copy spectator link" }),
    );
    expect(screen.getByText(/Clipboard unavailable/)).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Hide spectator link" }),
    );
    expect(
      screen.queryByLabelText("Private spectator invitation URL"),
    ).not.toBeInTheDocument();
    expect(execute).toHaveBeenCalledTimes(2);
  });
  it("discards an issuance response from a previous game", async () => {
    const user = userEvent.setup();
    let finish!: (value: unknown) => void;
    const execute = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const load = vi.fn().mockResolvedValue({ grants: [] });
    const view = render(
      <SpectatorHostControls gameId="old" execute={execute} load={load} />,
    );
    await screen.findByText("No outstanding spectator grants.");
    await user.click(
      screen.getByRole("button", { name: "Create spectator link" }),
    );
    view.rerender(
      <SpectatorHostControls gameId="new" execute={execute} load={load} />,
    );
    await act(async () =>
      finish({
        ok: true,
        invitation: { lookup_id: "old", secret: "A".repeat(43) },
      }),
    );
    expect(
      screen.queryByLabelText("Private spectator invitation URL"),
    ).not.toBeInTheDocument();
  });
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
