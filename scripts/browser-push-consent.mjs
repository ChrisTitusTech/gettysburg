import assert from "node:assert/strict";
import { createECDH, randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { deleteAcceptanceGame } from "./browser-cleanup.mjs";

// Browser permission/provider APIs are controlled; consent routes and seat
// authorization are real. Run only with delivery disabled, never real providers.
export async function checkPushConsent(browser, origin, evidence, options) {
  const response = await fetch(
    `${options.configOrigin ?? origin}/api/push-config`,
    {
      signal: AbortSignal.timeout(15_000),
    },
  );
  assert.equal(response.status, 200, "Push configuration must be available");
  const config = await response.json();
  if (config.enabled === true) {
    console.log(
      "Synthetic push consent skipped: provider delivery is enabled; real provider/device acceptance remains required",
    );
    return;
  }
  assert.equal(
    config.enabled,
    false,
    "Synthetic consent fixture requires disabled provider delivery",
  );
  const hostContext = await browser.newContext({
    ...options.contextOptions,
    viewport: options.viewport,
  });
  const guestContext = await browser.newContext({
    ...options.contextOptions,
    viewport: options.viewport,
  });
  let host;
  let failure;
  function recordFailure(error) {
    failure =
      failure === undefined
        ? error
        : new AggregateError(
            [failure, error],
            "Consent acceptance and cleanup failed",
          );
  }
  try {
    for (const context of [hostContext, guestContext]) {
      const keys = createECDH("prime256v1");
      const subscription = {
        endpoint: `https://fcm.googleapis.com/gettysburg-acceptance/${randomUUID()}`,
        expirationTime: null,
        keys: {
          auth: randomBytes(16).toString("base64url"),
          p256dh: keys.generateKeys().toString("base64url"),
        },
      };
      await context.route("**/api/push-config", (route) =>
        route.fulfill({
          json: { enabled: true, applicationServerKey: "AQIDBA" },
        }),
      );
      await context.addInitScript((data) => {
        window.__pushRequests = 0;
        Object.defineProperty(window, "Notification", {
          configurable: true,
          value: {
            permission: "default",
            requestPermission: async () => {
              window.__pushRequests += 1;
              return "granted";
            },
          },
        });
        Object.defineProperty(window, "PushManager", {
          configurable: true,
          value: class {},
        });
        Object.defineProperty(navigator, "serviceWorker", {
          configurable: true,
          value: {
            ready: Promise.resolve({}),
            register: async () => ({
              pushManager: {
                getSubscription: async () => null,
                subscribe: async () => ({ toJSON: () => data }),
              },
            }),
          },
        });
      }, subscription);
    }
    host = await hostContext.newPage();
    const guest = await guestContext.newPage();
    await host.goto(origin);
    await host.getByRole("button", { name: "Host as Confederate" }).click();
    await guest.goto(
      await host.getByLabel("One-time invitation URL").inputValue(),
    );
    await guest.getByRole("button", { name: "Claim seat" }).click();
    for (const page of [host, guest]) {
      await page.getByText("connected", { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => window.__pushRequests), 0);
    }
    const gameId = new URL(host.url()).pathname.split("/").at(-1);
    const endpoint = `${origin}/api/games/${gameId}/push-subscription`;
    async function readStatus(page) {
      return page.evaluate(async (url) => {
        const response = await fetch(url, { credentials: "same-origin" });
        return { status: response.status, body: await response.json() };
      }, endpoint);
    }
    await host.getByRole("button", { name: "Enable in this browser" }).click();
    await host
      .getByText("Notifications enabled in this browser for this seat.")
      .waitFor();
    assert.equal((await readStatus(host)).body.enabled, true);
    assert.equal((await readStatus(guest)).body.enabled, false);
    await host.reload();
    await host
      .getByText(/Enabled for this seat, possibly in another browser/)
      .waitFor();
    assert.equal(await host.evaluate(() => window.__pushRequests), 0);
    await host.getByRole("button", { name: "Turn off for this seat" }).click();
    await host.getByText("Notifications turned off for this seat.").waitFor();
    assert.equal((await readStatus(host)).body.enabled, false);
    await guest.getByRole("button", { name: "Enable in this browser" }).click();
    await guest
      .getByText("Notifications enabled in this browser for this seat.")
      .waitFor();
    await guest.getByRole("region", { name: "Turn notifications" }).screenshot({
      path: resolve(evidence, `${options.label}-push-consent.png`),
    });
    guest.once("dialog", (dialog) => dialog.accept());
    await guest.getByRole("button", { name: "Surrender seat" }).click();
    await guest.waitForURL(`${origin}/`);
    await guest
      .getByRole("region", { name: "Turn notifications" })
      .waitFor({ state: "detached" });
    assert.equal(
      await guest.getByRole("region", { name: "Turn notifications" }).count(),
      0,
    );
    assert.equal((await readStatus(guest)).status, 401);
    await deleteAcceptanceGame(host);
  } catch (error) {
    recordFailure(error);
  } finally {
    try {
      // A failed join must not abandon a created game when contexts close.
      // Successful cleanup navigates home, so it is not repeated here.
      if (
        host &&
        /^\/game\/[0-9a-f-]{36}$/.test(new URL(host.url()).pathname)
      ) {
        await deleteAcceptanceGame(host);
      }
    } catch (error) {
      recordFailure(error);
    } finally {
      const closed = await Promise.allSettled([
        hostContext.close(),
        guestContext.close(),
      ]);
      for (const result of closed)
        if (result.status === "rejected") recordFailure(result.reason);
    }
  }
  if (failure !== undefined) throw failure;
}
