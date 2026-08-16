import { Client as ColyseusClient, type Room } from "@colyseus/sdk";
import {
  acceptGameplayEvent,
  acceptManagementEvent,
  COMMAND_SCHEMA_VERSION,
  type CommandResult,
  type EventCursor,
  type GameState,
  type GameplayEvent,
  type GameplayCommandName,
  type HexCoordinate,
  type ManagementEvent,
  type Side,
} from "@gettysburg/game";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  claimInvitation,
  createGame,
  resumeGame,
  sendHostCommand,
  type SessionResponse,
} from "./api";
import { Board } from "./Board";
import { invitationUrl, type InvitationFragment } from "./invitation";
import { TabletopControls } from "./TabletopControls";

interface AppProps {
  readonly initialInvitation?: InvitationFragment | null;
}

interface ActiveGame extends SessionResponse {
  readonly invitationUrl?: string;
}

type ConnectionStatus = "connected" | "connecting" | "disconnected";

const LAST_GAME_KEY = "gettysburg:last-game-id";
const GAME_PATH = /^\/game\/([0-9a-f-]{36})$/i;

function gameIdFromLocation(): string | null {
  return GAME_PATH.exec(window.location.pathname)?.[1] ?? null;
}

function humanSide(side: Side): string {
  return side === "union" ? "Union" : "Confederate";
}

function actionEntries(events: readonly GameplayEvent[]): string[] {
  return [...events]
    .reverse()
    .slice(0, 8)
    .map((event) => `v${event.state_version}: ${event.summary}`);
}

export function App({ initialInvitation = null }: AppProps) {
  const [activeGame, setActiveGame] = useState<ActiveGame | null>(null);
  const [actionLog, setActionLog] = useState<string[]>([]);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [pendingCommand, setPendingCommand] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [activeInvitationLookupId, setActiveInvitationLookupId] = useState<
    string | null
  >(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const roomReference = useRef<Room | null>(null);
  const eventCursorReference = useRef<EventCursor | null>(null);
  const requestedGameId = gameIdFromLocation();

  const enterGame = useCallback(
    (session: SessionResponse, shareUrl?: string) => {
      setActiveGame({
        ...session,
        ...(shareUrl ? { invitationUrl: shareUrl } : {}),
      });
      setActionLog(actionEntries(session.action_log));
      eventCursorReference.current = {
        event_sequence: session.state.event_sequence,
        state_version: session.state.version,
      };
      setCopyStatus(null);
      window.localStorage.setItem(LAST_GAME_KEY, session.game_id);
      window.history.replaceState(null, "", `/game/${session.game_id}`);
      setError(null);
    },
    [],
  );

  useEffect(() => {
    if (initialInvitation !== null || activeGame !== null) return;
    const gameId =
      gameIdFromLocation() ?? window.localStorage.getItem(LAST_GAME_KEY);
    if (gameId === null) return;

    let active = true;
    setIsBusy(true);
    resumeGame(gameId)
      .then((session) => {
        if (active) enterGame(session);
      })
      .catch(() => {
        if (window.localStorage.getItem(LAST_GAME_KEY) === gameId) {
          window.localStorage.removeItem(LAST_GAME_KEY);
        }
        if (active)
          setError("The saved game could not be resumed in this browser.");
      })
      .finally(() => {
        if (active) setIsBusy(false);
      });
    return () => {
      active = false;
    };
  }, [activeGame, enterGame, initialInvitation]);

  useEffect(() => {
    if (activeGame === null) return;
    let active = true;
    let connectedRoom: Room | undefined;
    eventCursorReference.current = {
      event_sequence: activeGame.state.event_sequence,
      state_version: activeGame.state.version,
    };
    setConnectionStatus("connecting");

    const refreshAuthoritativeState = async () => {
      try {
        const session = await resumeGame(activeGame.game_id);
        if (!active) return;
        eventCursorReference.current = {
          event_sequence: session.state.event_sequence,
          state_version: session.state.version,
        };
        setActionLog(actionEntries(session.action_log));
        setActiveGame((current) =>
          current === null ? current : { ...current, state: session.state },
        );
      } catch {
        if (active) {
          setError(
            "The authoritative state could not be refreshed. Reconnect to continue.",
          );
        }
      }
    };

    const connect = async () => {
      const client = new ColyseusClient(window.location.origin);
      connectedRoom = await client.joinOrCreate("game", {
        gameId: activeGame.game_id,
      });
      if (!active) {
        await connectedRoom.leave(true);
        return;
      }

      roomReference.current = connectedRoom;
      connectedRoom.onMessage<GameState>("snapshot", (state) => {
        eventCursorReference.current = {
          event_sequence: state.event_sequence,
          state_version: state.version,
        };
        setActiveGame((current) =>
          current === null ? current : { ...current, state },
        );
        setPendingCommand(false);
      });
      connectedRoom.onMessage<CommandResult>("commandResult", (result) => {
        setPendingCommand(false);
        if (!result.ok) {
          setError(result.message);
          if (result.error === "stale_version") {
            void refreshAuthoritativeState();
          }
          return;
        }
        if (result.event.command_name === "surrenderSeat") {
          window.localStorage.removeItem(LAST_GAME_KEY);
          window.history.replaceState(null, "", "/");
          setActiveGame(null);
          void connectedRoom?.leave(true);
        }
        setError(null);
      });
      connectedRoom.onMessage<GameplayEvent>("gameplayEvent", (event) => {
        const cursor = eventCursorReference.current;
        if (cursor === null) return;
        const accepted = acceptGameplayEvent(cursor, event);
        if (!accepted.ok) {
          setError(
            "An event delivery gap was detected; restoring current state.",
          );
          void refreshAuthoritativeState();
          return;
        }
        eventCursorReference.current = accepted.cursor;
        setActionLog((entries) =>
          [`v${event.state_version}: ${event.summary}`, ...entries].slice(0, 8),
        );
      });
      connectedRoom.onMessage<ManagementEvent>("managementEvent", (event) => {
        const cursor = eventCursorReference.current;
        if (cursor === null) return;
        const accepted = acceptManagementEvent(cursor, event);
        if (!accepted.ok) {
          setError(
            "An event delivery gap was detected; restoring current state.",
          );
          void refreshAuthoritativeState();
          return;
        }
        eventCursorReference.current = accepted.cursor;
        setActionLog((entries) =>
          [`v${event.state_version}: ${event.summary}`, ...entries].slice(0, 8),
        );
      });
      connectedRoom.onError((_code, message) => {
        setError(message ?? "The multiplayer connection reported an error.");
      });
      connectedRoom.onLeave(() => {
        if (active) {
          roomReference.current = null;
          setConnectionStatus("disconnected");
        }
      });

      const refreshed = await resumeGame(activeGame.game_id);
      if (active) {
        eventCursorReference.current = {
          event_sequence: refreshed.state.event_sequence,
          state_version: refreshed.state.version,
        };
        setActionLog(actionEntries(refreshed.action_log));
        setActiveGame((current) =>
          current === null ? current : { ...current, state: refreshed.state },
        );
        setConnectionStatus("connected");
      }
    };

    void connect().catch((connectionError: unknown) => {
      if (active) {
        setConnectionStatus("disconnected");
        setError(
          connectionError instanceof Error
            ? connectionError.message
            : "Unable to connect to the game room.",
        );
      }
    });

    return () => {
      active = false;
      roomReference.current = null;
      if (connectedRoom !== undefined) void connectedRoom.leave(true);
    };
  }, [activeGame?.game_id, reconnectAttempt]);

  async function handleCreate(seat: Side) {
    setIsBusy(true);
    setError(null);
    try {
      const created = await createGame(seat);
      setActiveInvitationLookupId(created.invitation.lookup_id);
      enterGame(
        created,
        invitationUrl(
          window.location.origin,
          created.invitation.lookup_id,
          created.invitation.secret,
        ),
      );
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Game creation failed.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCopyInvitation() {
    if (activeGame?.invitationUrl === undefined) return;
    try {
      await navigator.clipboard.writeText(activeGame.invitationUrl);
      setCopyStatus("Invitation copied.");
    } catch {
      setCopyStatus(
        "Copy failed. Select and copy the invitation URL manually.",
      );
      setError(
        "Clipboard access failed; the invitation URL is still available.",
      );
    }
  }

  async function handleIssueInvitation() {
    if (activeGame === null) return;
    setIsBusy(true);
    setError(null);
    try {
      const result = await sendHostCommand(
        activeGame.game_id,
        activeGame.state.version,
        "issueInvitation",
        { seat: activeGame.seat === "union" ? "confederate" : "union" },
      );
      if (result.invitation === undefined) {
        throw new Error("The server did not return the new invitation secret.");
      }
      setActiveInvitationLookupId(result.invitation.lookup_id);
      setActiveGame((current) =>
        current === null
          ? current
          : {
              ...current,
              invitationUrl: invitationUrl(
                window.location.origin,
                result.invitation!.lookup_id,
                result.invitation!.secret,
              ),
            },
      );
      setCopyStatus("Replacement invitation ready.");
    } catch (issueError) {
      setError(
        issueError instanceof Error
          ? issueError.message
          : "Invitation creation failed.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRevokeInvitation() {
    if (activeGame === null || activeInvitationLookupId === null) return;
    setIsBusy(true);
    setError(null);
    try {
      await sendHostCommand(
        activeGame.game_id,
        activeGame.state.version,
        "revokeInvitation",
        { lookup_id: activeInvitationLookupId },
      );
      setActiveInvitationLookupId(null);
      setActiveGame((current) => {
        if (current === null) return current;
        return {
          action_log: current.action_log,
          game_id: current.game_id,
          is_host: current.is_host,
          seat: current.seat,
          state: current.state,
        };
      });
      setCopyStatus("Invitation revoked.");
    } catch (revokeError) {
      setError(
        revokeError instanceof Error
          ? revokeError.message
          : "Invitation revocation failed.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDeleteGame() {
    if (
      activeGame === null ||
      !window.confirm(
        "Delete this game? Both seats will be disconnected and the game will enter its recovery window.",
      )
    )
      return;
    setIsBusy(true);
    setError(null);
    try {
      await sendHostCommand(
        activeGame.game_id,
        activeGame.state.version,
        "deleteGame",
        { confirm: true },
      );
      window.localStorage.removeItem(LAST_GAME_KEY);
      window.history.replaceState(null, "", "/");
      setActiveGame(null);
      void roomReference.current?.leave(true);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Game deletion failed.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  function handleSurrenderSeat() {
    if (
      window.confirm(
        "Surrender this seat? Rejoining will require a new invitation or operator recovery.",
      )
    ) {
      sendCommand("surrenderSeat", {});
    }
  }

  async function handleClaim() {
    if (initialInvitation === null) return;
    setIsBusy(true);
    setError(null);
    try {
      enterGame(
        await claimInvitation(
          initialInvitation.lookupId,
          initialInvitation.secret,
        ),
      );
    } catch (claimError) {
      setError(
        claimError instanceof Error
          ? claimError.message
          : "Invitation claim failed.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  function sendCommand(
    commandName: GameplayCommandName,
    payload: Record<string, unknown>,
  ) {
    if (activeGame === null || roomReference.current === null) {
      setError("Reconnect before sending a tabletop command.");
      return;
    }
    setPendingCommand(true);
    setError(null);
    roomReference.current.send(commandName, {
      command_id: crypto.randomUUID(),
      command_name: commandName,
      expected_version: activeGame.state.version,
      game_id: activeGame.game_id,
      payload,
      schema: COMMAND_SCHEMA_VERSION,
    });
  }

  function handleMove(unitIds: readonly string[], destination: HexCoordinate) {
    if (unitIds.length === 1) {
      sendCommand("moveUnit", { destination, unit_id: unitIds[0] });
    } else {
      sendCommand("moveStack", { destination, unit_ids: unitIds });
    }
  }

  function handleRetreat(
    combatId: string,
    unitIds: readonly string[],
    path: readonly HexCoordinate[],
  ) {
    if (unitIds.length === 1) {
      sendCommand("retreatUnit", {
        combat_id: combatId,
        destination: path.at(-1),
        unit_id: unitIds[0],
      });
    } else {
      sendCommand("retreatStack", {
        combat_id: combatId,
        path,
        unit_ids: unitIds,
      });
    }
  }

  function handleAdvance(
    combatId: string,
    unitIds: readonly string[],
    destination: HexCoordinate | null,
  ) {
    sendCommand("advanceAfterCombat", {
      combat_id: combatId,
      decline: destination === null,
      ...(destination === null ? {} : { destination }),
      unit_ids: unitIds,
    });
  }

  if (activeGame === null) {
    return (
      <main className="lobby-shell">
        <section className="lobby-card" aria-labelledby="page-title">
          <p className="eyebrow">Phase 2 digital tabletop</p>
          <h1 id="page-title">Gettysburg</h1>
          <p className="summary">
            Create a private 24-turn game or claim the opposing seat. The
            server-authoritative state and action history are saved in
            PostgreSQL.
          </p>

          {initialInvitation === null && requestedGameId === null ? (
            <div className="seat-actions" aria-label="Choose a host seat">
              <button
                disabled={isBusy}
                onClick={() => void handleCreate("confederate")}
              >
                Host as Confederate
              </button>
              <button
                disabled={isBusy}
                onClick={() => void handleCreate("union")}
              >
                Host as Union
              </button>
            </div>
          ) : initialInvitation !== null ? (
            <div className="join-panel">
              <h2>Private invitation</h2>
              <p>
                The invitation secret was removed from browser history. Claim
                the open opposing seat once.
              </p>
              <button disabled={isBusy} onClick={() => void handleClaim()}>
                Claim seat
              </button>
            </div>
          ) : (
            <div className="join-panel">
              <h2>Seat invitation required</h2>
              <p>
                This browser does not own a seat in game{" "}
                <code>{requestedGameId}</code>. Open the complete one-time
                invitation copied from the host so both players join the same
                game.
              </p>
            </div>
          )}
          <p aria-live="polite" className="lobby-status">
            {isBusy ? "Contacting the authoritative server..." : error}
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="game-shell">
      <header className="game-header">
        <div>
          <p className="eyebrow">Private Phase 2 room</p>
          <h1>Gettysburg</h1>
        </div>
        <dl className="game-facts">
          <div>
            <dt>Seat</dt>
            <dd>{humanSide(activeGame.seat)}</dd>
          </div>
          <div>
            <dt>State</dt>
            <dd>v{activeGame.state.version}</dd>
          </div>
          <div>
            <dt>Turn</dt>
            <dd>{activeGame.state.turn}</dd>
          </div>
          <div>
            <dt>Phase</dt>
            <dd>{activeGame.state.phase}</dd>
          </div>
          <div>
            <dt>Connection</dt>
            <dd className={`connection-${connectionStatus}`}>
              {connectionStatus}
            </dd>
          </div>
        </dl>
        {connectionStatus === "disconnected" ? (
          <button onClick={() => setReconnectAttempt((attempt) => attempt + 1)}>
            Reconnect
          </button>
        ) : null}
      </header>

      {activeGame.invitationUrl === undefined ? null : (
        <section className="invitation-panel" aria-labelledby="invite-heading">
          <div>
            <p className="eyebrow">Opposing seat</p>
            <h2 id="invite-heading">Share this one-time invitation</h2>
            <p>
              Open it in a private window or a separate browser. This browser
              already owns the {humanSide(activeGame.seat)} seat.
            </p>
          </div>
          <input
            aria-label="One-time invitation URL"
            onFocus={(event) => event.currentTarget.select()}
            readOnly
            value={activeGame.invitationUrl}
          />
          <button onClick={() => void handleCopyInvitation()}>Copy</button>
          {activeGame.is_host && activeInvitationLookupId !== null ? (
            <button
              disabled={isBusy}
              onClick={() => void handleRevokeInvitation()}
            >
              Revoke
            </button>
          ) : null}
          <p aria-live="polite" className="copy-status">
            {copyStatus}
          </p>
        </section>
      )}

      <section className="game-lifecycle" aria-label="Game lifecycle">
        {activeGame.is_host ? (
          <>
            <button
              disabled={isBusy}
              onClick={() => void handleIssueInvitation()}
            >
              Issue opposing-seat invitation
            </button>
            <button disabled={isBusy} onClick={() => void handleDeleteGame()}>
              Delete game
            </button>
          </>
        ) : null}
        <button disabled={pendingCommand} onClick={handleSurrenderSeat}>
          Surrender seat
        </button>
      </section>

      <TabletopControls
        disabled={connectionStatus !== "connected" || pendingCommand}
        onCommand={sendCommand}
        seat={activeGame.seat}
        state={activeGame.state}
      />

      <Board
        disabled={connectionStatus !== "connected" || pendingCommand}
        error={error ?? undefined}
        onAdvance={handleAdvance}
        onMove={handleMove}
        onRetreat={handleRetreat}
        seat={activeGame.seat}
        state={activeGame.state}
      />

      <section className="action-log" aria-labelledby="log-heading">
        <div>
          <p className="eyebrow">Authoritative history</p>
          <h2 id="log-heading">Recent actions</h2>
        </div>
        {actionLog.length === 0 ? (
          <p>No accepted tabletop actions yet.</p>
        ) : (
          <ol>
            {actionLog.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ol>
        )}
      </section>
      <footer>
        Game <code>{activeGame.game_id}</code> ·{" "}
        {activeGame.state.content_revision} · restart-safe PostgreSQL
        persistence
      </footer>
    </main>
  );
}
