import {
  COMMAND_SCHEMA_VERSION,
  type GameState,
  type GameplayEvent,
  type HostManagementCommandName,
  type ManagementEvent,
  type Side,
} from "@gettysburg/game";

export interface SessionResponse {
  readonly action_log: readonly GameplayEvent[];
  readonly game_id: string;
  readonly is_host: boolean;
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

const REQUEST_TIMEOUT_MS = 15_000;

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () =>
      controller.abort(new DOMException("Request timed out", "TimeoutError")),
    REQUEST_TIMEOUT_MS,
  );
  const abortFromCaller = () => controller.abort(init?.signal?.reason);
  if (init?.signal?.aborted === true) abortFromCaller();
  else init?.signal?.addEventListener("abort", abortFromCaller, { once: true });

  let response: Response;
  let text: string;
  try {
    response = await fetch(url, {
      ...init,
      credentials: "same-origin",
      headers: {
        ...(init?.body === undefined
          ? {}
          : { "content-type": "application/json" }),
        ...init?.headers,
      },
      signal: controller.signal,
    });
    text = await response.text();
  } finally {
    clearTimeout(timeout);
    init?.signal?.removeEventListener("abort", abortFromCaller);
  }
  let body: (T & ApiErrorBody) | undefined;
  try {
    body = text === "" ? undefined : (JSON.parse(text) as T & ApiErrorBody);
  } catch {
    body = undefined;
  }
  if (!response.ok) {
    throw new Error(
      body?.message ??
        body?.error ??
        (text.trim() === ""
          ? `Request failed (${response.status})`
          : text.trim().slice(0, 200)),
    );
  }
  if (body === undefined)
    throw new Error("Server returned an invalid response.");
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

export function resumeGame(
  gameId: string,
  signal?: AbortSignal,
): Promise<SessionResponse> {
  return jsonRequest(
    `/api/games/${encodeURIComponent(gameId)}`,
    signal === undefined ? undefined : { signal },
  );
}

export interface HostCommandResponse {
  readonly event: ManagementEvent;
  readonly invitation?: {
    readonly lookup_id: string;
    readonly secret: string;
  };
  readonly ok: true;
}

export function sendHostCommand(
  gameId: string,
  expectedVersion: number,
  commandName: HostManagementCommandName,
  payload: Record<string, unknown>,
): Promise<HostCommandResponse> {
  return jsonRequest(`/api/games/${encodeURIComponent(gameId)}/host-commands`, {
    body: JSON.stringify({
      command_id: crypto.randomUUID(),
      command_name: commandName,
      expected_version: expectedVersion,
      game_id: gameId,
      payload,
      schema: COMMAND_SCHEMA_VERSION,
    }),
    method: "POST",
  });
}
