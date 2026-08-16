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

export const ROOM_COMMAND_LIMIT = 30;
const ROOM_COMMAND_WINDOW_MS = 10_000;

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
  const commandWindows = new Map<
    string,
    { count: number; windowStartedAt: number }
  >();
  return class GettysburgRoom extends Room {
    // Keep the room matchable while a reload overlaps the old socket. onJoin
    // replaces the prior connection for the same binding, so stable occupancy
    // remains one client per seat and all broadcasts stay in one room.
    override maxClients = 4;
    #gameId = "";
    #unsubscribeAudit: (() => void) | undefined;
    #unsubscribeManagement: (() => void) | undefined;

    override async onCreate(options: GameRoomOptions): Promise<void> {
      this.#gameId = options.gameId;
      await gameService.getGameState(this.#gameId);
      this.setMetadata({ gameId: this.#gameId });
      this.#unsubscribeManagement = eventBus?.subscribeManagement(
        this.#gameId,
        (event: ManagementEvent) => this.broadcast("managementEvent", event),
      );
      this.#unsubscribeAudit = eventBus?.subscribeAudit(
        this.#gameId,
        ({ event, revokedSeat }) => {
          if (revokedSeat !== undefined) {
            for (const client of [...this.clients]) {
              if (
                (client.auth as GameAuthorization | undefined)?.side ===
                revokedSeat
              ) {
                client.leave(4001);
              }
            }
          }
          this.broadcast("auditEvent", event);
        },
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
            const authorization = client.auth as GameAuthorization;
            const now = Date.now();
            const previousWindow = commandWindows.get(authorization.bindingId);
            const window =
              previousWindow === undefined ||
              now - previousWindow.windowStartedAt >= ROOM_COMMAND_WINDOW_MS
                ? { count: 0, windowStartedAt: now }
                : previousWindow;
            if (window.count >= ROOM_COMMAND_LIMIT) {
              client.send("commandResult", {
                current_version: 0,
                error: "rate_limited",
                message: "Too many gameplay commands. Wait before retrying.",
                ok: false,
              } satisfies CommandFailure);
              return;
            }
            window.count += 1;
            commandWindows.set(authorization.bindingId, window);
            if (!(await readiness.isReady())) {
              client.send("commandResult", {
                current_version: 0,
                error: "internal_error",
                message: "The game service is temporarily unavailable.",
                ok: false,
              } satisfies CommandFailure);
              return;
            }
            let committed = false;
            const result = await gameService.executeCommand(
              authorization,
              message,
              { afterCommit: () => (committed = true) },
            );
            client.send("commandResult", result);
            if (result.ok && committed) {
              this.broadcast("gameplayEvent", result.event);
              this.broadcast("snapshot", result.state);
              if (result.event.command_name === "surrenderSeat") {
                client.leave(4001);
              }
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
      this.#unsubscribeAudit?.();
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
      for (const existing of [...this.clients]) {
        if (
          existing !== client &&
          (existing.auth as GameAuthorization | undefined)?.bindingId ===
            authorization.bindingId
        ) {
          existing.leave(4000);
        }
      }
      client.send(
        "snapshot",
        await gameService.getAuthorizedState(authorization),
      );
    }
  };
}
