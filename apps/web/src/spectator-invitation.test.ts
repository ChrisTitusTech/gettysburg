import { describe, expect, it, vi } from "vitest";
import {
  consumeSpectatorInvitationFragment,
  spectatorGameId,
} from "./spectator-invitation";
const id = "11111111-1111-4111-8111-111111111111";
describe("observer-only routes", () => {
  it("scrubs a valid bearer fragment before rendering and recognizes only observer resume URLs", () => {
    const history = { replaceState: vi.fn() };
    expect(
      consumeSpectatorInvitationFragment(
        { pathname: `/observe/join/${id}`, hash: `#${"s".repeat(43)}` },
        history,
      ),
    ).toEqual({ lookupId: id, secret: "s".repeat(43) });
    expect(history.replaceState).toHaveBeenCalledWith(
      null,
      "",
      `/observe/join/${id}`,
    );
    expect(spectatorGameId(`/observe/game/${id}`)).toBe(id);
    expect(spectatorGameId(`/game/${id}`)).toBeNull();
  });
  it("scrubs malformed observer secrets without consuming player invitations", () => {
    const history = { replaceState: vi.fn() };
    expect(
      consumeSpectatorInvitationFragment(
        { pathname: `/observe/join/${id}`, hash: "#bad" },
        history,
      ),
    ).toBeNull();
    expect(history.replaceState).toHaveBeenCalledOnce();
    expect(
      consumeSpectatorInvitationFragment(
        { pathname: `/join/${id}`, hash: `#${"s".repeat(43)}` },
        history,
      ),
    ).toBeNull();
    expect(history.replaceState).toHaveBeenCalledOnce();
  });
});
