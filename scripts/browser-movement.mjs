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
      const touch = hasTouch ? await context.newCDPSession(page) : null;
      if (touch) {
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [
            { x: from.x + from.width / 2, y: from.y + from.height / 2 },
          ],
        });
        for (let step = 1; step <= 10; step += 1) {
          await touch.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [
              {
                x:
                  from.x +
                  from.width / 2 +
                  ((to.x + to.width / 2 - from.x - from.width / 2) * step) / 10,
                y:
                  from.y +
                  from.height / 2 +
                  ((to.y + to.height / 2 - from.y - from.height / 2) * step) /
                    10,
              },
            ],
          });
        }
      } else {
        await page.mouse.move(
          from.x + from.width / 2,
          from.y + from.height / 2,
        );
        await page.mouse.down();
        await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
          steps: 10,
        });
      }
      await page.getByText(/1 of 1 movement points to F3/).waitFor();
      assert.equal(
        await page.locator(".movement-route text").textContent(),
        "1 / 1",
      );
      // The pointer is still held: locator screenshots can scroll the target
      // and wait indefinitely for actionability during the captured drag.
      // Capture the page without moving it; the route assertions above prove
      // the pending preview before we release the actual mouse/touch input.
      await page.screenshot({
        fullPage: true,
        path: resolve(evidence, `${name}-weighted-drag.png`),
      });
      if (touch) {
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        await touch.detach();
      } else await page.mouse.up();
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
      await fixture("continuation");
      await selectTarget("F3");
      await state().filter({ hasText: "v1: a=F3, g=F3, b=F5" }).waitFor();

      await fixture("group");
      if (hasTouch) await counter().tap();
      else await counter().press("Enter");
      const pair = page.getByRole("radio", {
        name: "Fixture infantry + Fixture general (2 movement remaining)",
      });
      assert.equal(
        await page.getByRole("radio", { name: /Stationary friend/ }).count(),
        0,
      );
      if (hasTouch) await pair.tap();
      else {
        await pair.press("Space");
        assert.equal(
          await pair.evaluate((element) => element === document.activeElement),
          true,
        );
        await page.keyboard.press("ArrowUp");
        assert.equal(
          await page
            .getByRole("radio", {
              name: "Fixture infantry (1 movement remaining)",
              exact: true,
            })
            .isChecked(),
          true,
        );
        await page.keyboard.press("ArrowDown");
        assert.equal(await pair.isChecked(), true);
      }
      assert.equal(await state().innerText(), "v0: a=F5, g=F5, b=F5");
      await page
        .getByRole("region", { name: "Normal movement group" })
        .screenshot({ path: resolve(evidence, `${name}-movement-group.png`) });
      if (hasTouch) await hex("F3").tap();
      else await hex("F3").press("Enter");
      await state().filter({ hasText: "v1: a=F3, g=F3, b=F5" }).waitFor();

      await fixture("exit");
      const exiting = page.getByRole("button", {
        name: /Fixture infantry, A2, selectable/,
      });
      if (hasTouch) await exiting.tap();
      else await exiting.press("Enter");
      await choose("Leave board with selected counters");
      assert.equal(await state().innerText(), "v0: a=A2");
      await page
        .getByRole("region", { name: "Normal movement group" })
        .screenshot({ path: resolve(evidence, `${name}-normal-exit.png`) });
      await choose("Confirm permanent board exit");
      await state().filter({ hasText: "v1: a=exited" }).waitFor();

      async function retreat(kind) {
        await page.goto(origin);
        await page.evaluate(async (selected) => {
          const { mountRetreatFixture } =
            await import("/src/test/RetreatFixture.tsx");
          mountRetreatFixture(selected);
        }, kind);
        await page
          .getByRole("heading", {
            name: "Retreat test fixture - not a live game",
          })
          .waitFor();
      }
      async function choose(label) {
        const button = page.getByRole("button", { name: label, exact: true });
        if (hasTouch) await button.tap();
        else await button.press("Enter");
      }
      await retreat("chain");
      await choose("Next F4");
      await choose("Next F3");
      assert.equal(await state().innerText(), "v0: a=F5, steps=2");
      await page
        .getByRole("region", { name: "Retreat from F5" })
        .screenshot({ path: resolve(evidence, `${name}-retreat-route.png`) });
      await choose("Confirm retreat to F3");
      await state().filter({ hasText: "v1: a=F3, steps=2" }).waitFor();

      await retreat("trapped");
      await page
        .getByRole("combobox", { name: "Extra loss at F5" })
        .selectOption("a");
      await choose("Confirm one extra loss and hold");
      await state().filter({ hasText: "v1: a=F5, steps=1" }).waitFor();

      await retreat("edge");
      await page
        .getByRole("region", { name: "Retreat from A2" })
        .screenshot({ path: resolve(evidence, `${name}-retreat-edge.png`) });
      await choose("Confirm permanent retreat off board");
      await state().filter({ hasText: "v1: a=exited, steps=2" }).waitFor();

      async function advance(kind) {
        await page.goto(origin);
        await page.evaluate(async (selected) => {
          const { mountAdvanceFixture } =
            await import("/src/test/AdvanceFixture.tsx");
          mountAdvanceFixture(selected);
        }, kind);
        await page
          .getByRole("heading", {
            name: "Advance test fixture - not a live game",
          })
          .waitFor();
        await page.getByRole("button", { name: "Fit", exact: true }).click();
      }
      await advance("mixed");
      const advancingPair = page.getByRole("radio", {
        name: "Fixture infantry + Fixture general from F5",
      });
      if (hasTouch) await advancingPair.tap();
      else await advancingPair.press("Space");
      assert.equal(await state().innerText(), "v0: pending_choice");
      await page
        .getByRole("region", { name: "Advance choice" })
        .screenshot({ path: resolve(evidence, `${name}-advance-choice.png`) });
      await choose("Confirm advance to F4");
      await state().filter({ hasText: "v1: resolved" }).waitFor();
      assert.equal(
        await page
          .getByRole("status", { name: "Fixture counters" })
          .innerText(),
        "a=F5, spent=5; b=F4, spent=5; g=F4, spent=5",
      );

      await advance("blocked");
      assert.equal(
        await page.getByRole("button", { name: /Confirm advance/ }).count(),
        0,
      );
      await choose("Decline this advance");
      await state().filter({ hasText: "v1: resolved" }).waitFor();

      await advance("clear");
      const advancing = page.getByRole("button", {
        name: /Fixture artillery, F5, selectable/,
      });
      if (hasTouch) {
        await advancing.tap();
        await hex("F4").tap();
      } else {
        const start = await advancing.boundingBox();
        const end = await hex("F4").boundingBox();
        assert(start && end);
        await page.mouse.move(
          start.x + start.width / 2,
          start.y + start.height / 2,
        );
        await page.mouse.down();
        await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, {
          steps: 5,
        });
        await page
          .getByText("Release to advance to F4 for no movement cost.")
          .waitFor();
        await page.mouse.up();
      }
      await state().filter({ hasText: "v1: resolved" }).waitFor();
      assert.equal(
        await page
          .getByRole("status", { name: "Fixture counters" })
          .innerText(),
        "a=F4, spent=5",
      );
      async function turn(kind) {
        await page.goto(origin);
        await page.evaluate(async (selected) => {
          const { mountTurnFixture } =
            await import("/src/test/TurnFixture.tsx");
          mountTurnFixture(selected);
        }, kind);
        await page
          .getByRole("heading", { name: "Turn test fixture - not a live game" })
          .waitFor();
        await page.getByRole("button", { name: "Fit", exact: true }).click();
      }
      async function checkCounter(label) {
        const checkbox = page.getByRole("checkbox", {
          name: new RegExp(label),
        });
        if (hasTouch) await checkbox.tap();
        else await checkbox.press("Space");
      }
      await turn("entry");
      await checkCounter("Fixture infantry");
      await checkCounter("Fixture general");
      assert.equal(await state().innerText(), "v0: confederate movement");
      await page
        .getByRole("region", { name: "Reinforcement entry" })
        .screenshot({ path: resolve(evidence, `${name}-joint-entry.png`) });
      await choose("Enter selected at A2 (0.5 movement each)");
      await state().filter({ hasText: "v1: confederate movement" }).waitFor();
      assert.match(
        await page
          .getByRole("status", { name: "Fixture counters" })
          .innerText(),
        /^a=A2, spent=0.5; g=A2, spent=0.5;/,
      );

      await turn("blocked-entry");
      await checkCounter("Fixture infantry");
      const alternate = page
        .getByRole("button", { name: /^Enter selected/ })
        .first();
      const entryLabel = await alternate.innerText();
      const entryHex = entryLabel.match(/at ([A-W]\d+)/)?.[1];
      assert(entryHex && entryHex !== "A2");
      await choose(entryLabel);
      await state().filter({ hasText: "v1: confederate movement" }).waitFor();
      assert(
        (
          await page
            .getByRole("status", { name: "Fixture counters" })
            .innerText()
        ).startsWith(`a=${entryHex}, spent=1;`),
      );

      await turn("night");
      assert.equal(
        await page
          .getByRole("button", {
            name: "Withdraw 1 counter(s) before ending movement",
          })
          .isDisabled(),
        true,
      );
      await page.locator(".turn-summary").screenshot({
        path: resolve(evidence, `${name}-night-withdrawal.png`),
      });
      await selectTarget("F6");
      await state().filter({ hasText: "v1: confederate movement" }).waitFor();
      await choose("End movement phase");
      await state().filter({ hasText: "v2: union movement" }).waitFor();
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
  console.log(`Mandatory rules browser input checks passed: ${evidence}`);
} finally {
  clearTimeout(timeout);
  await Promise.all([browser?.close(), server.close()]);
}
