import { Room, type AuthContext, type Client } from "@colyseus/core";
import {
  type CommandFailure,
  type GameplayCommandName,
  type ManagementEvent,
} from "@gettysburg/game";

import type { GameEventBus } from "./event-bus.js";
import { ServiceError, type GameAuthorization } from "./game-service.js";
import {
  readSessionCredentialFromCookieHeader,
  type ReadinessState,
} from "./http.js";
import type { GameService } from "./postgres-store.js";

export interface GameRoomOptions {
  readonly gameId: string;
}

type GameRoomConstructor = new () => Room;

function failure(error: ServiceError): CommandFailure {
  const preservedCodes = new Set<CommandFailure["error"]>([
    "game_deleted",
    "game_not_found",
    "game_purged",
    "version_unavailable",
  ]);
  return {
    current_version: 0,
    error: preservedCodes.has(error.code as CommandFailure["error"])
      ? (error.code as CommandFailure["error"])
      : "unauthorized",
    message: error.message,
    ok: false,
  };
}

export function createGettysburgRoom(
  gameService: GameService,
  readiness: ReadinessState,
  eventBus?: GameEventBus,
): GameRoomConstructor {
  return class GettysburgRoom extends Room {
    override autoDispose = false;
    override maxClients = 2;
    #gameId = "";
    #unsubscribeManagement: (() => void) | undefined;

    override async onCreate(options: GameRoomOptions): Promise<void> {
      this.#gameId = options.gameId;
      await gameService.getGameState(this.#gameId);
      this.setMetadata({ gameId: this.#gameId });
      this.#unsubscribeManagement = eventBus?.subscribeManagement(
        this.#gameId,
        (event: ManagementEvent) => this.broadcast("managementEvent", event),
      );

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
        "surrenderSeat",
      ];
      for (const commandName of commandNames) {
        this.onMessage(commandName, async (client, message: unknown) => {
          try {
            if (!(await readiness.isReady())) {
              client.send("commandResult", {
                current_version: 0,
                error: "internal_error",
                message: "The game service is temporarily unavailable.",
                ok: false,
              } satisfies CommandFailure);
              return;
            }
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
            console.error("Unexpected authoritative room command failure.");
            client.send("commandResult", {
              current_version: 0,
              error: "internal_error",
              message: "The command could not be completed.",
              ok: false,
            } satisfies CommandFailure);
          }
        });
      }
    }

    override onDispose(): void {
      this.#unsubscribeManagement?.();
    }

    override async onAuth(
      _client: Client,
      options: GameRoomOptions,
      context: AuthContext,
    ): Promise<GameAuthorization> {
      if (!(await readiness.isReady())) {
        throw new Error("The game service is temporarily unavailable.");
      }
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
