import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";

import type { ActionEvent, AuditEvent } from "@gettysburg/game";
import { parseCookie, stringifySetCookie } from "cookie";
import express, {
  type Application,
  type NextFunction,
  type Request,
  type Response,
} from "express";

import { ServiceError, type ServiceErrorCode } from "./game-service.js";
import { isCanonicalCredential } from "./credentials.js";
import type { GameEventBus } from "./event-bus.js";
import {
  InMemoryAsyncGameService,
  type GameService,
} from "./postgres-store.js";

export const SESSION_COOKIE_NAME = "__Host-gettysburg-session";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const CREATION_LIMIT_WINDOW_MS = 15 * 60 * 1_000;
const CREATION_LIMIT_PER_SOURCE = 10;
const CREATION_LIMIT_GLOBAL = 100;
const CLAIM_LIMIT_WINDOW_MS = 15 * 60 * 1_000;
const CLAIM_LIMIT_PER_SOURCE = 20;
const CLAIM_LIMIT_GLOBAL = 200;

interface CreationBucket {
  readonly creationIds: Set<string>;
  readonly resetAt: number;
}

class CreationRateLimiter {
  #global: CreationBucket = {
    creationIds: new Set(),
    resetAt: Date.now() + CREATION_LIMIT_WINDOW_MS,
  };
  readonly #sources = new Map<string, CreationBucket>();

  allow(source: string, creationId: string, now = Date.now()): boolean {
    if (this.#global.resetAt <= now) {
      this.#global = {
        creationIds: new Set(),
        resetAt: now + CREATION_LIMIT_WINDOW_MS,
      };
      this.#sources.clear();
    }
    if (this.#global.creationIds.has(creationId)) return true;
    if (this.#global.creationIds.size >= CREATION_LIMIT_GLOBAL) return false;

    let sourceBucket = this.#sources.get(source);
    if (sourceBucket === undefined || sourceBucket.resetAt <= now) {
      sourceBucket = {
        creationIds: new Set(),
        resetAt: now + CREATION_LIMIT_WINDOW_MS,
      };
      this.#sources.set(source, sourceBucket);
    }
    if (sourceBucket.creationIds.size >= CREATION_LIMIT_PER_SOURCE) {
      return false;
    }
    sourceBucket.creationIds.add(creationId);
    this.#global.creationIds.add(creationId);
    return true;
  }
}

interface AttemptBucket {
  count: number;
  readonly resetAt: number;
}

class AttemptRateLimiter {
  #global: AttemptBucket;
  readonly #sources = new Map<string, AttemptBucket>();

  constructor(
    private readonly windowMs = CLAIM_LIMIT_WINDOW_MS,
    private readonly perSource = CLAIM_LIMIT_PER_SOURCE,
    private readonly globalLimit = CLAIM_LIMIT_GLOBAL,
  ) {
    this.#global = { count: 0, resetAt: Date.now() + windowMs };
  }

  allow(source: string, now = Date.now()): boolean {
    if (this.#global.resetAt <= now) {
      this.#global = { count: 0, resetAt: now + this.windowMs };
      this.#sources.clear();
    }
    if (this.#global.count >= this.globalLimit) return false;
    let sourceBucket = this.#sources.get(source);
    if (sourceBucket === undefined || sourceBucket.resetAt <= now) {
      sourceBucket = { count: 0, resetAt: now + this.windowMs };
      this.#sources.set(source, sourceBucket);
    }
    if (sourceBucket.count >= this.perSource) {
      return false;
    }
    this.#global.count += 1;
    sourceBucket.count += 1;
    return true;
  }
}

export interface ReadinessState {
  isReady(): boolean | Promise<boolean>;
}

export interface HttpApplicationOptions {
  readonly eventBus?: GameEventBus;
  readonly gameService: GameService;
  readonly readiness: ReadinessState;
  readonly staticDirectory?: string;
}

export function readSessionCredentialFromCookieHeader(
  cookieHeader: string | undefined,
): string | undefined {
  const cookies = parseCookie(cookieHeader ?? "");
  return cookies[SESSION_COOKIE_NAME];
}

function readSessionCredential(request: Request): string | undefined {
  return readSessionCredentialFromCookieHeader(request.headers.cookie);
}

function setSessionCookie(response: Response, credential: string): void {
  response.setHeader(
    "Set-Cookie",
    stringifySetCookie({
      httpOnly: true,
      maxAge: SESSION_MAX_AGE_SECONDS,
      name: SESSION_COOKIE_NAME,
      path: "/",
      sameSite: "strict",
      secure: true,
      value: credential,
    }),
  );
}

async function actionLog(
  gameService: GameService,
  gameId: string,
): Promise<ActionEvent[]> {
  return (await gameService.getActions(gameId)).flatMap<ActionEvent>(
    (action) => {
      if (action.result?.ok === true) return [action.result.event];
      if (
        action.kind === "operator_audit" &&
        action.operatorRequestId !== null
      ) {
        return [
          {
            command_id: action.operatorRequestId,
            command_name: "operatorRecovery" as const,
            event_sequence: action.sequence,
            kind: "operator_audit" as const,
            state_version: action.resultingVersion,
            summary: "Operator recovery completed",
          },
        ];
      }
      return [];
    },
  );
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorStatus(code: ServiceErrorCode): number {
  switch (code) {
    case "credential_invalid":
    case "invitation_mismatch":
    case "replay_cursor_invalid":
      return 400;
    case "game_not_found":
      return 404;
    case "game_deleted":
    case "game_purged":
      return 410;
    case "creation_conflict":
    case "creation_unavailable":
    case "invitation_unavailable":
    case "recovery_unavailable":
    case "replay_unavailable":
    case "seat_unavailable":
    case "version_unavailable":
      return 409;
    case "unauthorized":
      return 401;
  }
}

export function configureHttpApplication(
  application: Application,
  options: HttpApplicationOptions,
): Application {
  const { gameService, readiness, staticDirectory } = options;
  const creationRateLimiter = new CreationRateLimiter();
  const claimRateLimiter = new AttemptRateLimiter();
  // Process-local limits precede database reads and synchronous reconstruction.
  // Both maps are bounded by the global attempt budget and expire each minute.
  const replaySourceLimiter = new AttemptRateLimiter(60_000, 60, 300);
  const replaySessionLimiter = new AttemptRateLimiter(60_000, 30, 300);
  const allowBearerClaim = (request: Request, response: Response) => {
    if (claimRateLimiter.allow(request.ip ?? "unknown")) return true;
    response.setHeader(
      "Retry-After",
      String(Math.ceil(CLAIM_LIMIT_WINDOW_MS / 1_000)),
    );
    response.status(429).json({ error: "claim_rate_limited" });
    return false;
  };
  application.disable("x-powered-by");
  application.set("trust proxy", "loopback");
  application.use((_request, response, next) => {
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'",
    );
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  application.use("/api", (_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });
  application.use(express.json({ limit: "16kb", strict: true }));

  application.get("/healthz", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  application.get("/readyz", async (_request, response, next) => {
    try {
      if (!(await readiness.isReady())) {
        response.status(503).json({ status: "unavailable" });
        return;
      }

      response.status(200).json({
        durability: "restart-safe",
        mode: "postgresql",
        status: "ready",
      });
    } catch (error) {
      next(error);
    }
  });

  application.use("/api", async (_request, response, next) => {
    try {
      const exportMatch = _request.path.match(/^\/games\/([^/]+)\/export$/i);
      if (
        _request.method === "GET" &&
        exportMatch?.[1] !== undefined &&
        UUID_PATTERN.test(exportMatch[1])
      ) {
        next();
        return;
      }
      if (!(await readiness.isReady())) {
        const gameIdMatch = _request.path.match(
          /^\/games\/([0-9a-f-]+)\/host-commands$/i,
        );
        const commandId = _request.body?.command_id;
        if (
          _request.method === "POST" &&
          gameIdMatch?.[1] !== undefined &&
          _request.body?.command_name === "deleteGame" &&
          typeof commandId === "string" &&
          (await gameService.canRetryTerminalDelete(
            readSessionCredential(_request),
            gameIdMatch[1],
            commandId,
          ))
        ) {
          next();
          return;
        }
        response.status(503).json({ error: "service_unavailable" });
        return;
      }
      next();
    } catch (error) {
      console.error("Unexpected HTTP application error.", error);
      response.status(500).json({ error: "internal_error" });
    }
  });

  application.post("/api/games", async (request, response, next) => {
    try {
      const seat = request.body?.seat;
      const suppliedCreationId = request.body?.creation_id;
      const suppliedCreationCredential = request.body?.creation_credential;
      if (seat !== "confederate" && seat !== "union") {
        response.status(400).json({ error: "invalid_seat" });
        return;
      }
      if (
        suppliedCreationId !== undefined &&
        (typeof suppliedCreationId !== "string" ||
          !UUID_PATTERN.test(suppliedCreationId))
      ) {
        response.status(400).json({ error: "invalid_creation_id" });
        return;
      }
      if (
        suppliedCreationCredential !== undefined &&
        (typeof suppliedCreationCredential !== "string" ||
          !isCanonicalCredential(suppliedCreationCredential))
      ) {
        response.status(400).json({ error: "invalid_creation_credential" });
        return;
      }
      const creationId =
        typeof suppliedCreationId === "string"
          ? suppliedCreationId
          : randomUUID();
      if (!creationRateLimiter.allow(request.ip ?? "unknown", creationId)) {
        response.setHeader(
          "Retry-After",
          String(Math.ceil(CREATION_LIMIT_WINDOW_MS / 1_000)),
        );
        response.status(429).json({ error: "creation_rate_limited" });
        return;
      }

      const result = await gameService.createGame(
        seat,
        readSessionCredential(request),
        creationId,
        typeof suppliedCreationCredential === "string"
          ? suppliedCreationCredential
          : undefined,
      );
      setSessionCookie(response, result.credential);
      response.status(201).json({
        action_log: await actionLog(gameService, result.gameId),
        active_invitations: await gameService.getActiveInvitations(
          result.gameId,
        ),
        game_id: result.gameId,
        invitation: result.invitation,
        is_host: true,
        seat: result.seat,
        state: result.state,
      });
    } catch (error) {
      next(error);
    }
  });

  application.post(
    "/api/invitations/:lookupId/claim",
    async (request, response, next) => {
      try {
        const secret = request.body?.secret;
        const suppliedClaimId = request.body?.claim_id;
        if (
          typeof secret !== "string" ||
          (suppliedClaimId !== undefined && !UUID_PATTERN.test(suppliedClaimId))
        ) {
          response.status(400).json({ error: "invalid_invitation" });
          return;
        }
        if (!allowBearerClaim(request, response)) return;

        const credential = readSessionCredential(request);
        const claimId =
          typeof suppliedClaimId === "string" ? suppliedClaimId : randomUUID();
        const requestedGameId =
          typeof request.body?.game_id === "string"
            ? request.body.game_id
            : undefined;
        const requestedSeat =
          request.body?.seat === "confederate" || request.body?.seat === "union"
            ? request.body.seat
            : undefined;
        const result = await gameService.claimInvitation({
          ...(credential === undefined ? {} : { credential }),
          claimId,
          lookupId: request.params.lookupId ?? "",
          ...(requestedGameId === undefined ? {} : { requestedGameId }),
          ...(requestedSeat === undefined ? {} : { requestedSeat }),
          secret,
        });
        setSessionCookie(response, result.credential);
        response.status(200).json({
          action_log: await actionLog(gameService, result.gameId),
          active_invitations: [],
          game_id: result.gameId,
          is_host: false,
          seat: result.seat,
          state: result.state,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  application.post(
    "/api/recovery/:lookupId/claim",
    async (request, response, next) => {
      try {
        const secret = request.body?.secret;
        const suppliedClaimId = request.body?.claim_id;
        if (
          typeof secret !== "string" ||
          (suppliedClaimId !== undefined && !UUID_PATTERN.test(suppliedClaimId))
        ) {
          response.status(400).json({ error: "invalid_recovery" });
          return;
        }
        if (!allowBearerClaim(request, response)) return;

        const credential = readSessionCredential(request);
        let auditEvent: AuditEvent | undefined;
        const result = await gameService.claimSeatRecovery(
          {
            claimId:
              typeof suppliedClaimId === "string"
                ? suppliedClaimId
                : randomUUID(),
            ...(credential === undefined ? {} : { credential }),
            lookupId: request.params.lookupId ?? "",
            secret,
          },
          { afterCommit: (event) => (auditEvent = event) },
        );
        if (auditEvent !== undefined) {
          options.eventBus?.publishAudit(result.gameId, {
            event: auditEvent,
            revokedSeat: result.seat,
          });
        }
        setSessionCookie(response, result.credential);
        response.status(200).json({
          action_log: await actionLog(gameService, result.gameId),
          active_invitations: [],
          game_id: result.gameId,
          is_host: false,
          seat: result.seat,
          state: result.state,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  application.post(
    "/api/host-recovery/:lookupId/claim",
    async (request, response, next) => {
      try {
        const secret = request.body?.secret;
        const suppliedClaimId = request.body?.claim_id;
        if (
          typeof secret !== "string" ||
          (suppliedClaimId !== undefined && !UUID_PATTERN.test(suppliedClaimId))
        ) {
          response.status(400).json({ error: "invalid_recovery" });
          return;
        }
        if (!allowBearerClaim(request, response)) return;
        const credential = readSessionCredential(request);
        let auditEvent: AuditEvent | undefined;
        const result = await gameService.claimHostRecovery(
          {
            claimId:
              typeof suppliedClaimId === "string"
                ? suppliedClaimId
                : randomUUID(),
            ...(credential === undefined ? {} : { credential }),
            lookupId: request.params.lookupId ?? "",
            secret,
          },
          { afterCommit: (event) => (auditEvent = event) },
        );
        if (auditEvent !== undefined) {
          options.eventBus?.publishAudit(result.gameId, { event: auditEvent });
        }
        setSessionCookie(response, result.credential);
        response.status(200).json({
          action_log: await actionLog(gameService, result.gameId),
          active_invitations: await gameService.getActiveInvitations(
            result.gameId,
          ),
          game_id: result.gameId,
          is_host: true,
          seat: null,
          state: await gameService.getGameState(result.gameId),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  application.post(
    "/api/games/:gameId/host-commands",
    async (request, response, next) => {
      try {
        const gameId = request.params.gameId ?? "";
        const authorization = await gameService.authenticateHost(
          readSessionCredential(request),
          gameId,
          typeof request.body?.command_id === "string"
            ? { terminalCommandId: request.body.command_id }
            : {},
        );
        const result = await gameService.executeHostCommand(
          authorization,
          request.body,
          {
            afterCommit: (event) =>
              options.eventBus?.publishManagement(gameId, event),
          },
        );
        response.status(200).json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  application.get(
    "/api/games/:gameId/replay",
    async (request, response, next) => {
      try {
        const credential = readSessionCredential(request);
        const sessionKey = createHash("sha256")
          .update(credential ?? "anonymous")
          .digest("hex");
        if (
          !replaySourceLimiter.allow(request.ip ?? "unknown") ||
          !replaySessionLimiter.allow(sessionKey)
        ) {
          response.setHeader("Retry-After", "60");
          response.status(429).json({ error: "replay_rate_limited" });
          return;
        }
        const cursor = request.query.sequence;
        if (
          Object.keys(request.query).some((key) => key !== "sequence") ||
          (cursor !== undefined &&
            (typeof cursor !== "string" ||
              !/^(0|[1-9][0-9]{0,15})$/.test(cursor)))
        )
          throw new ServiceError(
            "replay_cursor_invalid",
            "Invalid replay sequence.",
          );
        response
          .status(200)
          .json(
            await gameService.getReplay(
              credential,
              request.params.gameId ?? "",
              cursor === undefined ? undefined : Number(cursor),
            ),
          );
      } catch (error) {
        next(error);
      }
    },
  );

  application.get("/api/games/:gameId", async (request, response, next) => {
    try {
      const gameId = request.params.gameId ?? "";
      const credential = readSessionCredential(request);
      let seatAuthorization;
      let hostAuthorization;
      try {
        seatAuthorization = await gameService.authenticate(credential, gameId);
      } catch (error) {
        if (!(error instanceof ServiceError) || error.code !== "unauthorized") {
          throw error;
        }
      }
      try {
        hostAuthorization = await gameService.authenticateHost(
          credential,
          gameId,
        );
      } catch (error) {
        if (!(error instanceof ServiceError) || error.code !== "unauthorized") {
          throw error;
        }
      }
      if (seatAuthorization === undefined && hostAuthorization === undefined) {
        throw new ServiceError("unauthorized", "No game access was found.");
      }
      response.status(200).json({
        action_log: await actionLog(gameService, gameId),
        active_invitations:
          hostAuthorization === undefined
            ? []
            : await gameService.getActiveInvitations(gameId),
        game_id: gameId,
        is_host: hostAuthorization !== undefined,
        seat: seatAuthorization?.side ?? null,
        state:
          seatAuthorization === undefined
            ? await gameService.getGameState(gameId)
            : await gameService.getAuthorizedState(seatAuthorization),
      });
    } catch (error) {
      next(error);
    }
  });

  application.get(
    "/api/games/:gameId/export",
    async (request, response, next) => {
      try {
        response
          .status(200)
          .json(
            await gameService.getRecoveryExport(
              readSessionCredential(request),
              request.params.gameId ?? "",
            ),
          );
      } catch (error) {
        if (!(error instanceof ServiceError)) {
          try {
            if (!(await readiness.isReady())) {
              response.status(503).json({ error: "service_unavailable" });
              return;
            }
          } catch {
            response.status(503).json({ error: "service_unavailable" });
            return;
          }
        }
        next(error);
      }
    },
  );

  if (staticDirectory !== undefined && existsSync(staticDirectory)) {
    const absoluteStaticDirectory = resolve(staticDirectory);
    application.use(express.static(absoluteStaticDirectory, { index: false }));
    application.use((request, response, next) => {
      if (
        request.method === "GET" &&
        !request.path.startsWith("/api/") &&
        request.accepts("html")
      ) {
        response.sendFile("index.html", { root: absoluteStaticDirectory });
        return;
      }
      next();
    });
  }

  application.use(
    (
      error: unknown,
      _request: Request,
      response: Response,
      next: NextFunction,
    ) => {
      void next;
      if (error instanceof ServiceError) {
        response.status(errorStatus(error.code)).json({
          error: error.code,
          message: error.message,
        });
        return;
      }

      if (error instanceof SyntaxError) {
        response.status(400).json({ error: "invalid_json" });
        return;
      }

      next(error);
    },
  );

  return application;
}

export function createHttpApplication(
  readiness: ReadinessState,
  gameService: GameService = new InMemoryAsyncGameService(),
): Application {
  return configureHttpApplication(express(), { gameService, readiness });
}
