import type { GameState, GameplayEvent, Side } from "@gettysburg/game";

export interface SessionResponse {
  readonly action_log: readonly GameplayEvent[];
  readonly game_id: string;
  readonly seat: Side;
  readonly state: GameState;
}

export interface CreateGameResponse extends SessionResponse {
  readonly invitation: {
    readonly lookup_id: string;
    readonly secret: string;
  };
}

interface ApiErrorBody {
  readonly error?: string;
  readonly message?: string;
}

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init?.body === undefined
        ? {}
        : { "content-type": "application/json" }),
      ...init?.headers,
    },
  });
  const body = (await response.json()) as T & ApiErrorBody;
  if (!response.ok) {
    throw new Error(
      body.message ?? body.error ?? `Request failed (${response.status})`,
    );
  }
  return body;
}

export function createGame(seat: Side): Promise<CreateGameResponse> {
  return jsonRequest("/api/games", {
    body: JSON.stringify({ seat }),
    method: "POST",
  });
}

export function claimInvitation(
  lookupId: string,
  secret: string,
): Promise<SessionResponse> {
  return jsonRequest(`/api/invitations/${encodeURIComponent(lookupId)}/claim`, {
    body: JSON.stringify({ secret }),
    method: "POST",
  });
}

export function resumeGame(gameId: string): Promise<SessionResponse> {
  return jsonRequest(`/api/games/${encodeURIComponent(gameId)}`);
}
