import { useEffect, useRef, useState } from "react";
import {
  getSpectatorGrants,
  type HostCommandSuccess,
  type SpectatorGrant,
} from "./api";

type SpectatorCommand =
  | "issueSpectatorInvitation"
  | "revokeSpectatorInvitation"
  | "revokeSpectatorAccess";

export function SpectatorHostControls({
  gameId,
  execute,
  load = getSpectatorGrants,
}: {
  readonly gameId: string;
  readonly execute: (
    operationKey: string,
    name: SpectatorCommand,
    payload: Record<string, unknown>,
  ) => Promise<HostCommandSuccess>;
  readonly load?: typeof getSpectatorGrants;
}) {
  const [grants, setGrants] = useState<readonly SpectatorGrant[] | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<{ lookupId: string; url: string } | null>(
    null,
  );
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const lifetime = useRef(0);
  useEffect(() => {
    const generation = ++lifetime.current;
    const controller = new AbortController();
    setGrants(null);
    setBusy(true);
    setError(null);
    setLink(null);
    setCopyStatus(null);
    void load(gameId, controller.signal)
      .then((result) => {
        if (generation === lifetime.current) setGrants(result.grants);
      })
      .catch(() => {
        if (generation === lifetime.current)
          setError(
            "Spectator grants could not be loaded. Refresh to try again.",
          );
      })
      .finally(() => {
        if (generation === lifetime.current) setBusy(false);
      });
    return () => {
      lifetime.current++;
      controller.abort();
    };
  }, [gameId, load]);

  function applyGrants(updated: readonly SpectatorGrant[]) {
    setGrants(updated);
    setLink((current) =>
      current &&
      updated.some(
        (grant) =>
          grant.lookup_id === current.lookupId && grant.status === "invited",
      )
        ? current
        : null,
    );
    setCopyStatus(null);
  }

  async function createLink() {
    const generation = lifetime.current;
    setBusy(true);
    setError(null);
    setCopyStatus(null);
    try {
      const result = await execute(
        "spectator-issue",
        "issueSpectatorInvitation",
        {},
      );
      if (generation !== lifetime.current) return;
      if (!result.invitation) throw new Error("Missing private invitation");
      setLink({
        lookupId: result.invitation.lookup_id,
        url: `${window.location.origin}/observe/join/${result.invitation.lookup_id}#${result.invitation.secret}`,
      });
      try {
        const updated = await load(gameId);
        if (generation === lifetime.current) applyGrants(updated.grants);
      } catch {
        if (generation === lifetime.current)
          setError(
            "Link created, but the grant list could not be refreshed. Refresh to check access.",
          );
      }
    } catch {
      if (generation === lifetime.current)
        setError(
          "Spectator link could not be created. Retry; the same pending request will be reused when possible.",
        );
    } finally {
      if (generation === lifetime.current) setBusy(false);
    }
  }

  async function copyLink() {
    if (!link) return;
    const generation = lifetime.current;
    try {
      await navigator.clipboard.writeText(link.url);
      if (generation === lifetime.current)
        setCopyStatus("Spectator link copied.");
    } catch {
      if (generation === lifetime.current)
        setCopyStatus(
          "Clipboard unavailable. Select and copy the private URL below.",
        );
    }
  }

  async function refreshOrRevoke(lookupId?: string) {
    const generation = lifetime.current;
    setBusy(true);
    setError(null);
    try {
      const current = await load(gameId);
      if (generation !== lifetime.current) return;
      applyGrants(current.grants);
      const target = current.grants.find(
        (grant) => grant.lookup_id === lookupId,
      );
      if (target !== undefined) {
        // Claims do not advance the event cursor. Fetch current status before
        // choosing the audited command, and let the server reject any race.
        await execute(
          `spectator-revoke:${target.lookup_id}`,
          target.status === "claimed"
            ? "revokeSpectatorAccess"
            : "revokeSpectatorInvitation",
          { lookup_id: target.lookup_id },
        );
        if (generation !== lifetime.current) return;
        const updated = await load(gameId);
        if (generation === lifetime.current) applyGrants(updated.grants);
      }
    } catch {
      if (generation === lifetime.current)
        setError(
          "Spectator access could not be refreshed or revoked. Refresh and retry; access may have changed.",
        );
    } finally {
      if (generation === lifetime.current) setBusy(false);
    }
  }

  return (
    <section
      className="replay-controls"
      aria-label="Spectator access management"
    >
      <h2>Spectator access</h2>
      <p>
        Private read-only grants are separate from player seats. Claimed does
        not mean currently connected. Refresh to see newly claimed invitations.
      </p>
      <button disabled={busy} onClick={() => void refreshOrRevoke()}>
        Refresh spectator grants
      </button>
      <button disabled={busy} onClick={() => void createLink()}>
        Create spectator link
      </button>
      <p>
        Share privately with one observer. Links expire after 24 hours. Up to
        eight outstanding grants are allowed.
      </p>
      {link ? (
        <div>
          <label>
            Private spectator invitation URL
            <input
              readOnly
              value={link.url}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <button disabled={busy} onClick={() => void copyLink()}>
            Copy spectator link
          </button>
          <button
            onClick={() => {
              setLink(null);
              setCopyStatus(null);
            }}
          >
            Hide spectator link
          </button>
          <p>
            The secret is shown only in this browser until hidden, replaced, or
            reloaded. Hidden links remain valid until claimed, expired, or
            revoked.
          </p>
        </div>
      ) : null}
      {copyStatus ? <p role="status">{copyStatus}</p> : null}
      {busy ? <p role="status">Checking spectator access...</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {grants?.length === 0 ? <p>No outstanding spectator grants.</p> : null}
      {grants && grants.length > 0 ? (
        <ul>
          {grants.map((grant) => (
            <li key={grant.lookup_id}>
              <code>{grant.lookup_id}</code> -{" "}
              {grant.status === "claimed"
                ? "Claimed; access remains revocable"
                : `Invited; link expires ${new Date(grant.invitation_expires_at).toLocaleString()}`}{" "}
              <button
                disabled={busy}
                onClick={() => void refreshOrRevoke(grant.lookup_id)}
                aria-label={`Revoke spectator grant ${grant.lookup_id}`}
              >
                Revoke spectator grant
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
