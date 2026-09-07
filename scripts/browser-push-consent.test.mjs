import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { checkPushConsent } from "./browser-push-consent.mjs";

async function withConfig(status, config, run) {
  const server = createServer((_request, response) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(config));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test("enabled delivery skips synthetic subscriptions before browser mutation", async () => {
  await withConfig(200, { enabled: true }, async (origin) => {
    // No browser methods exist: any attempt to create contexts would fail.
    await checkPushConsent({}, origin, "unused", {});
  });
});

test("unavailable or malformed configuration fails before synthetic subscriptions", async () => {
  for (const [status, config] of [
    [503, {}],
    [200, {}],
  ]) {
    await withConfig(status, config, async (origin) => {
      await assert.rejects(checkPushConsent({}, origin, "unused", {}), {
        name: "AssertionError",
      });
    });
  }
});

test("disabled delivery still runs the controlled browser fixture", async () => {
  await withConfig(200, { enabled: false }, async (origin) => {
    const sentinel = new Error("fixture reached");
    await assert.rejects(
      checkPushConsent(
        {
          newContext: () => {
            throw sentinel;
          },
        },
        origin,
        "unused",
        {},
      ),
      (error) => error === sentinel,
    );
  });
});
