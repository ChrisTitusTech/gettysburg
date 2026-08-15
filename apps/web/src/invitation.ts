export interface InvitationFragment {
  readonly lookupId: string;
  readonly secret: string;
}

const JOIN_PATH = /^\/join\/([0-9a-f-]{36})$/i;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function consumeInvitationFragment(
  location: Pick<Location, "hash" | "pathname">,
  history: Pick<History, "replaceState">,
): InvitationFragment | null {
  const pathMatch = JOIN_PATH.exec(location.pathname);
  const secret = location.hash.startsWith("#")
    ? location.hash.slice(1)
    : location.hash;
  if (pathMatch?.[1] === undefined || !SECRET_PATTERN.test(secret)) {
    return null;
  }

  history.replaceState(null, "", location.pathname);
  return { lookupId: pathMatch[1], secret };
}

export function invitationUrl(
  origin: string,
  lookupId: string,
  secret: string,
): string {
  return `${origin}/join/${lookupId}#${secret}`;
}
