import { Client as ColyseusClient, type Room } from "@colyseus/sdk";
import type { ActionEvent, GameState } from "@gettysburg/game";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiResponseError,
  claimSpectatorInvitation,
  getReplay,
  resumeSpectator,
  type SpectatorResponse,
} from "./api";
import { Board } from "./Board";
import { ReplayViewer } from "./ReplayViewer";
import type { InvitationFragment } from "./invitation";
import { leaveOpenRoom } from "./room-lifecycle";
import { spectatorGameId } from "./spectator-invitation";

function recentActions(
  ...logs: readonly (readonly ActionEvent[])[]
): ActionEvent[] {
  return [
    ...new Map(
      logs.flat().map((event) => [event.event_sequence, event]),
    ).values(),
  ]
    .sort((a, b) => a.event_sequence - b.event_sequence)
    .slice(-8);
}

export function SpectatorApp({
  initialGrant = null,
}: {
  readonly initialGrant?: InvitationFragment | null;
}) {
  const [grant, setGrant] = useState(initialGrant);
  const [gameId, setGameId] = useState(() =>
    spectatorGameId(window.location.pathname),
  );
  const [view, setView] = useState<SpectatorResponse | null>(null);
  const [status, setStatus] = useState<
    "connected" | "connecting" | "disconnected"
  >("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [retry, setRetry] = useState(0);
  const [replay, setReplay] = useState(false);
  const claimId = useRef(crypto.randomUUID());
  const mounted = useRef(true);
  const replayAccessLost = useRef<(() => void) | null>(null);
  const loadReplay = useCallback(
    async (...args: Parameters<typeof getReplay>) => {
      try {
        return await getReplay(...args);
      } catch (failure) {
        if (
          !args[2]?.aborted &&
          failure instanceof ApiResponseError &&
          [401, 403, 404, 410].includes(failure.status)
        )
          replayAccessLost.current?.();
        throw failure;
      }
    },
    [],
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function claim() {
    if (!grant) return;
    setClaiming(true);
    setError(null);
    try {
      const result = await claimSpectatorInvitation(
        grant.lookupId,
        grant.secret,
        claimId.current,
      );
      if (!mounted.current) return;
      setGrant(null);
      setGameId(result.game_id);
      window.history.replaceState(null, "", `/observe/game/${result.game_id}`);
    } catch {
      if (mounted.current)
        setError(
          "Spectator invitation could not be claimed. Retry, or ask the host for a fresh link.",
        );
    } finally {
      if (mounted.current) setClaiming(false);
    }
  }

  useEffect(() => {
    if (!gameId) return;
    let active = true;
    let serverClosing = false;
    let room: Room | undefined;
    let sequence = -1;
    let snapshotSequence = -1;
    const controller = new AbortController();
    setView(null);
    setReplay(false);
    setError(null);
    setStatus("connecting");
    const disconnect = (message: string) => {
      if (!active) return;
      active = false;
      controller.abort();
      setView(null);
      setReplay(false);
      setStatus("disconnected");
      setError(message);
    };
    const accessLost = () => {
      disconnect("Spectator access ended or the game was deleted.");
      if (room && !serverClosing) void leaveOpenRoom(room);
    };
    replayAccessLost.current = accessLost;
    const refresh = async () => {
      const result = await resumeSpectator(gameId, controller.signal);
      if (!active) return;
      if (result.game_id !== gameId || result.state.game_id !== gameId)
        throw new Error("Mismatched observer state");
      const fresh = result.state.event_sequence >= snapshotSequence;
      sequence = Math.max(sequence, result.state.event_sequence);
      if (fresh) snapshotSequence = result.state.event_sequence;
      setView((current) => ({
        ...(fresh || !current ? result : current),
        state:
          fresh || !current
            ? { ...result.state, event_sequence: sequence }
            : current.state,
        // A newer socket snapshot must not discard missing history returned by
        // an older HTTP read. Reconcile the log independently of board state.
        action_log: recentActions(current?.action_log ?? [], result.action_log),
      }));
    };
    const recoverGap = () => {
      void refresh().catch(() => {
        disconnect(
          "Current spectator state could not be verified. Reconnect to try again.",
        );
        if (room) void leaveOpenRoom(room);
      });
    };
    const connect = async () => {
      await refresh();
      if (!active) return;
      room = await new ColyseusClient(window.location.origin).joinOrCreate(
        "game",
        { gameId, spectator: true },
      );
      if (!active) {
        void leaveOpenRoom(room);
        return;
      }
      // This screen requires a fresh authorization on explicit reconnect.
      // Otherwise the SDK retains the old screen while retrying a dropped socket.
      room.reconnection.enabled = false;
      room.onLeave((code) => {
        serverClosing = true;
        disconnect(
          code === 4001
            ? "Spectator access ended or the game was deleted."
            : code === 4000
              ? "This observer connection was replaced by another tab."
              : "Spectator connection lost. Reconnect to load current state.",
        );
      });
      room.onError(() => {
        disconnect("Spectator connection failed. Reconnect to try again.");
        if (room) void leaveOpenRoom(room);
      });
      room.onMessage<GameState>("snapshot", (state) => {
        if (
          !active ||
          state.game_id !== gameId ||
          state.event_sequence < snapshotSequence
        )
          return;
        if (state.event_sequence > sequence) recoverGap();
        snapshotSequence = state.event_sequence;
        sequence = Math.max(sequence, state.event_sequence);
        const reconciled = { ...state, event_sequence: sequence };
        setView((current) =>
          current
            ? { ...current, state: reconciled }
            : { game_id: gameId, state: reconciled, action_log: [] },
        );
      });
      const event = (event: ActionEvent) => {
        if (!active) return;
        if (event.event_sequence > sequence + 1) recoverGap();
        sequence = Math.max(sequence, event.event_sequence);
        setView((current) =>
          current
            ? {
                ...current,
                // Management/audit events advance chronology without gameplay state.
                state:
                  event.kind === "gameplay" ||
                  event.event_sequence <= current.state.event_sequence
                    ? current.state
                    : {
                        ...current.state,
                        event_sequence: event.event_sequence,
                      },
                action_log: recentActions(current.action_log, [event]),
              }
            : current,
        );
      };
      room.onMessage<ActionEvent>("gameplayEvent", event);
      room.onMessage<ActionEvent>("managementEvent", event);
      room.onMessage<ActionEvent>("auditEvent", event);
      // Covers an initial socket snapshot sent before handlers were registered.
      await refresh();
      if (active) setStatus("connected");
    };
    void connect().catch(() => {
      disconnect(
        "Current spectator access is unavailable. Reconnect, or ask the host for a new invitation.",
      );
      if (room && !serverClosing) void leaveOpenRoom(room);
    });
    return () => {
      active = false;
      controller.abort();
      if (replayAccessLost.current === accessLost)
        replayAccessLost.current = null;
      if (room && !serverClosing) void leaveOpenRoom(room);
    };
  }, [gameId, retry]);

  return (
    <main className="game-shell">
      <header className="game-header">
        <div>
          <p className="eyebrow">Private read-only observer</p>
          <h1>Gettysburg</h1>
        </div>
        <p role="status">{status}</p>
      </header>
      {error ? <p role="alert">{error}</p> : null}
      {grant ? (
        <section className="join-panel">
          <h2>Spectator invitation</h2>
          <p>
            Observe both sides without occupying a seat or sending game
            commands.
          </p>
          <button disabled={claiming} onClick={() => void claim()}>
            Claim spectator access
          </button>
        </section>
      ) : null}
      {!grant && !gameId ? (
        <section className="join-panel">
          <h2>Spectator invitation required</h2>
          <p>
            Open the complete private link from the host. After claiming,
            bookmark your observer game URL to resume in this browser.
          </p>
        </section>
      ) : null}
      {gameId && status === "disconnected" ? (
        <button onClick={() => setRetry((value) => value + 1)}>
          Reconnect spectator
        </button>
      ) : null}
      {view ? (
        <>
          <section
            className="replay-controls"
            aria-label="Observer game status"
          >
            <p>
              Turn {view.state.turn}, {view.state.active_side},{" "}
              {view.state.phase}. State v{view.state.version}. Event{" "}
              {view.state.event_sequence}.
            </p>
            <p>
              Union {view.state.victory.union}; Confederate{" "}
              {view.state.victory.confederate}. {view.state.victory.status}.
            </p>
            <button onClick={() => setReplay((value) => !value)}>
              {replay ? "Return to live observation" : "View replay"}
            </button>
          </section>
          {replay ? (
            <ReplayViewer
              key={gameId}
              gameId={view.game_id}
              latestSequence={view.state.event_sequence}
              load={loadReplay}
            />
          ) : (
            <Board
              readOnly
              readOnlyMode="live"
              seat="union"
              state={view.state}
              onMove={() => undefined}
            />
          )}
          <section className="action-log" aria-label="Recent observed actions">
            <h2>Recent actions</h2>
            <ol>
              {view.action_log
                .slice(-8)
                .reverse()
                .map((event) => (
                  <li key={event.event_sequence}>{event.summary}</li>
                ))}
            </ol>
          </section>
        </>
      ) : null}
      <p>
        <a className="observer-lobby-link" href="/">
          Return to player lobby
        </a>
      </p>
    </main>
  );
}
