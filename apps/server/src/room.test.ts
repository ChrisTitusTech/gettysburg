import { randomUUID } from "node:crypto";
import type { Client } from "@colyseus/core";
import { COMMAND_SCHEMA_VERSION, type ManagementEvent } from "@gettysburg/game";
import { describe, expect, it, vi } from "vitest";

import { createGettysburgRoom, pruneExpiredCommandWindows } from "./room.js";
import { GameEventBus } from "./event-bus.js";
import { InMemoryAsyncGameService } from "./postgres-store.js";

describe("command-window pruning", () => {
  it("removes expired bindings while preserving active reconnect limits", () => {
    const windows = new Map([
      ["expired", { count: 30, windowStartedAt: 1_000 }],
      ["active", { count: 30, windowStartedAt: 10_500 }],
    ]);

    pruneExpiredCommandWindows(windows, 11_000);

    expect([...windows]).toEqual([
      ["active", { count: 30, windowStartedAt: 10_500 }],
    ]);
  });
});

describe("authorized broadcast ordering", () => {
  it("serializes slow reads and never substitutes cached observer access after a failed read", async () => {
    const service = new InMemoryAsyncGameService();
    const host = await service.createGame("union");
    const issued = await service.executeHostCommand(
      await service.authenticateHost(host.credential, host.gameId),
      {
        command_id: randomUUID(),
        command_name: "issueSpectatorInvitation",
        payload: {},
        expected_version: 0,
        game_id: host.gameId,
        schema: COMMAND_SCHEMA_VERSION,
      },
    );
    if (!issued.ok || !issued.invitation) throw new Error("Missing invitation");
    const observer = await service.claimSpectatorInvitation({
      claimId: randomUUID(),
      lookupId: issued.invitation.lookup_id,
      secret: issued.invitation.secret,
    });
    const observerAuthorization = await service.authenticateSpectator(
      observer.credential,
      host.gameId,
    );
    const bus = new GameEventBus();
    const Room = createGettysburgRoom(service, { isReady: () => true }, bus);
    const room = new Room();
    vi.spyOn(room, "setMetadata").mockResolvedValue(undefined);
    const playerEvents: number[] = [];
    const observerEvents: number[] = [];
    room.clients.push({
      auth: await service.authenticate(host.credential, host.gameId),
      send: (_type: string, event: ManagementEvent) =>
        playerEvents.push(event.event_sequence),
      leave: vi.fn(),
    } as unknown as Client);
    const observerClient = {
      auth: observerAuthorization,
      send: (_type: string, event: ManagementEvent) =>
        observerEvents.push(event.event_sequence),
      leave: vi.fn(),
    } as unknown as Client;
    room.clients.push(observerClient);
    let release = () => {};
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const authorize = service.authorizeSpectatorDelivery.bind(service);
    const reads = vi
      .spyOn(service, "authorizeSpectatorDelivery")
      .mockImplementationOnce(async (authorizations) => {
        await barrier;
        return authorize(authorizations);
      });
    const publish = (sequence: number) =>
      bus.publishManagement(host.gameId, {
        command_id: randomUUID(),
        command_name: "issueSpectatorInvitation",
        event_sequence: sequence,
        state_version: 0,
        kind: "host_management",
        summary: "test event",
      });
    try {
      await room.onCreate!({ gameId: host.gameId });
      publish(1);
      publish(2);
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(reads).toHaveBeenCalledTimes(1);
      expect(playerEvents).toEqual([]);
      expect(observerEvents).toEqual([]);
      const reconnectEvents: number[] = [];
      const reconnect = {
        auth: await service.authenticate(host.credential, host.gameId),
        send: (_type: string, event: ManagementEvent) =>
          reconnectEvents.push(event.event_sequence),
        leave: vi.fn(),
      } as unknown as Client;
      room.clients.push(reconnect);
      vi.spyOn(service, "getAuthorizedState").mockResolvedValueOnce({
        ...(await service.getGameState(host.gameId)),
        event_sequence: 2,
        version: 2,
      });
      const joining = room.onJoin!(reconnect, {});
      expect(reconnectEvents).toEqual([]);
      release();
      await joining;
      await vi.waitFor(() => expect(observerEvents).toEqual([1, 2]));
      expect(playerEvents).toEqual([1, 2]);
      expect(reconnectEvents).toEqual([2]);
      reads.mockRejectedValueOnce(new Error("database unavailable"));
      publish(3);
      await vi.waitFor(() =>
        expect(observerClient.leave).toHaveBeenCalledWith(4002),
      );
      expect(observerEvents).toEqual([1, 2]);
      const recoveredEvents: number[] = [];
      const recoveredObserver = {
        auth: observerAuthorization,
        send: (_type: string, event: ManagementEvent) =>
          recoveredEvents.push(event.event_sequence),
        leave: vi.fn(),
      } as unknown as Client;
      room.clients.push(recoveredObserver);
      vi.spyOn(service, "getAuthorizedSpectatorState").mockResolvedValueOnce({
        ...(await service.getGameState(host.gameId)),
        event_sequence: 3,
      });
      await room.onJoin!(recoveredObserver, {});
      publish(4);
      await vi.waitFor(() => expect(recoveredEvents).toEqual([3, 4]));
      expect(observerEvents).toEqual([1, 2]);
      expect(playerEvents).toEqual([1, 2, 3, 4]);
      expect(reconnectEvents).toEqual([2, 3, 4]);
    } finally {
      release();
      await room.onDispose!();
      vi.restoreAllMocks();
    }
  });

  it("retains updates and deletion while a captured initial snapshot is loading", async () => {
    const service = new InMemoryAsyncGameService();
    const host = await service.createGame("union");
    const initial = await service.getGameState(host.gameId);
    const bus = new GameEventBus();
    const Room = createGettysburgRoom(service, { isReady: () => true }, bus);
    const room = new Room();
    vi.spyOn(room, "setMetadata").mockResolvedValue(undefined);
    const received: Array<[string, number]> = [];
    const client = {
      auth: await service.authenticate(host.credential, host.gameId),
      send: (type: string, event: ManagementEvent) =>
        received.push([type, event.event_sequence]),
      leave: vi.fn(),
    } as unknown as Client;
    room.clients.push(client);
    let release = () => {};
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const read = vi
      .spyOn(service, "getAuthorizedState")
      .mockImplementationOnce(async () => {
        await barrier;
        return initial;
      });
    try {
      await room.onCreate!({ gameId: host.gameId });
      const joining = room.onJoin!(client, {});
      await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
      for (const [sequence, name] of [
        [1, "issueSpectatorInvitation"],
        [2, "deleteGame"],
      ] as const) {
        bus.publishManagement(host.gameId, {
          command_id: randomUUID(),
          command_name: name,
          event_sequence: sequence,
          state_version: 0,
          kind: "host_management",
          summary: "test event",
        });
      }
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(received).toEqual([]);
      release();
      await joining;
      await vi.waitFor(() =>
        expect(received).toEqual([
          ["snapshot", 0],
          ["managementEvent", 1],
          ["managementEvent", 2],
        ]),
      );
    } finally {
      release();
      await room.onDispose!();
      vi.restoreAllMocks();
    }
  });
});
