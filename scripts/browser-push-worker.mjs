import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

// Synthetic push events exercise the real installed worker, not a provider.
// The task-owned context grants notifications but never creates a subscription.
export async function checkPushWorker(origin) {
  // The minimal headless shell reports Notifications denied even when the
  // permissions API is granted. Full Chromium exercises actual notifications.
  const browser = await chromium.launch({
    channel: "chromium",
    headless: true,
  });
  try {
    const context = await browser.newContext();
    await context.grantPermissions(["notifications"], { origin });
    const page = await context.newPage();
    await page.goto(origin);
    assert.equal(await page.evaluate(() => Notification.permission), "granted");
    await page.evaluate(async () => {
      await navigator.serviceWorker.register("/push-worker.js");
      await navigator.serviceWorker.ready;
    });
    const worker = context.serviceWorkers()[0];
    assert(worker !== undefined, "Notification worker must install");
    const id = "11111111-1111-4111-8111-111111111111";
    const gameId = "22222222-2222-4222-8222-222222222222";
    const payload = { schema: 1, id, gameId, eventSequence: 12 };
    async function push(value) {
      await worker.evaluate(async (data) => {
        const event = new self.PushEvent("push", {
          data: JSON.stringify(data),
        });
        const waits = [];
        Object.defineProperty(event, "waitUntil", {
          value: (promise) => waits.push(promise),
        });
        self.dispatchEvent(event);
        await Promise.all(waits);
      }, value);
    }
    await push(payload);
    assert.equal(
      await worker.evaluate(
        async () => (await self.registration.getNotifications()).length,
      ),
      1,
    );
    // A retry replaces the existing card, while satisfying visible-push rules.
    await push(payload);
    assert.equal(
      await worker.evaluate(
        async () => (await self.registration.getNotifications()).length,
      ),
      1,
    );
    await push({ ...payload, gameId: "//evil.example" });
    assert.equal(
      await worker.evaluate(
        async () => (await self.registration.getNotifications()).length,
      ),
      1,
    );
    console.log(
      "Installed notification worker passed synthetic display/tag coalescing and unsafe-payload checks",
    );
  } finally {
    await browser.close();
  }
}
