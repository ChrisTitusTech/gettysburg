import { Client as ColyseusClient, type Room } from "@colyseus/sdk";
import {
  acceptGameplayEvent,
  acceptManagementEvent,
  COMMAND_SCHEMA_VERSION,
  type CommandResult,
  type AuditEvent,
  type ActionEvent,
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
  ApiResponseError,
  claimInvitation,
  claimHostRecovery,
  claimSeatRecovery,
  createGame,
  isDefinitiveResumeError,
  isRetryableApiError,
  resumeGame,
  sendHostCommand,
  type SessionResponse,
} from "./api";
import { Board } from "./Board";
import { invitationUrl, type SecretGrantFragment } from "./invitation";
import { TabletopControls } from "./TabletopControls";

interface AppProps {
  readonly initialGrant?: SecretGrantFragment | null;
  readonly initialInvitation?: Omit<SecretGrantFragment, "kind"> | null;
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

function createBrowserCredential(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function actionEntries(events: readonly ActionEvent[]): string[] {
  return [...events]
    .reverse()
    .slice(0, 8)
    .map((event) => `v${event.state_version}: ${event.summary}`);
}

function withoutInvitationUrl(game: ActiveGame): ActiveGame {
  return {
    action_log: game.action_log,
    active_invitations: game.active_invitations,
    game_id: game.game_id,
    is_host: game.is_host,
    seat: game.seat,
    state: game.state,
  };
}

export function App({
  initialGrant: suppliedGrant = null,
  initialInvitation = null,
}: AppProps) {
  const initialGrant =
    suppliedGrant ??
    (initialInvitation === null
      ? null
      : { ...initialInvitation, kind: "invitation" as const });
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
  const [activeInvitations, setActiveInvitations] = useState<
    SessionResponse["active_invitations"]
  >([]);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const roomReference = useRef<Room | null>(null);
  const eventCursorReference = useRef<EventCursor | null>(null);
  const hostCommandIdsReference = useRef(new Map<string, string>());
  const creationIdReference = useRef(crypto.randomUUID());
  const creationCredentialReference = useRef(createBrowserCredential());
  const invitationClaimIdReference = useRef(crypto.randomUUID());
  const recoveryClaimIdReference = useRef(crypto.randomUUID());
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
      setActiveInvitationLookupId(
        session.active_invitations[0]?.lookup_id ?? null,
      );
      setActiveInvitations(session.active_invitations);
      window.localStorage.setItem(LAST_GAME_KEY, session.game_id);
      window.history.replaceState(null, "", `/game/${session.game_id}`);
      setError(null);
    },
    [],
  );

  useEffect(() => {
    if (initialGrant !== null || activeGame !== null) return;
    const gameId =
      gameIdFromLocation() ?? window.localStorage.getItem(LAST_GAME_KEY);
    if (gameId === null) return;

    let active = true;
    setIsBusy(true);
    resumeGame(gameId)
      .then((session) => {
        if (active) enterGame(session);
      })
      .catch((resumeError: unknown) => {
        if (
          isDefinitiveResumeError(resumeError) &&
          window.localStorage.getItem(LAST_GAME_KEY) === gameId
        ) {
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
  }, [activeGame, enterGame, initialGrant]);

  useEffect(() => {
    if (activeGame === null || activeGame.seat === null) {
      roomReference.current = null;
      setConnectionStatus("disconnected");
      return;
    }
    let active = true;
    let connectedRoom: Room | undefined;
    let serverEvicting = false;
    eventCursorReference.current = {
      event_sequence: activeGame.state.event_sequence,
      state_version: activeGame.state.version,
    };
    setConnectionStatus("connecting");

    const refreshAuthoritativeState = async () => {
      try {
        const session = await resumeGame(activeGame.game_id);
        if (!active) return;
        const cursor = eventCursorReference.current;
        if (
          cursor !== null &&
          session.state.event_sequence < cursor.event_sequence
        ) {
          return;
        }
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
          serverEvicting = true;
          if (activeGame.is_host) {
            void resumeGame(activeGame.game_id)
              .then((session) => {
                if (active) enterGame(session);
              })
              .catch((resumeError: unknown) => {
                if (!active) return;
                setError(
                  resumeError instanceof Error
                    ? resumeError.message
                    : "Host controls could not be refreshed. Reconnect to continue.",
                );
              });
          } else {
            window.localStorage.removeItem(LAST_GAME_KEY);
            window.history.replaceState(null, "", "/");
            setActiveGame(null);
          }
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
      connectedRoom.onMessage<AuditEvent>("auditEvent", (event) => {
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
        const cursor = eventCursorReference.current;
        if (
          cursor !== null &&
          refreshed.state.event_sequence < cursor.event_sequence
        ) {
          setConnectionStatus("connected");
          return;
        }
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
      if (connectedRoom !== undefined && !serverEvicting) {
        void connectedRoom.leave(true);
      }
    };
  }, [activeGame?.game_id, activeGame?.seat, enterGame, reconnectAttempt]);

  async function executeHostCommand(
    operationKey: string,
    commandName: Parameters<typeof sendHostCommand>[2],
    payload: Record<string, unknown>,
  ) {
    if (activeGame === null) throw new Error("No active game.");
    const previousCommandId = hostCommandIdsReference.current.get(operationKey);
    const commandId = previousCommandId ?? crypto.randomUUID();
    hostCommandIdsReference.current.set(operationKey, commandId);
    try {
      const applySession = (session: SessionResponse) => {
        eventCursorReference.current = {
          event_sequence: session.state.event_sequence,
          state_version: session.state.version,
        };
        setActionLog(actionEntries(session.action_log));
        setActiveInvitations(session.active_invitations);
        setActiveInvitationLookupId(
          session.active_invitations[0]?.lookup_id ?? null,
        );
        setActiveGame((current) =>
          current === null ? current : { ...current, ...session },
        );
      };
      let currentSession: SessionResponse = activeGame;
      const terminalDeleteRetry =
        commandName === "deleteGame" && previousCommandId !== undefined;
      if (!terminalDeleteRetry) {
        const refreshed = await resumeGame(activeGame.game_id);
        if (!refreshed.is_host) {
          throw new Error("Host authorization is no longer active.");
        }
        currentSession = refreshed;
        applySession(refreshed);
      }
      const result = await sendHostCommand(
        activeGame.game_id,
        currentSession.state.version,
        commandName,
        payload,
        commandId,
      );
      if (!result.ok) {
        throw new ApiResponseError(result.message, 409, result.error);
      }
      if (commandName !== "deleteGame") {
        const synchronized = await resumeGame(activeGame.game_id);
        if (!synchronized.is_host) {
          throw new Error("Host authorization is no longer active.");
        }
        applySession(synchronized);
      }
      hostCommandIdsReference.current.delete(operationKey);
      return result;
    } catch (commandError) {
      if (!isRetryableApiError(commandError)) {
        hostCommandIdsReference.current.delete(operationKey);
      }
      throw commandError;
    }
  }

  async function handleCreate(seat: Side) {
    setIsBusy(true);
    setError(null);
    try {
      const created = await createGame(
        seat,
        creationIdReference.current,
        creationCredentialReference.current,
      );
      creationIdReference.current = crypto.randomUUID();
      creationCredentialReference.current = createBrowserCredential();
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

  async function handleIssueInvitation(requestedSeat?: Side) {
    if (activeGame === null) return;
    setIsBusy(true);
    setError(null);
    try {
      const result = await executeHostCommand(
        `issueInvitation:${requestedSeat ?? (activeGame.seat === "union" ? "confederate" : "union")}`,
        "issueInvitation",
        {
          seat:
            requestedSeat ??
            (activeGame.seat === "union" ? "confederate" : "union"),
        },
      );
      const issuedInvitation = result.invitation;
      if (issuedInvitation === undefined) {
        throw new Error("The server did not return the new invitation secret.");
      }
      setActiveInvitationLookupId(issuedInvitation.lookup_id);
      const issuedSeat =
        requestedSeat ??
        (activeGame.seat === "union" ? "confederate" : "union");
      setActiveInvitations((current) => [
        ...current.filter(
          (invitation) => invitation.lookup_id !== issuedInvitation.lookup_id,
        ),
        { lookup_id: issuedInvitation.lookup_id, seat: issuedSeat },
      ]);
      setActiveGame((current) =>
        current === null
          ? current
          : {
              ...current,
              active_invitations: [
                ...current.active_invitations.filter(
                  (invitation) =>
                    invitation.lookup_id !== issuedInvitation.lookup_id,
                ),
                { lookup_id: issuedInvitation.lookup_id, seat: issuedSeat },
              ],
              invitationUrl: invitationUrl(
                window.location.origin,
                issuedInvitation.lookup_id,
                issuedInvitation.secret,
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

  async function handleRevokeInvitation(
    lookupId: string | null = activeInvitationLookupId,
  ) {
    if (activeGame === null || lookupId === null) return;
    setIsBusy(true);
    setError(null);
    try {
      await executeHostCommand(
        `revokeInvitation:${lookupId}`,
        "revokeInvitation",
        { lookup_id: lookupId },
      );
      const remaining = activeInvitations.filter(
        (invitation) => invitation.lookup_id !== lookupId,
      );
      const revokedDisplayed = lookupId === activeInvitationLookupId;
      setActiveInvitations(remaining);
      setActiveInvitationLookupId(remaining[0]?.lookup_id ?? null);
      setActiveGame((current) => {
        if (current === null) return current;
        return {
          ...(revokedDisplayed ? withoutInvitationUrl(current) : current),
          active_invitations: current.active_invitations.filter(
            (invitation) => invitation.lookup_id !== lookupId,
          ),
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
      await executeHostCommand("deleteGame", "deleteGame", { confirm: true });
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
    if (initialGrant === null) return;
    setIsBusy(true);
    setError(null);
    try {
      const session =
        initialGrant.kind === "invitation"
          ? await claimInvitation(
              initialGrant.lookupId,
              initialGrant.secret,
              invitationClaimIdReference.current,
            )
          : initialGrant.kind === "seat-recovery"
            ? await claimSeatRecovery(
                initialGrant.lookupId,
                initialGrant.secret,
                recoveryClaimIdReference.current,
              )
            : await claimHostRecovery(
                initialGrant.lookupId,
                initialGrant.secret,
                recoveryClaimIdReference.current,
              );
      enterGame(session);
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
    sendCommand("retreatStack", {
      combat_id: combatId,
      path,
      unit_ids: unitIds,
    });
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

          {initialGrant === null && requestedGameId === null ? (
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
          ) : initialGrant !== null ? (
            <div className="join-panel">
              <h2>
                {initialGrant.kind === "invitation"
                  ? "Private invitation"
                  : "Private recovery grant"}
              </h2>
              <p>
                {initialGrant.kind === "invitation"
                  ? "The invitation secret was removed from browser history. Claim the seat to continue."
                  : "The recovery secret was removed from browser history. Claim the grant to continue."}
              </p>
              <button disabled={isBusy} onClick={() => void handleClaim()}>
                {initialGrant.kind === "host-recovery"
                  ? "Recover host controls"
                  : "Claim seat"}
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
            <dd>
              {activeGame.seat === null
                ? "Host controls only"
                : humanSide(activeGame.seat)}
            </dd>
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
        {activeGame.seat !== null && connectionStatus === "disconnected" ? (
          <button onClick={() => setReconnectAttempt((attempt) => attempt + 1)}>
            Reconnect
          </button>
        ) : null}
      </header>

      {activeGame.invitationUrl === undefined &&
      activeInvitationLookupId === null ? null : (
        <section className="invitation-panel" aria-labelledby="invite-heading">
          <div>
            <p className="eyebrow">Opposing seat</p>
            <h2 id="invite-heading">
              {activeGame.invitationUrl === undefined
                ? "Manage the active invitation"
                : "Share this one-time invitation"}
            </h2>
            <p>
              Open it in a private window or a separate browser. This browser
              already owns
              {activeGame.seat === null
                ? " host controls."
                : ` the ${humanSide(activeGame.seat)} seat.`}
            </p>
          </div>
          {activeGame.invitationUrl === undefined ? (
            <p>
              The bearer secret is not stored in the browser. Revoke this
              invitation or issue a replacement if it was not shared.
            </p>
          ) : (
            <>
              <input
                aria-label="One-time invitation URL"
                onFocus={(event) => event.currentTarget.select()}
                readOnly
                value={activeGame.invitationUrl}
              />
              <button onClick={() => void handleCopyInvitation()}>Copy</button>
            </>
          )}
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
        {activeGame.is_host
          ? activeInvitations.map((invitation) => (
              <button
                disabled={isBusy}
                key={invitation.lookup_id}
                onClick={() =>
                  void handleRevokeInvitation(invitation.lookup_id)
                }
              >
                Revoke {humanSide(invitation.seat)} invitation
              </button>
            ))
          : null}
        {activeGame.is_host ? (
          <>
            {activeGame.seat === null ? null : (
              <button
                disabled={isBusy}
                onClick={() => void handleIssueInvitation()}
              >
                Issue opposing-seat invitation
              </button>
            )}
            <button disabled={isBusy} onClick={() => void handleDeleteGame()}>
              Delete game
            </button>
          </>
        ) : null}
        {activeGame.is_host && activeGame.seat === null ? (
          <>
            <button
              disabled={isBusy}
              onClick={() => void handleIssueInvitation("union")}
            >
              Issue Union invitation
            </button>
            <button
              disabled={isBusy}
              onClick={() => void handleIssueInvitation("confederate")}
            >
              Issue Confederate invitation
            </button>
          </>
        ) : null}
        {activeGame.seat === null ? null : (
          <button disabled={pendingCommand} onClick={handleSurrenderSeat}>
            Surrender seat
          </button>
        )}
      </section>

      {activeGame.seat === null ? (
        <section className="join-panel">
          <h2>Host controls recovered</h2>
          <p>
            This browser can issue or revoke seat invitations and delete the
            game. Claim a seat invitation in another browser to play.
          </p>
        </section>
      ) : (
        <>
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
        </>
      )}

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
