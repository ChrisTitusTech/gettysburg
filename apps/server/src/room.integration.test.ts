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
import { InMemoryAsyncGameService } from "./postgres-store.js";
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
});
