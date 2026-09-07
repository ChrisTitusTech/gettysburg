import { Room, type AuthContext, type Client } from "@colyseus/core";
import {
  commandPayloadSchemas,
  type CommandFailure,
  type ManagementEvent,
  type ActionEvent,
  type GameState,
} from "@gettysburg/game";

import type { GameEventBus } from "./event-bus.js";
import {
  ServiceError,
  type GameAuthorization,
  type SpectatorAuthorization,
} from "./game-service.js";
import {
  readSessionCredentialFromCookieHeader,
  type ReadinessState,
} from "./http.js";
import type { GameService } from "./postgres-store.js";

export interface GameRoomOptions {
  readonly gameId: string;
  readonly spectator?: boolean;
}

type RoomAuthorization = GameAuthorization | SpectatorAuthorization;
type DeliveryMessage =
  | readonly ["snapshot", GameState]
  | readonly ["gameplayEvent" | "managementEvent" | "auditEvent", ActionEvent];
function isSpectator(
  authorization: RoomAuthorization,
): authorization is SpectatorAuthorization {
  return "kind" in authorization && authorization.kind === "spectator";
}

type GameRoomConstructor = new () => Room;

export const ROOM_COMMAND_LIMIT = 30;
const ROOM_COMMAND_WINDOW_MS = 10_000;

export function pruneExpiredCommandWindows(
  commandWindows: Map<string, { count: number; windowStartedAt: number }>,
  now: number,
): void {
  for (const [bindingId, candidate] of commandWindows) {
    if (now - candidate.windowStartedAt >= ROOM_COMMAND_WINDOW_MS) {
      commandWindows.delete(bindingId);
    }
  }
}

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
  let lastCommandWindowPruneAt = 0;
  return class GettysburgRoom extends Room {
    // Keep the room matchable while a reload overlaps the old socket. onJoin
    // replaces the prior connection for the same binding, so stable occupancy
    // remains one client per binding and all broadcasts stay in one room.
    // Two seats, eight observers, and two overlapping reloads; capacity still
    // requires the separately planned VPS measurement.
    override maxClients = 12;
    #gameId = "";
    #unsubscribeAudit: (() => void) | undefined;
    #unsubscribeManagement: (() => void) | undefined;
    readonly #retiredBindings = new Set<string>();
    #delivery: Promise<void> = Promise.resolve();
    readonly #deliveredSequence = new WeakMap<Client, number>();
    readonly #deliveryClosed = new WeakSet<Client>();

    #retireBinding(bindingId: string): void {
      this.#retiredBindings.add(bindingId);
      for (const client of [...this.clients]) {
        if (
          (client.auth as RoomAuthorization | undefined)?.bindingId ===
          bindingId
        )
          client.leave(4001);
      }
    }

    #canReceive(client: Client): boolean {
      if (this.#deliveryClosed.has(client)) return false;
      const authorization = client.auth as RoomAuthorization | undefined;
      if (authorization === undefined) return false;
      if (this.#retiredBindings.has(authorization.bindingId)) return false;
      return true;
    }

    #broadcastAuthorized(messages: readonly DeliveryMessage[]): Promise<void> {
      return this.#enqueueDelivery(() => this.#deliverAuthorized(messages));
    }

    #enqueueDelivery(operation: () => Promise<void>): Promise<void> {
      const delivery = this.#delivery.then(operation);
      this.#delivery = delivery.catch(() => {});
      return delivery;
    }

    async #deliverAuthorized(
      messages: readonly DeliveryMessage[],
    ): Promise<void> {
      const sequence = messages[0]?.[1].event_sequence ?? 0;
      const authorizations = [...this.clients].flatMap((client) => {
        const authorization = client.auth as RoomAuthorization | undefined;
        return authorization !== undefined &&
          isSpectator(authorization) &&
          this.#canReceive(client)
          ? [authorization]
          : [];
      });
      let permitted: ReadonlySet<string> = new Set();
      if (authorizations.length > 0) {
        try {
          // One fresh snapshot read covers every observer. This also closes the
          // window between a committed revocation and delayed event delivery.
          permitted = new Set(
            await gameService.authorizeSpectatorDelivery(authorizations),
          );
          for (const authorization of authorizations)
            if (!permitted.has(authorization.bindingId))
              this.#retireBinding(authorization.bindingId);
        } catch {
          // An unavailable authorization read must never fall back to cached
          // spectator access or leave observers silently connected to stale
          // state. Close this connection, not the binding: a new join can
          // reauthorize and load fresh state after the read service recovers.
          for (const client of [...this.clients]) {
            const authorization = client.auth as RoomAuthorization | undefined;
            if (authorization !== undefined && isSpectator(authorization)) {
              this.#deliveryClosed.add(client);
              client.leave(4002);
            }
          }
        }
      }
      for (const client of [...this.clients]) {
        const authorization = client.auth as RoomAuthorization | undefined;
        if (
          authorization === undefined ||
          sequence <= (this.#deliveredSequence.get(client) ?? 0) ||
          !this.#canReceive(client) ||
          (isSpectator(authorization) &&
            !permitted.has(authorization.bindingId))
        )
          continue;
        for (const [type, message] of messages) client.send(type, message);
        this.#deliveredSequence.set(client, sequence);
      }
    }

    override async onCreate(options: GameRoomOptions): Promise<void> {
      this.#gameId = options.gameId;
      await gameService.getGameState(this.#gameId);
      this.setMetadata({ gameId: this.#gameId });
      this.#unsubscribeManagement = eventBus?.subscribeManagement(
        this.#gameId,
        (event: ManagementEvent, revokedSpectatorBindingId?: string) => {
          if (revokedSpectatorBindingId !== undefined)
            this.#retireBinding(revokedSpectatorBindingId);
          if (event.command_name === "deleteGame") {
            for (const client of [...this.clients]) {
              const authorization = client.auth as
                RoomAuthorization | undefined;
              if (authorization !== undefined && isSpectator(authorization))
                this.#retireBinding(authorization.bindingId);
            }
          }
          void this.#broadcastAuthorized([["managementEvent", event]]).catch(
            () => console.error("Management event delivery failed."),
          );
        },
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
                this.#retireBinding(
                  (client.auth as GameAuthorization).bindingId,
                );
              }
            }
          }
          void this.#broadcastAuthorized([["auditEvent", event]]).catch(() =>
            console.error("Audit event delivery failed."),
          );
        },
      );

      const commandNames = Object.keys(commandPayloadSchemas);
      for (const commandName of commandNames) {
        this.onMessage(commandName, async (client, message: unknown) => {
          try {
            if (!this.#canReceive(client)) return;
            const authorization = client.auth as RoomAuthorization;
            if (isSpectator(authorization))
              throw new ServiceError(
                "unauthorized",
                "Spectators cannot send gameplay commands.",
              );
            const now = Date.now();
            if (now - lastCommandWindowPruneAt >= ROOM_COMMAND_WINDOW_MS) {
              pruneExpiredCommandWindows(commandWindows, now);
              lastCommandWindowPruneAt = now;
            }
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
              await this.#broadcastAuthorized([
                ["gameplayEvent", result.event],
                ["snapshot", result.state],
              ]);
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
    ): Promise<RoomAuthorization> {
      if (!(await readiness.isReady())) {
        throw new Error("The game service is temporarily unavailable.");
      }
      if (options.gameId !== this.#gameId) {
        throw new ServiceError(
          "unauthorized",
          "Room game does not match request.",
        );
      }

      const credential = readSessionCredentialFromCookieHeader(
        context.headers.get("cookie") ?? undefined,
      );
      return options.spectator === true
        ? await gameService.authenticateSpectator(credential, this.#gameId)
        : await gameService.authenticate(credential, this.#gameId);
    }

    override async onJoin(client: Client): Promise<void> {
      // A queued batch may predate the initial snapshot returned by this join.
      // Earlier queued batches can be skipped because the initial read follows
      // them. Later batches wait behind that read, so none can disappear while
      // a captured (potentially older) snapshot is still loading.
      this.#deliveredSequence.set(client, Infinity);
      const authorization = client.auth as RoomAuthorization;
      for (const existing of [...this.clients]) {
        if (
          existing !== client &&
          (existing.auth as RoomAuthorization | undefined)?.bindingId ===
            authorization.bindingId
        ) {
          existing.leave(4000);
        }
      }
      await this.#enqueueDelivery(async () => {
        const state = isSpectator(authorization)
          ? await gameService.getAuthorizedSpectatorState(authorization)
          : await gameService.getAuthorizedState(authorization);
        if (this.#canReceive(client)) {
          client.send("snapshot", state);
          this.#deliveredSequence.set(client, state.event_sequence);
        }
      });
    }
  };
}
