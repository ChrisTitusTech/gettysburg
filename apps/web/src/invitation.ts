export interface SecretGrantFragment {
  readonly kind: "host-recovery" | "invitation" | "seat-recovery";
  readonly lookupId: string;
  readonly secret: string;
}
export type InvitationFragment = Omit<SecretGrantFragment, "kind">;

const GRANT_PATH = /^\/(join|recovery|host-recovery)\/([0-9a-f-]{36})$/i;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const INVITATION_PATH = /^\/join\/[0-9a-f-]{36}$/i;

export function consumeSecretGrantFragment(
  location: Pick<Location, "hash" | "pathname">,
  history: Pick<History, "replaceState">,
): SecretGrantFragment | null {
  const pathMatch = GRANT_PATH.exec(location.pathname);
  const secret = location.hash.startsWith("#")
    ? location.hash.slice(1)
    : location.hash;
  if (pathMatch?.[2] === undefined || !SECRET_PATTERN.test(secret)) {
    return null;
  }

  history.replaceState(null, "", location.pathname);
  const route = pathMatch[1]?.toLowerCase();
  return {
    kind:
      route === "join"
        ? "invitation"
        : route === "recovery"
          ? "seat-recovery"
          : "host-recovery",
    lookupId: pathMatch[2],
    secret,
  };
}

export function consumeInvitationFragment(
  location: Pick<Location, "hash" | "pathname">,
  history: Pick<History, "replaceState">,
): InvitationFragment | null {
  if (!INVITATION_PATH.test(location.pathname)) return null;
  const grant = consumeSecretGrantFragment(location, history);
  return grant?.kind === "invitation"
    ? { lookupId: grant.lookupId, secret: grant.secret }
    : null;
}

export function invitationUrl(
  origin: string,
  lookupId: string,
  secret: string,
): string {
  return `${origin}/join/${lookupId}#${secret}`;
}
