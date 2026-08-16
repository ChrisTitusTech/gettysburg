import {
  COMMAND_SCHEMA_VERSION,
  type GameState,
  type ActionEvent,
  type HostManagementCommandName,
  type ManagementEvent,
  type Side,
} from "@gettysburg/game";

export class ApiResponseError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiResponseError";
  }
}

export function isRetryableApiError(error: unknown): boolean {
  return !(
    error instanceof ApiResponseError &&
    error.status < 500 &&
    error.status !== 408 &&
    error.status !== 429
  );
}

export function isDefinitiveResumeError(error: unknown): boolean {
  return (
    error instanceof ApiResponseError &&
    ["game_deleted", "game_not_found", "game_purged", "unauthorized"].includes(
      error.code ?? "",
    )
  );
}

export interface SessionResponse {
  readonly action_log: readonly ActionEvent[];
  readonly active_invitations: readonly {
    readonly lookup_id: string;
    readonly seat: Side;
  }[];
  readonly game_id: string;
  readonly is_host: boolean;
  readonly seat: Side | null;
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
    throw new ApiResponseError(
      body?.message ??
        body?.error ??
        (text.trim() === ""
          ? `Request failed (${response.status})`
          : text.trim().slice(0, 200)),
      response.status,
      body?.error,
    );
  }
  if (
    body === undefined ||
    body === null ||
    typeof body !== "object" ||
    Array.isArray(body)
  )
    throw new Error("Server returned an invalid response.");
  return body;
}

export function createGame(
  seat: Side,
  creationId: string,
  creationCredential: string,
): Promise<CreateGameResponse> {
  return jsonRequest("/api/games", {
    body: JSON.stringify({
      creation_credential: creationCredential,
      creation_id: creationId,
      seat,
    }),
    method: "POST",
  });
}

export function claimInvitation(
  lookupId: string,
  secret: string,
  claimId: string,
): Promise<SessionResponse> {
  return jsonRequest(`/api/invitations/${encodeURIComponent(lookupId)}/claim`, {
    body: JSON.stringify({ claim_id: claimId, secret }),
    method: "POST",
  });
}

export function claimSeatRecovery(
  lookupId: string,
  secret: string,
  claimId: string,
): Promise<SessionResponse> {
  return jsonRequest(`/api/recovery/${encodeURIComponent(lookupId)}/claim`, {
    body: JSON.stringify({ claim_id: claimId, secret }),
    method: "POST",
  });
}

export function claimHostRecovery(
  lookupId: string,
  secret: string,
  claimId: string,
): Promise<SessionResponse> {
  return jsonRequest(
    `/api/host-recovery/${encodeURIComponent(lookupId)}/claim`,
    { body: JSON.stringify({ claim_id: claimId, secret }), method: "POST" },
  );
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
  commandId: string = crypto.randomUUID(),
): Promise<HostCommandResponse> {
  return jsonRequest(`/api/games/${encodeURIComponent(gameId)}/host-commands`, {
    body: JSON.stringify({
      command_id: commandId,
      command_name: commandName,
      expected_version: expectedVersion,
      game_id: gameId,
      payload,
      schema: COMMAND_SCHEMA_VERSION,
    }),
    method: "POST",
  });
}
