import { Room, type AuthContext, type Client } from "@colyseus/core";
import {
  type CommandFailure,
  type GameplayCommandName,
} from "@gettysburg/game";

import { ServiceError, type GameAuthorization } from "./game-service.js";
import { readSessionCredentialFromCookieHeader } from "./http.js";
import type { GameService } from "./postgres-store.js";

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
  gameService: GameService,
): GameRoomConstructor {
  return class GettysburgRoom extends Room {
    override autoDispose = false;
    override maxClients = 2;
    #gameId = "";

    override async onCreate(options: GameRoomOptions): Promise<void> {
      this.#gameId = options.gameId;
      await gameService.getGameState(this.#gameId);
      this.setMetadata({ gameId: this.#gameId });

      const commandNames: readonly GameplayCommandName[] = [
        "advanceAfterCombat",
        "allocateLoss",
        "confirmCombatResult",
        "declareCombat",
        "endPhase",
        "enterReinforcement",
        "moveStack",
        "moveUnit",
        "retreatStack",
        "retreatUnit",
        "rollCombat",
      ];
      for (const commandName of commandNames) {
        this.onMessage(commandName, async (client, message: unknown) => {
          try {
            const authorization = client.auth as GameAuthorization;
            const result = await gameService.executeCommand(
              authorization,
              message,
            );
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
    }

    override async onAuth(
      _client: Client,
      options: GameRoomOptions,
      context: AuthContext,
    ): Promise<GameAuthorization> {
      if (options.gameId !== this.#gameId) {
        throw new ServiceError(
          "unauthorized",
          "Room game does not match request.",
        );
      }

      return await gameService.authenticate(
        readSessionCredentialFromCookieHeader(
          context.headers.get("cookie") ?? undefined,
        ),
        this.#gameId,
      );
    }

    override async onJoin(client: Client): Promise<void> {
      const authorization = client.auth as GameAuthorization;
      client.send(
        "snapshot",
        await gameService.getAuthorizedState(authorization),
      );
    }
  };
}
