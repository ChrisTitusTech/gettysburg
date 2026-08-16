import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";

import { configureHttpApplication, type ReadinessState } from "./http.js";
import { GameEventBus } from "./event-bus.js";
import type { GameService } from "./postgres-store.js";
import { createGettysburgRoom } from "./room.js";

export interface GettysburgServerOptions {
  readonly gameService: GameService;
  readonly readiness: ReadinessState;
  readonly staticDirectory?: string;
  readonly trustedWebSocketOrigin: string;
}

export function isTrustedWebSocketOrigin(
  trustedOrigin: string,
  requestOrigin: string | undefined,
): boolean {
  return requestOrigin === trustedOrigin;
}

export function createGettysburgServer(
  options: GettysburgServerOptions,
): Server {
  const eventBus = new GameEventBus();
  const gameServer = new Server({
    express: (application) => {
      configureHttpApplication(application, { ...options, eventBus });
    },
    gracefullyShutdown: false,
    greet: false,
    transport: new WebSocketTransport({
      verifyClient: ({ origin }: { readonly origin: string }) =>
        isTrustedWebSocketOrigin(options.trustedWebSocketOrigin, origin),
    }),
  });
  gameServer
    .define(
      "game",
      createGettysburgRoom(options.gameService, options.readiness, eventBus),
    )
    .filterBy(["gameId"]);
  return gameServer;
}
