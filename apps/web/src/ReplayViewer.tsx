import { useEffect, useState } from "react";
import { ApiResponseError, getReplay, type ReplayResponse } from "./api";
import { Board } from "./Board";

export function ReplayViewer({
  gameId,
  latestSequence,
  load = getReplay,
}: {
  readonly gameId: string;
  readonly latestSequence: number;
  readonly load?: typeof getReplay;
}) {
  const [request, setRequest] = useState<{
    sequence: number | undefined;
    revision: number;
  }>({ sequence: 0, revision: 0 });
  const [loaded, setSnapshot] = useState<ReplayResponse | null>(null);
  const snapshot = loaded?.state.game_id === gameId ? loaded : null;
  const [draft, setDraft] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrySeconds, setRetrySeconds] = useState<number | null>(null);
  useEffect(() => {
    if (retrySeconds === null) return;
    const timer = setTimeout(() => setRetrySeconds(null), retrySeconds * 1_000);
    return () => clearTimeout(timer);
  }, [retrySeconds]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void load(gameId, request.sequence, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        if (
          result.state.game_id !== gameId ||
          result.state.event_sequence !== result.sequence ||
          (request.sequence !== undefined &&
            result.sequence !== request.sequence)
        )
          throw new Error("Invalid replay response");
        setSnapshot(result);
        setDraft(String(result.sequence));
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        if (failure instanceof ApiResponseError && failure.status === 429) {
          setRetrySeconds(failure.retryAfterSeconds ?? 60);
        } else {
          setSnapshot(null);
          setError(
            "Replay is unavailable. Your access may have changed, or this history could not be verified.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [gameId, request, load]);
  const latest = Math.max(latestSequence, snapshot?.latest_sequence ?? 0);
  const blocked = loading || retrySeconds !== null;
  const seek = (sequence: number | undefined) => {
    if (!blocked)
      setRequest((current) => ({ sequence, revision: current.revision + 1 }));
  };
  return (
    <section className="replay-viewer" aria-label="Read-only game replay">
      <h2>Replay (read-only)</h2>
      <p>
        Event 0 is the opening. Each step is one accepted gameplay or management
        event. Live play continues separately; replay never sends game commands.
      </p>
      <div className="zoom-controls" aria-label="Replay navigation">
        <button
          disabled={blocked || snapshot?.sequence === 0}
          onClick={() => seek(0)}
        >
          Opening
        </button>
        <button
          disabled={blocked || !snapshot || snapshot.sequence === 0}
          onClick={() => seek(snapshot!.sequence - 1)}
        >
          Previous event
        </button>
        <button
          disabled={blocked || !snapshot || snapshot.sequence >= latest}
          onClick={() => seek(snapshot!.sequence + 1)}
        >
          Next event
        </button>
        <button disabled={blocked} onClick={() => seek(undefined)}>
          Latest event
        </button>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (blocked) return;
          const sequence = Number(draft);
          if (
            !/^(0|[1-9][0-9]*)$/.test(draft) ||
            !Number.isSafeInteger(sequence) ||
            sequence > latest
          ) {
            setError("Choose an event number between 0 and the latest event.");
            return;
          }
          seek(sequence);
        }}
      >
        <label>
          Event number{" "}
          <input
            type="number"
            disabled={blocked}
            min="0"
            max={latest}
            step="1"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <button disabled={blocked} type="submit">
          Go to event
        </button>
      </form>
      <p role="status">
        {loading
          ? `Loading verified replay...${snapshot ? ` Still showing event ${snapshot.sequence}.` : ""}`
          : snapshot
            ? `Viewing event ${snapshot.sequence} of ${latest}. Turn ${snapshot.state.turn}, ${snapshot.state.phase}, state v${snapshot.state.version}.`
            : "No replay snapshot displayed."}
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {retrySeconds === null ? null : (
        <p role="alert">
          Replay navigation is rate-limited. Try again in {retrySeconds}{" "}
          seconds.
        </p>
      )}
      {snapshot ? (
        <>
          <p>
            Objective and casualty score: Union {snapshot.state.victory.union};
            Confederate {snapshot.state.victory.confederate}.{" "}
            {snapshot.state.victory.status}.
          </p>
          <Board
            key={gameId}
            readOnly
            seat="union"
            state={snapshot.state}
            onMove={() => undefined}
          />
          <section aria-label="Recorded combats">
            <h3>Recorded combats at this event</h3>
            {Object.keys(snapshot.state.combats).length === 0 ? (
              <p>No combats in this snapshot.</p>
            ) : (
              <ul>
                {Object.values(snapshot.state.combats).map((combat) => (
                  <li key={combat.id}>
                    {combat.attackers
                      .map((id) => snapshot.state.units[id]?.label ?? id)
                      .join(", ")}{" "}
                    against{" "}
                    {combat.defenders
                      .map((id) => snapshot.state.units[id]?.label ?? id)
                      .join(", ")}
                    : {combat.status}; recorded dice{" "}
                    {combat.rolls
                      ? `${combat.rolls.attacker} / ${combat.rolls.defender}`
                      : "not rolled"}
                    .
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}
