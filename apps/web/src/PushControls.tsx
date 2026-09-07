import { useEffect, useRef, useState } from "react";
import {
  getPushConfig,
  getPushStatus,
  removePushSubscription,
  setPushSubscription,
  type PushConfig,
  type PushStatus,
} from "./api";
import {
  pushSupportProblem,
  PushSetupError,
  subscribeThisBrowser,
} from "./browser-push";

export function PushControls({ gameId }: { readonly gameId: string }) {
  const [config, setConfig] = useState<PushConfig | null>(null);
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [message, setMessage] = useState("Checking notification settings...");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const lifetime = useRef<AbortController | null>(null);
  const operation = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    setConfig(null);
    setStatus(null);
    setMessage("Checking notification settings...");
    void Promise.all([
      getPushConfig(controller.signal),
      getPushStatus(gameId, controller.signal),
    ])
      .then(([nextConfig, nextStatus]) => {
        if (controller.signal.aborted) return;
        setConfig(nextConfig);
        setStatus(nextStatus);
        setMessage("");
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setMessage(
            "Could not check notification settings. Reconnect and retry.",
          );
      });
    return () => controller.abort();
  }, [gameId, attempt]);

  async function change(enable: boolean) {
    const controller = lifetime.current;
    if (operation.current || controller === null || controller.signal.aborted)
      return;
    if (enable && !config?.enabled) return;
    operation.current = true;
    setBusy(true);
    setMessage("");
    try {
      const nextStatus =
        enable && config?.enabled
          ? await setPushSubscription(
              gameId,
              await subscribeThisBrowser(
                config.applicationServerKey,
                controller.signal,
              ),
              controller.signal,
            )
          : await removePushSubscription(gameId, controller.signal);
      if (!controller.signal.aborted) {
        setStatus(nextStatus);
        setMessage(
          enable
            ? "Notifications enabled in this browser for this seat."
            : "Notifications turned off for this seat.",
        );
      }
    } catch (error) {
      if (!controller.signal.aborted)
        setMessage(
          error instanceof PushSetupError
            ? error.message
            : "Could not update notifications. Check your connection and try again; the server setting may need refreshing.",
        );
    } finally {
      operation.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const problem = pushSupportProblem();
  return (
    <section className="invitation-panel" aria-labelledby="push-heading">
      <div>
        <h2 id="push-heading">Turn notifications</h2>
        <p>
          Opt in to browser push when your seat has a new decision. Delivery can
          be delayed; open the game to confirm.
        </p>
        <p>
          {status?.enabled
            ? "Enabled for this seat, possibly in another browser. Enabling here replaces that browser."
            : "Off until you choose to enable it."}
        </p>
        {config !== null && !config.enabled ? (
          <p>Push is not enabled on this server yet.</p>
        ) : null}
        {problem === null ? null : <p>{problem}</p>}
        <p role="status">{message}</p>
      </div>
      <div className="button-row">
        <button
          disabled={
            busy || !config?.enabled || status === null || problem !== null
          }
          onClick={() => void change(true)}
        >
          Enable in this browser
        </button>
        <button
          disabled={busy || !status?.enabled}
          onClick={() => void change(false)}
        >
          Turn off for this seat
        </button>
        <button
          disabled={busy}
          onClick={() => setAttempt((value) => value + 1)}
        >
          Refresh notifications
        </button>
      </div>
    </section>
  );
}
