import assert from "node:assert/strict";
import test from "node:test";

import { deleteAcceptanceGame } from "./browser-cleanup.mjs";

const origin = "https://gettysburg.example";
const gameId = "11111111-1111-4111-8111-111111111111";
const endpoint = `${origin}/api/games/${gameId}`;

function fixture(options = {}) {
  const events = [];
  const response = {
    url: () => `${endpoint}/host-commands`,
    request: () => ({
      method: () => "POST",
      postDataJSON: () => ({ command_name: "deleteGame" }),
    }),
    status: () => options.deleteStatus ?? 200,
    json: async () => ({ ok: options.ok ?? true }),
  };
  const page = {
    url: () => `${origin}/game/${gameId}`,
    once: (name, handler) => {
      assert.equal(name, "dialog");
      handler({ accept: () => events.push("confirmed") });
    },
    waitForResponse: async (predicate) => {
      events.push("listening");
      assert.equal(
        predicate({ ...response, url: () => `${origin}/other` }),
        false,
      );
      assert.equal(predicate(response), true);
      await options.gate;
      events.push("response");
      return response;
    },
    getByRole: (role, options) => {
      assert.equal(role, "button");
      assert.equal(options.name, "Delete game");
      return { click: async () => events.push("clicked") };
    },
    waitForURL: async (url) => {
      assert.equal(url, `${origin}/`);
      events.push("home");
    },
    context: () => ({
      request: {
        get: async (url) => {
          assert.equal(url, endpoint);
          events.push("read-back");
          return {
            status: () => options.resumeStatus ?? 410,
            json: async () => ({
              error: options.resumeError ?? "game_deleted",
            }),
          };
        },
      },
    }),
  };
  return { page, events };
}

test("waits for the deletion response and committed read-back", async () => {
  const { promise, resolve } = Promise.withResolvers();
  const { page, events } = fixture({ gate: promise });
  let finished = false;
  const cleanup = deleteAcceptanceGame(page).then(() => (finished = true));
  await new Promise(setImmediate);
  assert.equal(finished, false);
  assert.deepEqual(events, ["confirmed", "listening", "clicked"]);
  resolve();
  await cleanup;
  assert.deepEqual(events.slice(-3), ["response", "home", "read-back"]);
});

test("fails closed on deletion or read-back failure", async (context) => {
  for (const options of [
    { deleteStatus: 500 },
    { ok: false },
    { resumeStatus: 200 },
    { resumeError: "unauthorized" },
  ]) {
    await context.test(JSON.stringify(options), async () => {
      await assert.rejects(deleteAcceptanceGame(fixture(options).page));
    });
  }
});
