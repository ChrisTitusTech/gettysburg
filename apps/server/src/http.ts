import { existsSync } from "node:fs";
import { resolve } from "node:path";

import type { GameplayEvent } from "@gettysburg/game";
import { parseCookie, stringifySetCookie } from "cookie";
import express, {
  type Application,
  type NextFunction,
  type Request,
  type Response,
} from "express";

import { ServiceError, type ServiceErrorCode } from "./game-service.js";
import {
  InMemoryAsyncGameService,
  type GameService,
} from "./postgres-store.js";

export const SESSION_COOKIE_NAME = "__Host-gettysburg-session";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export interface ReadinessState {
  isReady(): boolean | Promise<boolean>;
}

export interface HttpApplicationOptions {
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

async function gameplayActionLog(
  gameService: GameService,
  gameId: string,
): Promise<GameplayEvent[]> {
  return (await gameService.getActions(gameId)).flatMap((action) =>
    action.kind === "gameplay" && action.result?.ok
      ? [action.result.event]
      : [],
  );
}

function errorStatus(code: ServiceErrorCode): number {
  switch (code) {
    case "credential_invalid":
    case "invitation_mismatch":
      return 400;
    case "game_not_found":
      return 404;
    case "invitation_unavailable":
    case "recovery_unavailable":
    case "seat_unavailable":
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
  application.disable("x-powered-by");
  application.use((_request, response, next) => {
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

  application.post("/api/games", async (request, response, next) => {
    try {
      const seat = request.body?.seat;
      if (seat !== "confederate" && seat !== "union") {
        response.status(400).json({ error: "invalid_seat" });
        return;
      }

      const result = await gameService.createGame(
        seat,
        readSessionCredential(request),
      );
      setSessionCookie(response, result.credential);
      response.status(201).json({
        action_log: await gameplayActionLog(gameService, result.gameId),
        game_id: result.gameId,
        invitation: result.invitation,
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
        if (typeof secret !== "string") {
          response.status(400).json({ error: "invalid_invitation" });
          return;
        }

        const credential = readSessionCredential(request);
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
          lookupId: request.params.lookupId ?? "",
          ...(requestedGameId === undefined ? {} : { requestedGameId }),
          ...(requestedSeat === undefined ? {} : { requestedSeat }),
          secret,
        });
        setSessionCookie(response, result.credential);
        response.status(200).json({
          action_log: await gameplayActionLog(gameService, result.gameId),
          game_id: result.gameId,
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
        if (typeof secret !== "string") {
          response.status(400).json({ error: "invalid_recovery" });
          return;
        }

        const credential = readSessionCredential(request);
        const result = await gameService.claimSeatRecovery({
          ...(credential === undefined ? {} : { credential }),
          lookupId: request.params.lookupId ?? "",
          secret,
        });
        setSessionCookie(response, result.credential);
        response.status(200).json({
          action_log: await gameplayActionLog(gameService, result.gameId),
          game_id: result.gameId,
          seat: result.seat,
          state: result.state,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  application.get("/api/games/:gameId", async (request, response, next) => {
    try {
      const gameId = request.params.gameId ?? "";
      const authorization = await gameService.authenticate(
        readSessionCredential(request),
        gameId,
      );
      response.status(200).json({
        action_log: await gameplayActionLog(gameService, gameId),
        game_id: gameId,
        seat: authorization.side,
        state: await gameService.getAuthorizedState(authorization),
      });
    } catch (error) {
      next(error);
    }
  });

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
