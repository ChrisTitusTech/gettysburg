import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { Client as ColyseusClient } from "@colyseus/sdk";

const origin = process.argv[2];
assert.match(origin ?? "", /^https:\/\/[A-Za-z0-9.-]+$/);

function cookieFrom(response) {
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  assert(cookie, "The public API did not return a session cookie");
  return cookie;
}

function nextMessage(room, type, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timed out waiting for public ${type}`));
    }, 10_000);
    const unsubscribe = room.onMessage(type, (message) => {
      if (!predicate(message)) return;
      clearTimeout(timeout);
      unsubscribe();
      resolve(message);
    });
  });
}

const pageResponse = await fetch(origin, {
  signal: AbortSignal.timeout(15_000),
});
assert.equal(pageResponse.status, 200);
assert.match(await pageResponse.text(), /<div id="root"><\/div>/);

const createResponse = await fetch(`${origin}/api/games`, {
  body: JSON.stringify({ seat: "confederate" }),
  headers: { "content-type": "application/json" },
  method: "POST",
  signal: AbortSignal.timeout(15_000),
});
assert.equal(createResponse.status, 201);
const hostCookie = cookieFrom(createResponse);
const created = await createResponse.json();

const claimResponse = await fetch(
  `${origin}/api/invitations/${created.invitation.lookup_id}/claim`,
  {
    body: JSON.stringify({
      claim_id: randomUUID(),
      secret: created.invitation.secret,
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
    signal: AbortSignal.timeout(15_000),
  },
);
assert.equal(claimResponse.status, 200);
const guestCookie = cookieFrom(claimResponse);

const hostRoom = await new ColyseusClient(origin, {
  headers: { cookie: hostCookie, origin },
}).joinOrCreate("game", { gameId: created.game_id });
const guestRoom = await new ColyseusClient(origin, {
  headers: { cookie: guestCookie, origin },
}).joinOrCreate("game", { gameId: created.game_id });

async function deleteSmokeGame() {
  const resumeResponse = await fetch(`${origin}/api/games/${created.game_id}`, {
    headers: { cookie: hostCookie },
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(resumeResponse.status, 200);
  const session = await resumeResponse.json();
  const deleteResponse = await fetch(
    `${origin}/api/games/${created.game_id}/host-commands`,
    {
      body: JSON.stringify({
        command_id: randomUUID(),
        command_name: "deleteGame",
        expected_version: session.state.version,
        game_id: created.game_id,
        payload: { confirm: true },
        schema: "gettysburg-command/v1",
      }),
      headers: {
        "content-type": "application/json",
        cookie: hostCookie,
      },
      method: "POST",
      signal: AbortSignal.timeout(15_000),
    },
  );
  assert.equal(deleteResponse.status, 200);
  assert.equal((await deleteResponse.json()).ok, true);
}

try {
  assert.equal(guestRoom.roomId, hostRoom.roomId);
  const synchronized = nextMessage(
    hostRoom,
    "snapshot",
    (state) => state.version === 1,
  );
  guestRoom.send("moveUnit", {
    command_id: randomUUID(),
    command_name: "moveUnit",
    expected_version: 0,
    game_id: created.game_id,
    payload: { destination: "E3", unit_id: "u-wadsworth" },
    schema: "gettysburg-command/v1",
  });
  const state = await synchronized;
  assert.equal(state.units["u-wadsworth"].location, "E3");

  const resumeResponse = await fetch(`${origin}/api/games/${created.game_id}`, {
    headers: { cookie: guestCookie },
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(resumeResponse.status, 200);
  assert.equal((await resumeResponse.json()).state.version, 1);
} finally {
  try {
    await Promise.all([hostRoom.leave(true), guestRoom.leave(true)]);
  } finally {
    await deleteSmokeGame();
  }
}

process.stdout.write(`Public two-client smoke passed for ${created.game_id}\n`);
