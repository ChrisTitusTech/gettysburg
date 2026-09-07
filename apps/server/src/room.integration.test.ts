import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type AddressInfo } from "node:net";

import {
  Client as ColyseusClient,
  type Room as ClientRoom,
} from "@colyseus/sdk";
import { matchMaker } from "@colyseus/core";
import {
  COMMAND_SCHEMA_VERSION,
  commandPayloadSchemas,
  type AuditEvent,
  type CommandResult,
  type GameState,
  type ManagementEvent,
} from "@gettysburg/game";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InMemoryGameService } from "./game-service.js";
import { InMemoryAsyncGameService } from "./postgres-store.js";
import { ROOM_COMMAND_LIMIT } from "./room.js";
import { createGettysburgServer } from "./server.js";

async function reservePort(): Promise<number> {
  const reservation = createServer();
  await new Promise<void>((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolve);
  });
  const port = (reservation.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject) => {
    reservation.close((error) =>
      error === undefined ? resolve() : reject(error),
    );
  });
  return port;
}

interface CreatedGame {
  readonly game_id: string;
  readonly invitation: { readonly lookup_id: string; readonly secret: string };
}

function cookieFrom(response: Response): string {
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  if (cookie === undefined) {
    throw new Error("Expected a browser-session cookie");
  }
  return cookie;
}

function nextMessage<T>(
  room: ClientRoom,
  type: string,
  predicate: (message: T) => boolean = () => true,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timed out waiting for ${type}`));
    }, 3_000);
    const unsubscribe = room.onMessage<T>(type, (message) => {
      if (!predicate(message)) {
        return;
      }
      clearTimeout(timeout);
      unsubscribe();
      resolve(message);
    });
  });
}

describe("Colyseus authoritative room", () => {
  const rooms: ClientRoom[] = [];
  let server: ReturnType<typeof createGettysburgServer> | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(rooms.splice(0).map((room) => room.leave(true)));
    if (server !== undefined) {
      await server.gracefullyShutdown(false);
      server = undefined;
    }
  });

  it("cancels an abandoned initial read before Colyseus invokes onLeave", async () => {
    const service = new InMemoryAsyncGameService();
    const host = await service.createGame("union");
    const guest = await service.claimInvitation({
      lookupId: host.invitation.lookup_id,
      secret: host.invitation.secret,
    });
    const port = await reservePort();
    const origin = `http://127.0.0.1:${port}`;
    server = createGettysburgServer({
      gameService: service,
      readiness: { isReady: () => true },
      trustedWebSocketOrigin: origin,
    });
    await server.listen(port, "127.0.0.1");
    const connect = (credential: string) =>
      new ColyseusClient(origin, {
        headers: { origin, cookie: `__Host-gettysburg-session=${credential}` },
      }).joinOrCreate("game", { gameId: host.gameId });
    const player = await connect(host.credential);
    rooms.push(player);
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    let signal: AbortSignal | undefined;
    const deliver = vi.fn();
    vi.spyOn(service, "deliverAuthorizedState").mockImplementationOnce(
      async (_authorization, _deliver, cancellation) => {
        signal = cancellation;
        await barrier;
        if (!cancellation.aborted) deliver();
      },
    );
    const joining = connect(guest.credential).then(
      () => {
        throw new Error("Abandoned join unexpectedly succeeded");
      },
      (error: unknown) => error,
    );
    try {
      await vi.waitFor(() => expect(signal).toBeDefined());
      const room = matchMaker.getLocalRoomById(player.roomId)!;
      const pending = room.clients.find(
        (client) => client.sessionId !== player.sessionId,
      )!;
      // Closing the real transport during onJoin exercises Colyseus's deferred
      // onLeave lifecycle, rather than calling our hook directly.
      pending.leave(4000);
      await vi.waitFor(() => expect(signal?.aborted).toBe(true), {
        timeout: 1_000,
      });
      expect(await joining).toBeInstanceOf(Error);
      release();
      const result = nextMessage<CommandResult>(player, "commandResult");
      player.send("endPhase", {
        command_id: randomUUID(),
        command_name: "endPhase",
        payload: {},
        expected_version: 0,
        game_id: host.gameId,
        schema: COMMAND_SCHEMA_VERSION,
      });
      expect(await result).toMatchObject({ ok: true });
      expect(deliver).not.toHaveBeenCalled();
    } finally {
      release();
    }
  });

  it("stops delivering live state when an observer session expires", async () => {
    const pepper = randomBytes(32);
    const initial = new InMemoryGameService({ pepper });
    const host = initial.createGame("union");
    const command = {
      command_id: randomUUID(),
      command_name: "issueSpectatorInvitation",
      payload: {},
      game_id: host.gameId,
      expected_version: 0,
      schema: COMMAND_SCHEMA_VERSION,
    };
    const issued = initial.executeHostCommand(
      initial.authenticateHost(host.credential, host.gameId),
      command,
    );
    if (!issued.ok || !issued.invitation) throw new Error("Missing invitation");
    const observer = initial.claimSpectatorInvitation({
      claimId: randomUUID(),
      lookupId: issued.invitation.lookup_id,
      secret: issued.invitation.secret,
    });
    const snapshot = initial.exportSnapshot();
    const expiration = Date.now() + 10_000;
    const service = new InMemoryGameService({
      pepper,
      now: () => Date.now(),
      snapshot: {
        ...snapshot,
        sessions: snapshot.sessions.map((session) =>
          session.id === observer.sessionId
            ? { ...session, expiresAt: expiration }
            : session,
        ),
      },
    });
    const port = await reservePort();
    const origin = `http://127.0.0.1:${port}`;
    server = createGettysburgServer({
      gameService: new InMemoryAsyncGameService(service),
      readiness: { isReady: () => true },
      trustedWebSocketOrigin: origin,
    });
    await server.listen(port, "127.0.0.1");
    const connect = async (credential: string, spectator: boolean) => {
      const room = await new ColyseusClient(origin, {
        headers: { origin, cookie: `__Host-gettysburg-session=${credential}` },
      }).joinOrCreate("game", { gameId: host.gameId, spectator });
      rooms.push(room);
      return room;
    };
    const hostRoom = await connect(host.credential, false);
    const observerRoom = await connect(observer.credential, true);
    const received: unknown[] = [];
    observerRoom.onMessage<GameState>("snapshot", (state) => {
      if (state.version > 0) received.push(state);
    });
    observerRoom.onMessage("gameplayEvent", (event) => received.push(event));
    const expired = new Promise<number>((resolve) =>
      observerRoom.onLeave((code) => {
        const index = rooms.indexOf(observerRoom);
        if (index >= 0) rooms.splice(index, 1);
        resolve(code);
      }),
    );
    const clock = vi.spyOn(Date, "now").mockReturnValue(expiration + 1);
    try {
      const result = nextMessage<CommandResult>(hostRoom, "commandResult");
      hostRoom.send("endPhase", {
        ...command,
        command_id: randomUUID(),
        command_name: "endPhase",
      });
      expect(await result).toMatchObject({ ok: true });
      await expect(expired).resolves.toBe(4001);
      expect(received).toHaveLength(0);
    } finally {
      clock.mockRestore();
    }
  });

  it("shares one read-only live room with eight observers and evicts revoked bindings before further delivery", async () => {
    const service = new InMemoryGameService();
    const host = service.createGame("union");
    const guest = service.claimInvitation({
      lookupId: host.invitation.lookup_id,
      secret: host.invitation.secret,
    });
    const hostCommand = (command_name: string, payload = {}) => ({
      command_id: randomUUID(),
      command_name,
      payload,
      game_id: host.gameId,
      expected_version: service.getGameState(host.gameId).version,
      schema: COMMAND_SCHEMA_VERSION,
    });
    const observers = Array.from({ length: 8 }, () => {
      const result = service.executeHostCommand(
        service.authenticateHost(host.credential, host.gameId),
        hostCommand("issueSpectatorInvitation"),
      );
      if (!result.ok || !result.invitation)
        throw new Error("Missing invitation");
      return {
        lookupId: result.invitation.lookup_id,
        ...service.claimSpectatorInvitation({
          lookupId: result.invitation.lookup_id,
          secret: result.invitation.secret,
          claimId: randomUUID(),
        }),
      };
    });
    const port = await reservePort();
    const origin = `http://127.0.0.1:${port}`;
    server = createGettysburgServer({
      gameService: new InMemoryAsyncGameService(service),
      readiness: { isReady: () => true },
      trustedWebSocketOrigin: origin,
    });
    await server.listen(port, "127.0.0.1");
    const connect = async (credential: string, spectator = false) => {
      const room = await new ColyseusClient(origin, {
        headers: { origin, cookie: `__Host-gettysburg-session=${credential}` },
      }).joinOrCreate("game", { gameId: host.gameId, spectator });
      rooms.push(room);
      for (const type of [
        "snapshot",
        "gameplayEvent",
        "managementEvent",
        "auditEvent",
        "commandResult",
      ])
        room.onMessage(type, () => {});
      return room;
    };
    const hostRoom = await connect(host.credential);
    const guestRoom = await connect(guest.credential);
    const observerRooms = [];
    for (const observer of observers)
      observerRooms.push(await connect(observer.credential, true));
    expect(new Set(rooms.map((room) => room.roomId)).size).toBe(1);
    const authoritativeRoom = matchMaker.getLocalRoomById(hostRoom.roomId);
    // Full rooms are excluded from joinOrCreate matching just like a locked
    // room. A replacement creation must fail instead of splitting this game.
    await authoritativeRoom.lock();
    try {
      await expect(connect(observers[0]!.credential, true)).rejects.toThrow(
        /already has a room/,
      );
      expect(
        (await matchMaker.query({ name: "game" })).map((room) => room.roomId),
      ).toEqual([hostRoom.roomId]);
    } finally {
      await authoritativeRoom.unlock();
    }
    await expect(connect(observers[0]!.credential)).rejects.toThrow(
      /seat binding/,
    );
    await expect(connect(host.credential, true)).rejects.toThrow(
      /spectator access/,
    );
    const first = observerRooms[0]!;
    const replaced = new Promise<number>((resolve) => first.onLeave(resolve));
    const observerRoom = await connect(observers[0]!.credential, true);
    await expect(replaced).resolves.toBe(4000);
    rooms.splice(rooms.indexOf(first), 1);
    observerRooms[0] = observerRoom;
    expect(observerRoom.roomId).toBe(hostRoom.roomId);
    for (const commandName of Object.keys(commandPayloadSchemas)) {
      const denied = nextMessage<CommandResult>(observerRoom, "commandResult");
      observerRoom.send(commandName, hostCommand(commandName));
      await expect(denied).resolves.toMatchObject({
        ok: false,
        error: "unauthorized",
      });
    }
    for (
      let index = Object.keys(commandPayloadSchemas).length;
      index <= ROOM_COMMAND_LIMIT;
      index++
    ) {
      const denied = nextMessage<CommandResult>(observerRoom, "commandResult");
      observerRoom.send("endPhase", hostCommand("endPhase"));
      await expect(denied).resolves.toMatchObject({
        ok: false,
        error: index === ROOM_COMMAND_LIMIT ? "rate_limited" : "unauthorized",
      });
    }
    expect(service.getGameState(host.gameId).version).toBe(0);
    const snapshots = [hostRoom, guestRoom, ...observerRooms].map((room) =>
      nextMessage<GameState>(room, "snapshot", (state) => state.version === 1),
    );
    const firstCommand = nextMessage<CommandResult>(hostRoom, "commandResult");
    hostRoom.send("endPhase", hostCommand("endPhase"));
    expect(await firstCommand).toMatchObject({ ok: true });
    const synchronized = await Promise.all(snapshots);
    for (const state of synchronized)
      expect(state).toEqual(service.getGameState(host.gameId));
    const receivedAfterRevocation: unknown[] = [];
    for (const type of [
      "snapshot",
      "gameplayEvent",
      "managementEvent",
      "auditEvent",
    ])
      observerRoom.onMessage(type, (message) =>
        receivedAfterRevocation.push(message),
      );
    const revoked = new Promise<number>((resolve) =>
      observerRoom.onLeave(resolve),
    );
    const hostEvent = nextMessage<ManagementEvent>(hostRoom, "managementEvent");
    const response = await fetch(
      `${origin}/api/games/${host.gameId}/host-commands`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `__Host-gettysburg-session=${host.credential}`,
        },
        body: JSON.stringify(
          hostCommand("revokeSpectatorAccess", {
            lookup_id: observers[0]!.lookupId,
          }),
        ),
      },
    );
    expect(response.status).toBe(200);
    const publicResult = await response.json();
    const publicEvent = await hostEvent;
    expect(publicEvent.command_name).toBe("revokeSpectatorAccess");
    expect(JSON.stringify([publicResult, publicEvent])).not.toContain(
      "bindingId",
    );
    await expect(revoked).resolves.toBe(4001);
    rooms.splice(rooms.indexOf(observerRoom), 1);
    const nextSnapshots = [hostRoom, guestRoom, ...observerRooms.slice(1)].map(
      (room) =>
        nextMessage<GameState>(
          room,
          "snapshot",
          (state) => state.version === 2,
        ),
    );
    const activeRoom =
      service.getGameState(host.gameId).active_side === "union"
        ? hostRoom
        : guestRoom;
    const secondCommand = nextMessage<CommandResult>(
      activeRoom,
      "commandResult",
    );
    activeRoom.send("endPhase", hostCommand("endPhase"));
    expect(await secondCommand).toMatchObject({ ok: true });
    await Promise.all(nextSnapshots);
    expect(receivedAfterRevocation).toEqual([]);
    await expect(connect(observers[0]!.credential, true)).rejects.toThrow(
      /spectator access/,
    );
    // Simulate a committed revocation whose event-bus notification is delayed.
    // Fresh delivery authorization must deny any subsequently committed state.
    const delayedObserver = observerRooms[1]!;
    const delayedMessages: unknown[] = [];
    delayedObserver.onMessage("snapshot", (message) =>
      delayedMessages.push(message),
    );
    delayedObserver.onMessage("gameplayEvent", (message) =>
      delayedMessages.push(message),
    );
    const delayedRevocation = new Promise<number>((resolve) =>
      delayedObserver.onLeave(resolve),
    );
    expect(
      service.executeHostCommand(
        service.authenticateHost(host.credential, host.gameId),
        hostCommand("revokeSpectatorAccess", {
          lookup_id: observers[1]!.lookupId,
        }),
      ).ok,
    ).toBe(true);
    const freshSnapshots = [hostRoom, guestRoom, ...observerRooms.slice(2)].map(
      (room) =>
        nextMessage<GameState>(
          room,
          "snapshot",
          (state) => state.version === 3,
        ),
    );
    const currentPlayer =
      service.getGameState(host.gameId).active_side === "union"
        ? hostRoom
        : guestRoom;
    currentPlayer.send("endPhase", hostCommand("endPhase"));
    await Promise.all(freshSnapshots);
    await expect(delayedRevocation).resolves.toBe(4001);
    expect(delayedMessages).toHaveLength(0);
    rooms.splice(rooms.indexOf(delayedObserver), 1);
    const deletedObservers = observerRooms
      .slice(2)
      .map((room) => new Promise<number>((resolve) => room.onLeave(resolve)));
    const deleted = await fetch(
      `${origin}/api/games/${host.gameId}/host-commands`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `__Host-gettysburg-session=${host.credential}`,
        },
        body: JSON.stringify(hostCommand("deleteGame", { confirm: true })),
      },
    );
    expect(deleted.status).toBe(200);
    expect(await Promise.all(deletedObservers)).toEqual(Array(6).fill(4001));
    for (const room of observerRooms.slice(2))
      rooms.splice(rooms.indexOf(room), 1);
  });

  it("routes every protocol command through authoritative validation", async () => {
    const service = new InMemoryGameService();
    const port = await reservePort();
    const origin = `http://127.0.0.1:${port}`;
    server = createGettysburgServer({
      gameService: new InMemoryAsyncGameService(service),
      readiness: { isReady: () => true },
      trustedWebSocketOrigin: origin,
    });
    await server.listen(port, "127.0.0.1");
    const response = await fetch(`${origin}/api/games`, {
      body: JSON.stringify({ seat: "union" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const cookie = cookieFrom(response);
    const created = (await response.json()) as CreatedGame;
    const room = await new ColyseusClient(origin, {
      headers: { cookie, origin },
    }).joinOrCreate("game", { gameId: created.game_id });
    rooms.push(room);
    for (const name of Object.keys(commandPayloadSchemas)) {
      const rejected = nextMessage<CommandResult>(room, "commandResult");
      room.send(name, { command_name: name });
      await expect(rejected).resolves.toMatchObject({
        ok: false,
        error: "invalid_payload",
      });
    }
    expect(service.getGameState(created.game_id).version).toBe(0);
  });

  it("disposes an empty room and reconstructs it from authoritative state", async () => {
    const service = new InMemoryGameService();
    const port = await reservePort();
    const origin = `http://127.0.0.1:${port}`;
    server = createGettysburgServer({
      gameService: new InMemoryAsyncGameService(service),
      readiness: { isReady: () => true },
      trustedWebSocketOrigin: origin,
    });
    await server.listen(port, "127.0.0.1");
    const createResponse = await fetch(`${origin}/api/games`, {
      body: JSON.stringify({ seat: "union" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const cookie = cookieFrom(createResponse);
    const created = (await createResponse.json()) as CreatedGame;
    const first = await new ColyseusClient(origin, {
      headers: { cookie, origin },
    }).joinOrCreate("game", { gameId: created.game_id });
    rooms.push(first);
    const firstRoomId = first.roomId;
    await first.leave(true);
    rooms.splice(rooms.indexOf(first), 1);
    const disposalDeadline = Date.now() + 1_000;
    while (
      (await matchMaker.query({ roomId: firstRoomId })).length > 0 &&
      Date.now() < disposalDeadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(await matchMaker.query({ roomId: firstRoomId })).toHaveLength(0);

    const reconstructed = await new ColyseusClient(origin, {
      headers: { cookie, origin },
    }).joinOrCreate("game", { gameId: created.game_id });
    rooms.push(reconstructed);

    expect(reconstructed.roomId).not.toBe(firstRoomId);
  });

  it("keeps a reload overlap in one room and replaces the older socket", async () => {
    const service = new InMemoryGameService();
    const port = await reservePort();
    const origin = `http://127.0.0.1:${port}`;
    server = createGettysburgServer({
      gameService: new InMemoryAsyncGameService(service),
      readiness: { isReady: () => true },
      trustedWebSocketOrigin: origin,
    });
    await server.listen(port, "127.0.0.1");
    const createResponse = await fetch(`${origin}/api/games`, {
      body: JSON.stringify({ seat: "union" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const cookie = cookieFrom(createResponse);
    const created = (await createResponse.json()) as CreatedGame;
    const first = await new ColyseusClient(origin, {
      headers: { cookie, origin },
    }).joinOrCreate("game", { gameId: created.game_id });
    rooms.push(first);
    const firstLeft = new Promise<number>((resolve) => first.onLeave(resolve));

    const replacement = await new ColyseusClient(origin, {
      headers: { cookie, origin },
    }).joinOrCreate("game", { gameId: created.game_id });
    rooms.push(replacement);

    expect(replacement.roomId).toBe(first.roomId);
    await expect(firstLeft).resolves.toBe(4000);
    rooms.splice(rooms.indexOf(first), 1);
  });

  it("synchronizes two seats, rejects bad commands, and resumes latest state", async () => {
    const service = new InMemoryGameService();
    const port = await reservePort();
    const origin = `http://127.0.0.1:${port}`;
    server = createGettysburgServer({
      gameService: new InMemoryAsyncGameService(service),
      readiness: { isReady: () => true },
      trustedWebSocketOrigin: origin,
    });
    await server.listen(port, "127.0.0.1");

    const createResponse = await fetch(`${origin}/api/games`, {
      body: JSON.stringify({ seat: "confederate" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const hostCookie = cookieFrom(createResponse);
    const created = (await createResponse.json()) as CreatedGame;
    const claimResponse = await fetch(
      `${origin}/api/invitations/${created.invitation.lookup_id}/claim`,
      {
        body: JSON.stringify({ secret: created.invitation.secret }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );
    const guestCookie = cookieFrom(claimResponse);

    const hostRoom = await new ColyseusClient(origin, {
      headers: { cookie: hostCookie, origin },
    }).joinOrCreate("game", { gameId: created.game_id });
    rooms.push(hostRoom);
    const guestRoom = await new ColyseusClient(origin, {
      headers: { cookie: guestCookie, origin },
    }).joinOrCreate("game", { gameId: created.game_id });
    rooms.push(guestRoom);
    expect(guestRoom.roomId).toBe(hostRoom.roomId);

    expect(service.getGameState(created.game_id)).toMatchObject({
      active_side: "union",
      phase: "movement",
      turn: 1,
      version: 0,
    });

    const moveId = randomUUID();
    const hostMoveSnapshot = nextMessage<GameState>(
      hostRoom,
      "snapshot",
      (state) => state.version === 1,
    );
    const move = {
      command_id: moveId,
      command_name: "moveUnit",
      expected_version: 0,
      game_id: created.game_id,
      payload: { destination: "E3", unit_id: "u-wadsworth" },
      schema: COMMAND_SCHEMA_VERSION,
    } as const;
    guestRoom.send("moveUnit", move);
    await expect(hostMoveSnapshot).resolves.toMatchObject({
      units: { "u-wadsworth": { location: "E3" } },
      version: 1,
    });

    const wrongSeat = nextMessage<CommandResult>(hostRoom, "commandResult");
    hostRoom.send("moveUnit", {
      ...move,
      command_id: randomUUID(),
      expected_version: 1,
      payload: { destination: "F3", unit_id: "u-wadsworth" },
    });
    await expect(wrongSeat).resolves.toMatchObject({
      error: "wrong_seat",
      ok: false,
    });

    const invalid = nextMessage<CommandResult>(guestRoom, "commandResult");
    guestRoom.send("moveUnit", {
      ...move,
      command_id: randomUUID(),
      expected_version: 1,
      payload: { destination: "Z99", unit_id: "u-wadsworth" },
    });
    await expect(invalid).resolves.toMatchObject({
      error: "invalid_payload",
      ok: false,
    });

    const stale = nextMessage<CommandResult>(guestRoom, "commandResult");
    guestRoom.send("moveUnit", {
      ...move,
      command_id: randomUUID(),
    });
    await expect(stale).resolves.toMatchObject({
      current_version: 1,
      error: "stale_version",
      ok: false,
    });

    const duplicate = nextMessage<CommandResult>(guestRoom, "commandResult");
    guestRoom.send("moveUnit", move);
    await expect(duplicate).resolves.toMatchObject({
      ok: true,
      state: { version: 1 },
    });
    expect(service.getActions(created.game_id)).toHaveLength(1);

    await guestRoom.leave(true);
    rooms.splice(rooms.indexOf(guestRoom), 1);
    const resumedGuest = await new ColyseusClient(origin, {
      headers: { cookie: guestCookie, origin },
    }).joinOrCreate("game", { gameId: created.game_id });
    rooms.push(resumedGuest);
    expect(resumedGuest.roomId).toBe(hostRoom.roomId);

    const resumedSnapshot = nextMessage<GameState>(
      hostRoom,
      "snapshot",
      (state) => state.version === 2,
    );
    resumedGuest.send("moveUnit", {
      command_id: randomUUID(),
      command_name: "moveUnit",
      expected_version: 1,
      game_id: created.game_id,
      payload: { destination: "R7", unit_id: "u-devin" },
      schema: COMMAND_SCHEMA_VERSION,
    });
    await expect(resumedSnapshot).resolves.toMatchObject({
      units: { "u-devin": { location: "R7" } },
      version: 2,
    });
    expect(service.getActions(created.game_id)).toHaveLength(2);

    await expect(
      new ColyseusClient(origin, {
        headers: { cookie: guestCookie, origin: "https://evil.example" },
      }).joinOrCreate("game", { gameId: created.game_id }),
    ).rejects.toThrow();
  });

  it("broadcasts redacted host-management events without advancing gameplay version", async () => {
    const service = new InMemoryGameService();
    const port = await reservePort();
    const origin = `http://127.0.0.1:${port}`;
    server = createGettysburgServer({
      gameService: new InMemoryAsyncGameService(service),
      readiness: { isReady: () => true },
      trustedWebSocketOrigin: origin,
    });
    await server.listen(port, "127.0.0.1");

    const createResponse = await fetch(`${origin}/api/games`, {
      body: JSON.stringify({ seat: "union" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const hostCookie = cookieFrom(createResponse);
    const created = (await createResponse.json()) as CreatedGame;
    const hostRoom = await new ColyseusClient(origin, {
      headers: { cookie: hostCookie, origin },
    }).joinOrCreate("game", { gameId: created.game_id });
    rooms.push(hostRoom);

    const event = nextMessage<ManagementEvent>(hostRoom, "managementEvent");
    const response = await fetch(
      `${origin}/api/games/${created.game_id}/host-commands`,
      {
        body: JSON.stringify({
          command_id: randomUUID(),
          command_name: "revokeInvitation",
          expected_version: 0,
          game_id: created.game_id,
          payload: { lookup_id: created.invitation.lookup_id },
          schema: COMMAND_SCHEMA_VERSION,
        }),
        headers: {
          "content-type": "application/json",
          cookie: hostCookie,
        },
        method: "POST",
      },
    );

    expect(response.status).toBe(200);
    await expect(event).resolves.toEqual({
      command_id: expect.any(String),
      command_name: "revokeInvitation",
      event_sequence: 1,
      kind: "host_management",
      state_version: 0,
      summary: "confederate invitation revoked",
    });
    expect(service.getGameState(created.game_id)).toMatchObject({
      event_sequence: 1,
      version: 0,
    });
  });

  it("evicts a recovered seat socket and broadcasts the audit event", async () => {
    const service = new InMemoryGameService();
    const port = await reservePort();
    const origin = `http://127.0.0.1:${port}`;
    server = createGettysburgServer({
      gameService: new InMemoryAsyncGameService(service),
      readiness: { isReady: () => true },
      trustedWebSocketOrigin: origin,
    });
    await server.listen(port, "127.0.0.1");

    const createResponse = await fetch(`${origin}/api/games`, {
      body: JSON.stringify({ seat: "union" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const hostCookie = cookieFrom(createResponse);
    const created = (await createResponse.json()) as CreatedGame;
    const claimResponse = await fetch(
      `${origin}/api/invitations/${created.invitation.lookup_id}/claim`,
      {
        body: JSON.stringify({ secret: created.invitation.secret }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );
    const guestCookie = cookieFrom(claimResponse);
    const hostRoom = await new ColyseusClient(origin, {
      headers: { cookie: hostCookie, origin },
    }).joinOrCreate("game", { gameId: created.game_id });
    rooms.push(hostRoom);
    const guestRoom = await new ColyseusClient(origin, {
      headers: { cookie: guestCookie, origin },
    }).joinOrCreate("game", { gameId: created.game_id });
    rooms.push(guestRoom);

    const audit = nextMessage<AuditEvent>(hostRoom, "auditEvent");
    const guestLeft = new Promise<number>((resolve) =>
      guestRoom.onLeave(resolve),
    );
    const grant = service.issueSeatRecovery(
      created.game_id,
      "confederate",
      "integration-test",
    );
    const recoveryResponse = await fetch(
      `${origin}/api/recovery/${grant.lookup_id}/claim`,
      {
        body: JSON.stringify({ secret: grant.secret }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );

    expect(recoveryResponse.status).toBe(200);
    await expect(guestLeft).resolves.toBe(4001);
    rooms.splice(rooms.indexOf(guestRoom), 1);
    await expect(audit).resolves.toMatchObject({
      command_name: "operatorRecovery",
      event_sequence: 1,
      kind: "operator_audit",
      state_version: 0,
    });
  });

  it("disconnects a seat socket after that seat surrenders", async () => {
    const service = new InMemoryGameService();
    const port = await reservePort();
    const origin = `http://127.0.0.1:${port}`;
    server = createGettysburgServer({
      gameService: new InMemoryAsyncGameService(service),
      readiness: { isReady: () => true },
      trustedWebSocketOrigin: origin,
    });
    await server.listen(port, "127.0.0.1");

    const createResponse = await fetch(`${origin}/api/games`, {
      body: JSON.stringify({ seat: "union" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const hostCookie = cookieFrom(createResponse);
    const created = (await createResponse.json()) as CreatedGame;
    const claimResponse = await fetch(
      `${origin}/api/invitations/${created.invitation.lookup_id}/claim`,
      {
        body: JSON.stringify({ secret: created.invitation.secret }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );
    const guestCookie = cookieFrom(claimResponse);
    const hostRoom = await new ColyseusClient(origin, {
      headers: { cookie: hostCookie, origin },
    }).joinOrCreate("game", { gameId: created.game_id });
    rooms.push(hostRoom);
    const guestRoom = await new ColyseusClient(origin, {
      headers: { cookie: guestCookie, origin },
    }).joinOrCreate("game", { gameId: created.game_id });
    rooms.push(guestRoom);
    const surrendered = nextMessage<GameState>(
      hostRoom,
      "snapshot",
      (snapshot) => snapshot.version === 1,
    );
    const guestLeft = new Promise<number>((resolve) =>
      guestRoom.onLeave(resolve),
    );

    guestRoom.send("surrenderSeat", {
      command_id: randomUUID(),
      command_name: "surrenderSeat",
      expected_version: 0,
      game_id: created.game_id,
      payload: {},
      schema: COMMAND_SCHEMA_VERSION,
    });

    await expect(surrendered).resolves.toMatchObject({ version: 1 });
    await expect(guestLeft).resolves.toBe(4001);
    rooms.splice(rooms.indexOf(guestRoom), 1);
  });

  it("blocks room joins and commands when readiness becomes unavailable", async () => {
    const service = new InMemoryGameService();
    const readiness = { available: true, isReady: () => readiness.available };
    const port = await reservePort();
    const origin = `http://127.0.0.1:${port}`;
    server = createGettysburgServer({
      gameService: new InMemoryAsyncGameService(service),
      readiness,
      trustedWebSocketOrigin: origin,
    });
    await server.listen(port, "127.0.0.1");

    const createResponse = await fetch(`${origin}/api/games`, {
      body: JSON.stringify({ seat: "union" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const hostCookie = cookieFrom(createResponse);
    const created = (await createResponse.json()) as CreatedGame;
    const hostRoom = await new ColyseusClient(origin, {
      headers: { cookie: hostCookie, origin },
    }).joinOrCreate("game", { gameId: created.game_id });
    rooms.push(hostRoom);

    readiness.available = false;
    const rejected = nextMessage<CommandResult>(hostRoom, "commandResult");
    hostRoom.send("moveUnit", {
      command_id: randomUUID(),
      command_name: "moveUnit",
      expected_version: 0,
      game_id: created.game_id,
      payload: { destination: "E3", unit_id: "u-wadsworth" },
      schema: COMMAND_SCHEMA_VERSION,
    });
    await expect(rejected).resolves.toMatchObject({
      error: "internal_error",
      ok: false,
    });
    expect(service.getActions(created.game_id)).toHaveLength(0);

    await expect(
      new ColyseusClient(origin, {
        headers: { cookie: hostCookie, origin },
      }).joinOrCreate("game", { gameId: created.game_id }),
    ).rejects.toThrow();
  });

  it("rate-limits gameplay messages before invoking authoritative state", async () => {
    const service = new InMemoryGameService();
    const port = await reservePort();
    const origin = `http://127.0.0.1:${port}`;
    server = createGettysburgServer({
      gameService: new InMemoryAsyncGameService(service),
      readiness: { isReady: () => true },
      trustedWebSocketOrigin: origin,
    });
    await server.listen(port, "127.0.0.1");
    const createResponse = await fetch(`${origin}/api/games`, {
      body: JSON.stringify({ seat: "union" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const hostCookie = cookieFrom(createResponse);
    const created = (await createResponse.json()) as CreatedGame;
    const hostRoom = await new ColyseusClient(origin, {
      headers: { cookie: hostCookie, origin },
    }).joinOrCreate("game", { gameId: created.game_id });
    rooms.push(hostRoom);

    const limited = nextMessage<CommandResult>(
      hostRoom,
      "commandResult",
      (result) => !result.ok && result.error === "rate_limited",
    );
    for (let index = 0; index <= ROOM_COMMAND_LIMIT; index += 1) {
      hostRoom.send("moveUnit", {});
    }
    await expect(limited).resolves.toMatchObject({
      error: "rate_limited",
      ok: false,
    });
    expect(service.getActions(created.game_id)).toHaveLength(0);

    await hostRoom.leave(true);
    rooms.splice(rooms.indexOf(hostRoom), 1);
    const reconnectedRoom = await new ColyseusClient(origin, {
      headers: { cookie: hostCookie, origin },
    }).joinOrCreate("game", { gameId: created.game_id });
    rooms.push(reconnectedRoom);
    const reconnectLimited = nextMessage<CommandResult>(
      reconnectedRoom,
      "commandResult",
      (result) => !result.ok && result.error === "rate_limited",
    );
    reconnectedRoom.send("moveUnit", {});
    await expect(reconnectLimited).resolves.toMatchObject({
      error: "rate_limited",
      ok: false,
    });
    expect(service.getActions(created.game_id)).toHaveLength(0);
  });
});
