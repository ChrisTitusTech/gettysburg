import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const requireWeb = createRequire(
  new URL("../apps/web/package.json", import.meta.url),
);
const { createServer } = await import(requireWeb.resolve("vite"));
const evidence = resolve(
  process.env.GETTYSBURG_EVIDENCE_DIR ??
    "test-results/mandatory-movement-preview",
);
await mkdir(evidence, { recursive: true });
const server = await createServer({
  root: resolve("apps/web"),
  configFile: resolve("apps/web/vite.config.ts"),
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0, strictPort: true },
});
let browser;
const timeout = setTimeout(() => {
  console.error("Movement browser check exceeded 90 seconds");
  process.exitCode = 1;
  void browser?.close().catch((error) => console.error(error.message));
  void server.close().catch((error) => console.error(error.message));
}, 90_000);
try {
  await server.listen();
  const address = server.httpServer.address();
  assert(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });
  for (const [name, viewport, hasTouch] of [
    ["desktop", { width: 1440, height: 900 }, false],
    ["tablet", { width: 1024, height: 768 }, true],
  ]) {
    const context = await browser.newContext({ viewport, hasTouch });
    try {
      const page = await context.newPage();
      const issues = [];
      page.on("pageerror", (error) => issues.push(error.message));
      page.on("console", (message) => {
        if (["error", "warning"].includes(message.type()))
          issues.push(message.text());
      });
      async function fixture(kind) {
        await page.goto(origin);
        await page.evaluate(async (selected) => {
          const { mountMovementFixture } =
            await import("/src/test/MovementFixture.tsx");
          mountMovementFixture(selected);
        }, kind);
        await page
          .getByRole("heading", {
            name: "Movement test fixture - not a live game",
          })
          .waitFor();
        await page.getByRole("button", { name: "Fit", exact: true }).click();
      }
      const counter = () =>
        page.getByRole("button", { name: /Fixture infantry, F5, selectable/ });
      const hex = (coordinate) =>
        page.locator(`[data-coordinate="${coordinate}"]`);
      const state = () => page.getByRole("status", { name: "Fixture state" });
      async function selectTarget(destination) {
        if (hasTouch) {
          await counter().tap();
          await hex(destination).tap();
        } else {
          await counter().press("Enter");
          await hex(destination).press("Enter");
        }
      }
      await fixture("roads");
      await selectTarget("F3");
      await state().filter({ hasText: "v1: a=F3" }).waitFor();
      await page
        .locator(".board-workspace")
        .screenshot({ path: resolve(evidence, `${name}-weighted-move.png`) });

      await fixture("roads");
      await counter().scrollIntoViewIfNeeded();
      const from = await counter().boundingBox();
      const to = await hex("F2").boundingBox();
      assert(from && to);
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
        steps: 10,
      });
      await page.getByText(/1 of 1 movement points to F3/).waitFor();
      await page
        .locator(".board-workspace")
        .screenshot({ path: resolve(evidence, `${name}-weighted-drag.png`) });
      await page.mouse.up();
      await state().filter({ hasText: "v1: a=F3" }).waitFor();

      await fixture("woods");
      await selectTarget("F4");
      await page
        .getByText(/F4 requires 2 movement; this group has 1 remaining/)
        .waitFor();
      assert.equal(await state().innerText(), "v0: a=F5");
      await page
        .locator(".board-workspace")
        .screenshot({ path: resolve(evidence, `${name}-woods-rejected.png`) });

      await fixture("activation");
      await selectTarget("F4");
      await page.getByText(/That unit\/stack move has ended/).waitFor();
      assert.equal(await state().innerText(), "v0: a=F5");

      await fixture("bonus");
      await selectTarget("F3");
      await state().filter({ hasText: "v1: a=F3, g=F3" }).waitFor();
      assert.deepEqual(issues, []);
    } finally {
      await context.close();
    }
  }
  assert.equal(
    process.exitCode ?? 0,
    0,
    "The browser deadline must not expire",
  );
  console.log(
    `Mandatory movement mouse/keyboard/touch checks passed: ${evidence}`,
  );
} finally {
  clearTimeout(timeout);
  await Promise.all([browser?.close(), server.close()]);
}
