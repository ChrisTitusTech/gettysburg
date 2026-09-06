import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { chromium } from "@playwright/test";

import { startPostgres } from "./postgres-test-service.mjs";

const evidenceDirectory = resolve(
  process.env.GETTYSBURG_EVIDENCE_DIR ?? "test-results/phase-2",
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

async function stopServer(server, serverOutput) {
  if (server.exitCode !== null || server.signalCode !== null) {
    if (server.exitCode !== 0) {
      throw new Error(
        `Browser server exited before cleanup with code ${String(server.exitCode)} and signal ${String(server.signalCode)}:\n${serverOutput()}`,
      );
    }
    return;
  }
  let escalated = false;
  const exitCode = await new Promise((resolveExit) => {
    const timeout = setTimeout(() => {
      escalated = true;
      server.kill("SIGKILL");
    }, 10_000);
    server.once("exit", (code) => {
      clearTimeout(timeout);
      resolveExit(code);
    });
    server.kill("SIGTERM");
  });
  if (escalated) {
    console.error("Browser server required SIGKILL during cleanup");
    process.exitCode = 1;
  } else {
    assert.equal(exitCode, 0);
  }
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
  try {
    await page.getByText(`v${version}`, { exact: true }).first().waitFor();
  } catch (error) {
    const pageText = (await page.locator("body").innerText()).slice(0, 4_000);
    throw new Error(
      `Timed out waiting for v${version}; visible page text:\n${pageText}`,
      { cause: error },
    );
  }
}

async function captureBoardViews(page, prefix) {
  const board = page.locator(".board-workspace");
  await page.getByRole("button", { name: "Fit" }).click();
  await page.getByText("100%", { exact: true }).waitFor();
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
  const target = page.locator(`[data-coordinate="${destination}"]`);
  if (inputMode === "touch") {
    await counter.tap();
    await target.tap();
    return;
  }

  await counter.focus();
  await page.keyboard.press("Enter");
  await target.click();
}

async function dragWithinMovement(page, prefix) {
  const counter = page.getByRole("button", {
    name: /Wadsworth, F3, selectable/,
  });
  const target = page.locator('[data-coordinate="F8"]');
  const startBox = await counter.boundingBox();
  const targetBox = await target.boundingBox();
  assert(startBox !== null);
  assert(targetBox !== null);
  await page.mouse.move(
    startBox.x + startBox.width / 2,
    startBox.y + startBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
    { steps: 10 },
  );
  await page.locator(".movement-route").getByText("3 / 3").waitFor();
  await page.locator(".board-workspace").screenshot({
    path: resolve(evidenceDirectory, `${prefix}-movement-route.png`),
  });
  await page.mouse.up();
}

async function ctrlSelectSingleCounter(page) {
  const counter = page.getByRole("button", {
    name: /Reynolds, F6, selectable/,
  });
  await counter.focus();
  await page.keyboard.press("Control+Enter");
  await page.locator('[data-coordinate="G6"]').click();
}

async function runScenario(browser, origin, options) {
  const issues = [];
  const contextOptions = {
    hasTouch: options.inputMode === "touch",
    viewport: options.viewport,
  };
  const hostContext = await browser.newContext(contextOptions);
  let opponentContext = await browser.newContext(contextOptions);
  let restartedUnionContext;
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
    await hostPage.reload();
    await hostPage.getByText("connected", { exact: true }).waitFor();
    await hostPage
      .getByRole("button", { exact: true, name: "Revoke" })
      .waitFor();

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

    const confederatePage =
      options.hostName === "Confederate" ? hostPage : opponentPage;
    let unionPage = options.hostName === "Union" ? hostPage : opponentPage;

    await selectAndMove(
      unionPage,
      /Wadsworth, D3, selectable/,
      "E3",
      options.inputMode,
    );
    await waitForVersion(unionPage, 1);
    await waitForVersion(confederatePage, 1);
    await confederatePage
      .getByRole("button", {
        name: /Wadsworth, E3/,
      })
      .waitFor();

    await unionPage
      .getByRole("button", {
        name: /Wadsworth, E3, selectable/,
      })
      .click();
    await unionPage.locator('[data-coordinate="U11"]').click();
    await unionPage.getByText(/has 4 movement remaining/i).waitFor();
    await waitForVersion(unionPage, 1);

    const unionGameUrl = unionPage.url();
    const unionContext =
      options.hostName === "Union" ? hostContext : opponentContext;
    const restartState = await unionContext.storageState();
    if (options.hostName === "Union") {
      await hostContext.close();
    } else {
      await opponentContext.close();
    }
    restartedUnionContext = await browser.newContext({
      ...contextOptions,
      storageState: restartState,
    });
    if (options.hostName !== "Union") opponentContext = restartedUnionContext;
    unionPage = await restartedUnionContext.newPage();
    watchPage(unionPage, issues);
    await unionPage.goto(unionGameUrl);
    await unionPage.getByText("connected", { exact: true }).waitFor();
    await waitForVersion(unionPage, 1);
    await unionPage.getByText(/2 stacked counters moved to E3/).waitFor();

    await selectAndMove(
      unionPage,
      /Wadsworth, E3, selectable/,
      "F3",
      options.inputMode,
    );
    await waitForVersion(unionPage, 2);
    await waitForVersion(confederatePage, 2);
    await confederatePage
      .getByRole("button", {
        name: /Wadsworth, F3/,
      })
      .waitFor();

    await dragWithinMovement(unionPage, options.label);
    await waitForVersion(unionPage, 3);
    await waitForVersion(confederatePage, 3);
    await confederatePage
      .getByRole("button", {
        name: /Wadsworth, F6/,
      })
      .waitFor();

    await captureBoardViews(confederatePage, options.label);
    if (options.inputMode === "keyboard") {
      await ctrlSelectSingleCounter(unionPage);
      await waitForVersion(unionPage, 4);
      await waitForVersion(confederatePage, 4);
      await confederatePage
        .getByRole("button", { name: /Wadsworth, F6/ })
        .waitFor();
      await confederatePage
        .getByRole("button", { name: /Reynolds, G6/ })
        .waitFor();
    }
    const cleanupHostPage = options.hostName === "Union" ? unionPage : hostPage;
    cleanupHostPage.once("dialog", (dialog) => dialog.accept());
    await cleanupHostPage
      .getByRole("button", { name: "Surrender seat" })
      .click();
    await cleanupHostPage
      .getByRole("heading", { name: "Host controls recovered" })
      .waitFor();
    cleanupHostPage.once("dialog", (dialog) => dialog.accept());
    await cleanupHostPage.getByRole("button", { name: "Delete game" }).click();
    await cleanupHostPage
      .getByRole("heading", { name: "Gettysburg" })
      .waitFor();
    assert.deepEqual(issues, []);
  } catch (error) {
    throw new Error(
      `${options.label} browser scenario failed${issues.length === 0 ? "" : `; browser issues: ${issues.join(" | ")}`}`,
      { cause: error },
    );
  } finally {
    await restartedUnionContext?.close().catch(() => {});
    await hostContext.close().catch(() => {});
    await opponentContext.close().catch(() => {});
  }
}

async function runFullGame(browser, origin) {
  const issues = [];
  const contextOptions = { viewport: { height: 900, width: 1440 } };
  const unionContext = await browser.newContext(contextOptions);
  const confederateContext = await browser.newContext(contextOptions);
  const unionPage = await unionContext.newPage();
  const confederatePage = await confederateContext.newPage();
  watchPage(unionPage, issues);
  watchPage(confederatePage, issues);

  try {
    await unionPage.goto(origin);
    await unionPage.getByRole("button", { name: "Host as Union" }).click();
    const invitation = await unionPage
      .getByLabel("One-time invitation URL")
      .inputValue();
    await confederatePage.goto(invitation);
    await confederatePage.getByRole("button", { name: "Claim seat" }).click();
    await Promise.all(
      [unionPage, confederatePage].map((page) =>
        page.getByText("connected", { exact: true }).waitFor(),
      ),
    );

    for (let version = 1; version <= 47; version += 1) {
      const activePage = version % 2 === 1 ? unionPage : confederatePage;
      await activePage
        .getByRole("button", { name: /^End (movement|combat) phase$/ })
        .click();
      await Promise.all(
        [unionPage, confederatePage].map((page) =>
          waitForVersion(page, version),
        ),
      );
    }

    await Promise.all(
      [unionPage, confederatePage].map((page) =>
        page.getByRole("heading", { name: /Turn 24 · completed/ }).waitFor(),
      ),
    );
    await unionPage.locator("main").screenshot({
      path: resolve(evidenceDirectory, "live-full-game-complete.png"),
    });
    unionPage.once("dialog", (dialog) => dialog.accept());
    await unionPage.getByRole("button", { name: "Delete game" }).click();
    await unionPage.getByRole("heading", { name: "Gettysburg" }).waitFor();
    assert.deepEqual(issues, []);
  } finally {
    await unionContext.close().catch(() => {});
    await confederateContext.close().catch(() => {});
  }
}

await mkdir(evidenceDirectory, { recursive: true });
const configuredOrigin = process.env.GETTYSBURG_ACCEPTANCE_ORIGIN;
const port = configuredOrigin === undefined ? await reservePort() : undefined;
const origin = configuredOrigin ?? `http://127.0.0.1:${port}`;
let output = "";
let postgres;
let runtimeDirectory;
let server;
let browser;
let failure;
try {
  if (configuredOrigin === undefined) {
    postgres = await startPostgres();
    runtimeDirectory = await mkdtemp(join(tmpdir(), "gettysburg-browser-"));
    server = spawn(process.execPath, ["apps/server/dist/index.js"], {
      env: {
        ...process.env,
        DATABASE_URL: postgres.connectionString,
        GETTYSBURG_CREDENTIAL_PEPPER_FILE: join(
          runtimeDirectory,
          "credential-pepper",
        ),
        GETTYSBURG_SERVER_HOST: "127.0.0.1",
        GETTYSBURG_SERVER_PORT: String(port),
        GETTYSBURG_TRUSTED_ORIGIN: origin,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stdout.on("data", (chunk) => (output += String(chunk)));
    server.stderr.on("data", (chunk) => (output += String(chunk)));
  }

  await waitForReadiness(origin, () => output);
  browser = await chromium.launch({ headless: true });
  await runScenario(browser, origin, {
    hostName: "Confederate",
    inputMode: "keyboard",
    label: "desktop",
    opponentName: "Union",
    viewport: { height: 900, width: 1440 },
  });
  await runScenario(browser, origin, {
    hostName: "Union",
    inputMode: "touch",
    label: "tablet",
    opponentName: "Confederate",
    viewport: { height: 768, width: 1024 },
  });
  if (process.env.GETTYSBURG_FULL_GAME === "true") {
    await runFullGame(browser, origin);
  }
  console.log(
    `Browser acceptance passed at desktop and tablet widths; evidence: ${evidenceDirectory}`,
  );
} catch (error) {
  failure = new Error(`Browser acceptance failed; server output:\n${output}`, {
    cause: error,
  });
} finally {
  const cleanupErrors = [];
  try {
    await browser?.close();
  } catch (error) {
    cleanupErrors.push(
      new Error("Failed to close the browser", { cause: error }),
    );
  }
  if (server !== undefined) {
    try {
      await stopServer(server, () => output);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  try {
    postgres?.stop();
  } catch (error) {
    cleanupErrors.push(
      new Error("Failed to stop the PostgreSQL test service", { cause: error }),
    );
  }
  if (runtimeDirectory !== undefined) {
    try {
      await rm(runtimeDirectory, { force: true, recursive: true });
    } catch (error) {
      cleanupErrors.push(
        new Error("Failed to remove the browser runtime directory", {
          cause: error,
        }),
      );
    }
  }
  if (cleanupErrors.length > 0) {
    const cleanupFailure = new AggregateError(
      cleanupErrors,
      "Browser acceptance cleanup failed",
    );
    failure =
      failure === undefined
        ? cleanupFailure
        : new AggregateError(
            [failure, cleanupFailure],
            "Browser acceptance and cleanup failed",
          );
  }
}

if (failure !== undefined) throw failure;
