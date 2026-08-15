import { randomUUID } from "node:crypto";
import { createServer, type AddressInfo } from "node:net";

import {
  Client as ColyseusClient,
  type Room as ClientRoom,
} from "@colyseus/sdk";
import {
  COMMAND_SCHEMA_VERSION,
  type CommandResult,
  type GameState,
} from "@gettysburg/game";
import { afterEach, describe, expect, it } from "vitest";

import { InMemoryGameService } from "./game-service.js";
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
    await Promise.all(rooms.splice(0).map((room) => room.leave(true)));
    if (server !== undefined) {
      await server.gracefullyShutdown(false);
      server = undefined;
    }
  });

  it("synchronizes two seats, rejects bad commands, and resumes latest state", async () => {
    const service = new InMemoryGameService();
    const port = await reservePort();
    const origin = `http://127.0.0.1:${port}`;
    server = createGettysburgServer({
      gameService: service,
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

    const commandId = randomUUID();
    const hostSnapshot = nextMessage<GameState>(
      hostRoom,
      "snapshot",
      (state) => state.version === 1,
    );
    const guestSnapshot = nextMessage<GameState>(
      guestRoom,
      "snapshot",
      (state) => state.version === 1,
    );
    hostRoom.send("moveUnit", {
      command_id: commandId,
      command_name: "moveUnit",
      expected_version: 0,
      game_id: created.game_id,
      payload: {
        destination: "G5",
        unit_id: "fixture-confederate-1",
      },
      schema: COMMAND_SCHEMA_VERSION,
    });

    await expect(hostSnapshot).resolves.toMatchObject({
      units: { "fixture-confederate-1": { location: "G5" } },
      version: 1,
    });
    await expect(guestSnapshot).resolves.toMatchObject({
      units: { "fixture-confederate-1": { location: "G5" } },
      version: 1,
    });

    const wrongSeat = nextMessage<CommandResult>(guestRoom, "commandResult");
    guestRoom.send("moveUnit", {
      command_id: randomUUID(),
      command_name: "moveUnit",
      expected_version: 1,
      game_id: created.game_id,
      payload: {
        destination: "H5",
        unit_id: "fixture-confederate-1",
      },
      schema: COMMAND_SCHEMA_VERSION,
    });
    await expect(wrongSeat).resolves.toMatchObject({
      error: "wrong_seat",
      ok: false,
    });

    const stale = nextMessage<CommandResult>(guestRoom, "commandResult");
    guestRoom.send("moveUnit", {
      command_id: randomUUID(),
      command_name: "moveUnit",
      expected_version: 0,
      game_id: created.game_id,
      payload: { destination: "Q7", unit_id: "fixture-union-1" },
      schema: COMMAND_SCHEMA_VERSION,
    });
    await expect(stale).resolves.toMatchObject({
      current_version: 1,
      error: "stale_version",
      ok: false,
    });

    const duplicate = nextMessage<CommandResult>(hostRoom, "commandResult");
    hostRoom.send("moveUnit", {
      command_id: commandId,
      command_name: "moveUnit",
      expected_version: 0,
      game_id: created.game_id,
      payload: {
        destination: "G5",
        unit_id: "fixture-confederate-1",
      },
      schema: COMMAND_SCHEMA_VERSION,
    });
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
      payload: { destination: "Q7", unit_id: "fixture-union-1" },
      schema: COMMAND_SCHEMA_VERSION,
    });
    await expect(resumedSnapshot).resolves.toMatchObject({
      units: { "fixture-union-1": { location: "Q7" } },
      version: 2,
    });

    await expect(
      new ColyseusClient(origin, {
        headers: { cookie: guestCookie, origin: "https://evil.example" },
      }).joinOrCreate("game", { gameId: created.game_id }),
    ).rejects.toThrow();
  });
});
