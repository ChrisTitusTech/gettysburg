import { describe, expect, it, vi } from "vitest";

import {
  consumeInvitationFragment,
  consumeSecretGrantFragment,
  invitationUrl,
} from "./invitation";

describe("invitation URLs", () => {
  it("scrubs a valid bearer fragment synchronously", () => {
    const replaceState = vi.fn();
    const result = consumeInvitationFragment(
      {
        hash: `#${"a".repeat(43)}`,
        pathname: "/join/11111111-1111-4111-8111-111111111111",
      } as Location,
      { replaceState } as unknown as History,
    );

    expect(result).toEqual({
      lookupId: "11111111-1111-4111-8111-111111111111",
      secret: "a".repeat(43),
    });
    expect(replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/join/11111111-1111-4111-8111-111111111111",
    );
  });

  it("keeps the secret out of path and query", () => {
    const secret = "b".repeat(43);
    const url = new URL(
      invitationUrl(
        "https://gettysburg.example",
        "11111111-1111-4111-8111-111111111111",
        secret,
      ),
    );

    expect(url.pathname).toBe("/join/11111111-1111-4111-8111-111111111111");
    expect(url.search).toBe("");
    expect(url.hash).toBe(`#${secret}`);
    expect(`${url.pathname}${url.search}`).not.toContain(secret);
  });

  it("does not consume a malformed fragment", () => {
    const replaceState = vi.fn();
    expect(
      consumeInvitationFragment(
        { hash: "#short", pathname: "/join/not-a-lookup" } as Location,
        { replaceState } as unknown as History,
      ),
    ).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it.each([
    ["/recovery/11111111-1111-4111-8111-111111111111", "seat-recovery"],
    ["/host-recovery/11111111-1111-4111-8111-111111111111", "host-recovery"],
  ] as const)("consumes and scrubs %s", (pathname, kind) => {
    const replaceState = vi.fn();
    expect(
      consumeSecretGrantFragment(
        { hash: `#${"c".repeat(43)}`, pathname } as Location,
        { replaceState } as unknown as History,
      ),
    ).toEqual({
      kind,
      lookupId: "11111111-1111-4111-8111-111111111111",
      secret: "c".repeat(43),
    });
    expect(replaceState).toHaveBeenCalledWith(null, "", pathname);
  });

  it("does not consume a recovery fragment through the invitation-only parser", () => {
    const replaceState = vi.fn();
    expect(
      consumeInvitationFragment(
        {
          hash: `#${"d".repeat(43)}`,
          pathname: "/recovery/11111111-1111-4111-8111-111111111111",
        } as Location,
        { replaceState } as unknown as History,
      ),
    ).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("classifies an uppercase join route as an invitation", () => {
    const replaceState = vi.fn();
    expect(
      consumeSecretGrantFragment(
        {
          hash: `#${"e".repeat(43)}`,
          pathname: "/JOIN/11111111-1111-4111-8111-111111111111",
        } as Location,
        { replaceState } as unknown as History,
      ),
    ).toMatchObject({ kind: "invitation" });
  });
});
