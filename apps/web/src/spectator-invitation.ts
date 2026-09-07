import type { InvitationFragment } from "./invitation";

export function consumeSpectatorInvitationFragment(
  location: Pick<Location, "hash" | "pathname">,
  history: Pick<History, "replaceState">,
): InvitationFragment | null {
  const match = /^\/observe\/join\/([0-9a-f-]{36})$/i.exec(location.pathname);
  if (!match?.[1]) return null;
  const secret = location.hash.replace(/^#/, "");
  if (location.hash) history.replaceState(null, "", location.pathname);
  return /^[A-Za-z0-9_-]{43}$/.test(secret)
    ? { lookupId: match[1], secret }
    : null;
}

export function spectatorGameId(pathname: string): string | null {
  return /^\/observe\/game\/([0-9a-f-]{36})$/i.exec(pathname)?.[1] ?? null;
}
