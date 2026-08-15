import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";

import { chromium } from "@playwright/test";

const evidenceDirectory = resolve(
  process.env.GETTYSBURG_EVIDENCE_DIR ?? "test-results/phase-1",
);

async function reservePort() {
  const server = createServer();
  await new Promise((resolveListening, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListening);
  });
  const address = server.address();
  assert(address !== null && typeof address !== "string");
  await new Promise((resolveClose, reject) =>
    server.close((error) =>
      error === undefined ? resolveClose() : reject(error),
    ),
  );
  return address.port;
}

async function waitForReadiness(origin, serverOutput) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/readyz`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) return;
    } catch {
      // The process may still be starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  throw new Error(`Browser server did not become ready:\n${serverOutput()}`);
}

async function stopServer(server) {
  if (server.exitCode !== null) {
    assert.equal(server.exitCode, 0);
    return;
  }
  server.kill("SIGTERM");
  const exitCode = await new Promise((resolveExit, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Browser server did not stop")),
      10_000,
    );
    server.once("exit", (code) => {
      clearTimeout(timeout);
      resolveExit(code);
    });
  });
  assert.equal(exitCode, 0);
}

function watchPage(page, issues) {
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      issues.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => issues.push(`pageerror: ${error.message}`));
}

async function waitForVersion(page, version) {
  await page.getByText(`v${version}`, { exact: true }).first().waitFor();
}

async function captureBoardViews(page, prefix) {
  const board = page.locator(".board-workspace");
  await page.getByRole("button", { name: "Zoom out" }).click();
  await page.getByText("65%", { exact: true }).waitFor();
  await board.screenshot({
    path: resolve(evidenceDirectory, `${prefix}-minimum.png`),
  });

  await page.getByRole("button", { name: "Fit" }).click();
  await page.getByText("100%", { exact: true }).waitFor();
  await board.screenshot({
    path: resolve(evidenceDirectory, `${prefix}-fit.png`),
  });

  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByText("170%", { exact: true }).waitFor();
  await board.screenshot({
    path: resolve(evidenceDirectory, `${prefix}-zoomed.png`),
  });
}

async function selectAndMove(page, counterName, destination, inputMode) {
  const counter = page.getByRole("button", { name: counterName });
  if (inputMode === "touch") {
    await counter.tap();
    await page.getByLabel("Destination coordinate").fill(destination);
    await page.getByRole("button", { name: "Move" }).tap();
    return;
  }

  await counter.focus();
  await page.keyboard.press("Enter");
  await page.getByLabel("Destination coordinate").fill(destination);
  await page.getByLabel("Destination coordinate").press("Enter");
}

async function runScenario(browser, origin, options) {
  const issues = [];
  const contextOptions = {
    hasTouch: options.inputMode === "touch",
    viewport: options.viewport,
  };
  const hostContext = await browser.newContext(contextOptions);
  let opponentContext = await browser.newContext(contextOptions);
  const hostPage = await hostContext.newPage();
  let opponentPage = await opponentContext.newPage();
  watchPage(hostPage, issues);
  watchPage(opponentPage, issues);

  try {
    await hostPage.goto(origin);
    await hostPage
      .getByRole("button", { name: `Host as ${options.hostName}` })
      .click();
    const invitation = await hostPage
      .getByLabel("One-time invitation URL")
      .inputValue();
    assert.match(invitation, /\/join\/[0-9a-f-]{36}#[A-Za-z0-9_-]{43}$/);

    await opponentPage.goto(invitation);
    await opponentPage.getByRole("button", { name: "Claim seat" }).waitFor();
    assert.equal(new URL(opponentPage.url()).hash, "");
    await opponentPage.getByRole("button", { name: "Claim seat" }).click();
    await opponentPage.getByText("connected", { exact: true }).waitFor();
    assert.equal(
      await opponentPage.getByRole("definition").first().innerText(),
      options.opponentName,
    );

    const replayContext = await browser.newContext(contextOptions);
    const replayPage = await replayContext.newPage();
    await replayPage.goto(invitation);
    await replayPage.getByRole("button", { name: "Claim seat" }).click();
    await replayPage.getByText(/already used/i).waitFor();
    await replayContext.close();

    await selectAndMove(
      hostPage,
      new RegExp(
        `${options.hostName} fixture counter, ${options.hostStart}, selectable`,
      ),
      options.hostDestination,
      options.inputMode,
    );
    await waitForVersion(hostPage, 1);
    await waitForVersion(opponentPage, 1);
    await opponentPage
      .getByRole("button", {
        name: new RegExp(
          `${options.hostName} fixture counter, ${options.hostDestination}`,
        ),
      })
      .waitFor();

    await opponentPage
      .getByRole("button", {
        name: new RegExp(
          `${options.opponentName} fixture counter, ${options.opponentStart}, selectable`,
        ),
      })
      .click();
    await opponentPage
      .getByLabel("Destination coordinate")
      .fill(options.hostDestination);
    await opponentPage.getByRole("button", { name: "Move" }).click();
    await opponentPage.getByText(/occupied/i).waitFor();
    await waitForVersion(opponentPage, 1);

    const opponentGameUrl = opponentPage.url();
    const restartState = await opponentContext.storageState();
    await opponentContext.close();
    opponentContext = await browser.newContext({
      ...contextOptions,
      storageState: restartState,
    });
    opponentPage = await opponentContext.newPage();
    watchPage(opponentPage, issues);
    await opponentPage.goto(opponentGameUrl);
    await opponentPage.getByText("connected", { exact: true }).waitFor();
    await waitForVersion(opponentPage, 1);
    await opponentPage.getByText(/moved to/).waitFor();

    await selectAndMove(
      opponentPage,
      new RegExp(
        `${options.opponentName} fixture counter, ${options.opponentStart}, selectable`,
      ),
      options.opponentDestination,
      options.inputMode,
    );
    await waitForVersion(opponentPage, 2);
    await waitForVersion(hostPage, 2);
    await hostPage
      .getByRole("button", {
        name: new RegExp(
          `${options.opponentName} fixture counter, ${options.opponentDestination}`,
        ),
      })
      .waitFor();

    await captureBoardViews(hostPage, options.label);
    assert.deepEqual(issues, []);
  } finally {
    await hostContext.close();
    await opponentContext.close();
  }
}

await mkdir(evidenceDirectory, { recursive: true });
const port = await reservePort();
const origin = `http://127.0.0.1:${port}`;
let output = "";
const server = spawn(process.execPath, ["apps/server/dist/index.js"], {
  env: {
    ...process.env,
    GETTYSBURG_SERVER_HOST: "127.0.0.1",
    GETTYSBURG_SERVER_PORT: String(port),
    GETTYSBURG_TRUSTED_ORIGIN: origin,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", (chunk) => (output += String(chunk)));
server.stderr.on("data", (chunk) => (output += String(chunk)));

let browser;
try {
  await waitForReadiness(origin, () => output);
  browser = await chromium.launch({ headless: true });
  await runScenario(browser, origin, {
    hostDestination: "G5",
    hostName: "Confederate",
    hostStart: "F5",
    inputMode: "keyboard",
    label: "desktop",
    opponentDestination: "Q7",
    opponentName: "Union",
    opponentStart: "P7",
    viewport: { height: 900, width: 1440 },
  });
  await runScenario(browser, origin, {
    hostDestination: "Q7",
    hostName: "Union",
    hostStart: "P7",
    inputMode: "touch",
    label: "tablet",
    opponentDestination: "G5",
    opponentName: "Confederate",
    opponentStart: "F5",
    viewport: { height: 768, width: 1024 },
  });
  console.log(
    `Browser acceptance passed at desktop and tablet widths; evidence: ${evidenceDirectory}`,
  );
} finally {
  await browser?.close();
  await stopServer(server);
}
