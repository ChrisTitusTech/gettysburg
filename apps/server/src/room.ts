import { Room, type AuthContext, type Client } from "@colyseus/core";
import type { CommandFailure } from "@gettysburg/game";

import {
  InMemoryGameService,
  ServiceError,
  type GameAuthorization,
} from "./game-service.js";
import { readSessionCredentialFromCookieHeader } from "./http.js";

export interface GameRoomOptions {
  readonly gameId: string;
}

type GameRoomConstructor = new () => Room;

function failure(error: ServiceError): CommandFailure {
  return {
    current_version: 0,
    error: "unauthorized",
    message: error.message,
    ok: false,
  };
}

export function createGettysburgRoom(
  gameService: InMemoryGameService,
): GameRoomConstructor {
  return class GettysburgRoom extends Room {
    override autoDispose = false;
    override maxClients = 2;
    #gameId = "";

    override onCreate(options: GameRoomOptions): void {
      this.#gameId = options.gameId;
      gameService.getGameState(this.#gameId);
      this.setMetadata({ gameId: this.#gameId });

      this.onMessage("moveUnit", (client, message: unknown) => {
        try {
          const authorization = client.auth as GameAuthorization;
          const result = gameService.executeMove(authorization, message);
          client.send("commandResult", result);
          if (result.ok) {
            this.broadcast("gameplayEvent", result.event);
            this.broadcast("snapshot", result.state);
          }
        } catch (error) {
          if (error instanceof ServiceError) {
            client.send("commandResult", failure(error));
            return;
          }
          throw error;
        }
      });
    }

    override onAuth(
      _client: Client,
      options: GameRoomOptions,
      context: AuthContext,
    ): GameAuthorization {
      if (options.gameId !== this.#gameId) {
        throw new ServiceError(
          "unauthorized",
          "Room game does not match request.",
        );
      }

      return gameService.authenticate(
        readSessionCredentialFromCookieHeader(
          context.headers.get("cookie") ?? undefined,
        ),
        this.#gameId,
      );
    }

    override onJoin(client: Client): void {
      const authorization = client.auth as GameAuthorization;
      client.send("snapshot", gameService.getAuthorizedState(authorization));
    }
  };
}
