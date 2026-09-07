import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { chromium } from "@playwright/test";

import { deleteAcceptanceGame } from "./browser-cleanup.mjs";
import { runEnforcedGame } from "./browser-enforced-game.mjs";
import { checkReplayManagement } from "./browser-replay-management.mjs";
import { checkSpectatorManagement } from "./browser-spectator-management.mjs";
import { checkPushWorker } from "./browser-push-worker.mjs";
import { checkHomeScreen } from "./browser-home-screen.mjs";
import { checkPushConsent } from "./browser-push-consent.mjs";
import { startPostgres } from "./postgres-test-service.mjs";

const evidenceDirectory = resolve(
  process.env.GETTYSBURG_EVIDENCE_DIR ?? "test-results/browser-acceptance",
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

async function dragWithinMovement(page, prefix, inputMode) {
  const counter = page.getByRole("button", {
    name: /Wadsworth, F4, selectable/,
  });
  const target = page.locator('[data-coordinate="W11"]');
  await counter.scrollIntoViewIfNeeded();
  const startBox = await counter.boundingBox();
  const targetBox = await target.boundingBox();
  assert(startBox !== null);
  assert(targetBox !== null);
  const from = {
    x: startBox.x + startBox.width / 2,
    y: startBox.y + startBox.height / 2,
  };
  const to = {
    x: targetBox.x + targetBox.width / 2,
    y: targetBox.y + targetBox.height / 2,
  };
  const touch =
    inputMode === "touch" ? await page.context().newCDPSession(page) : null;
  if (touch) {
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [from],
    });
    for (let step = 1; step <= 10; step++)
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            x: from.x + ((to.x - from.x) * step) / 10,
            y: from.y + ((to.y - from.y) * step) / 10,
          },
        ],
      });
  } else {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 10 });
  }
  await page.locator(".movement-route").getByText("5 / 5").waitFor();
  // Do not auto-scroll an element while its pointer capture is active.
  await page.screenshot({
    fullPage: true,
    mask: [page.getByLabel("One-time invitation URL")],
    path: resolve(evidenceDirectory, `${prefix}-movement-route.png`),
  });
  if (touch) {
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await touch.detach();
  } else await page.mouse.up();
}

async function ctrlSelectSingleCounter(page) {
  const counter = page.getByRole("button", {
    name: /Gamble, O5, selectable/,
  });
  await counter.focus();
  await page.keyboard.press("Control+Enter");
  await page.locator('[data-coordinate="P5"]').click();
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
      "E4",
      options.inputMode,
    );
    await waitForVersion(unionPage, 1);
    await waitForVersion(confederatePage, 1);
    await confederatePage
      .getByRole("button", {
        name: /Wadsworth, E4/,
      })
      .waitFor();

    await unionPage
      .getByRole("button", {
        name: /Wadsworth, E4, selectable/,
      })
      .click();
    await unionPage.locator('[data-coordinate="U11"]').click();
    await unionPage.getByText(/this group has 5.5 remaining/i).waitFor();
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
    await unionPage
      .getByText(/2 counters moved to E4 \(0.5 movement\)/)
      .waitFor();

    await selectAndMove(
      unionPage,
      /Wadsworth, E4, selectable/,
      "F4",
      options.inputMode,
    );
    await waitForVersion(unionPage, 2);
    await waitForVersion(confederatePage, 2);
    await confederatePage
      .getByRole("button", {
        name: /Wadsworth, F4/,
      })
      .waitFor();

    await dragWithinMovement(unionPage, options.label, options.inputMode);
    await waitForVersion(unionPage, 3);
    await waitForVersion(confederatePage, 3);
    await confederatePage
      .getByRole("button", {
        name: /Wadsworth, P7/,
      })
      .waitFor();

    await captureBoardViews(confederatePage, options.label);
    if (options.inputMode === "keyboard") {
      await ctrlSelectSingleCounter(unionPage);
      await waitForVersion(unionPage, 4);
      await waitForVersion(confederatePage, 4);
      await confederatePage
        .getByRole("button", { name: /Wadsworth, P7/ })
        .waitFor();
      await confederatePage
        .getByRole("button", { name: /Gamble, P5/ })
        .waitFor();
      await confederatePage
        .getByRole("button", { name: /Buford, O5/ })
        .waitFor();
    }
    const liveVersion = options.inputMode === "keyboard" ? 4 : 3;
    await unionPage
      .getByRole("button", { name: "View replay", exact: true })
      .click();
    const viewer = unionPage.getByRole("region", {
      name: "Read-only game replay",
    });
    await viewer.getByText(/Viewing event 0 of/).waitFor();
    assert.equal(
      await unionPage
        .getByRole("button", { name: "Surrender seat", exact: true })
        .count(),
      0,
    );
    await viewer
      .getByRole("button", { name: /Wadsworth, D3, selectable/ })
      .click();
    assert.equal(
      await viewer
        .getByRole("button", { name: /Move selected counters/ })
        .count(),
      0,
    );
    assert.equal(await viewer.locator('.hex[tabindex="0"]').count(), 0);
    await viewer.locator('[data-coordinate="E4"]').click();
    await viewer
      .getByText("Read-only history; no commands are sent.")
      .waitFor();
    await viewer.getByRole("button", { name: "Zoom in", exact: true }).click();
    const replayBoard = viewer.locator(".board-svg");
    const beforePan = await replayBoard.getAttribute("viewBox");
    await viewer.locator('[data-coordinate="J5"]').scrollIntoViewIfNeeded();
    const panStart = await viewer
      .locator('[data-coordinate="J5"]')
      .boundingBox();
    assert(panStart);
    const start = {
      x: panStart.x + panStart.width / 2,
      y: panStart.y + panStart.height / 2,
    };
    if (options.label === "tablet") {
      const touch = await unionPage.context().newCDPSession(unionPage);
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [start],
      });
      for (let step = 1; step <= 5; step++)
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: start.x + step * 12, y: start.y + step * 6 }],
        });
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await touch.detach();
    } else {
      await unionPage.mouse.move(start.x, start.y);
      await unionPage.mouse.down();
      await unionPage.mouse.move(start.x + 60, start.y + 30, { steps: 5 });
      await unionPage.mouse.up();
    }
    assert.notEqual(await replayBoard.getAttribute("viewBox"), beforePan);
    const inspectedViewport = await replayBoard.getAttribute("viewBox");
    await viewer
      .getByRole("button", { name: "Next event", exact: true })
      .click();
    await viewer.getByText(/Viewing event 1 of/).waitFor();
    await viewer
      .getByRole("button", { name: /Wadsworth, E4, selectable/ })
      .waitFor();
    assert.equal(await replayBoard.getAttribute("viewBox"), inspectedViewport);
    assert.equal(
      await viewer
        .getByRole("button", { name: /Wadsworth, E4, selectable/ })
        .getAttribute("aria-pressed"),
      "true",
    );
    const replayControls = unionPage.getByRole("region", {
      name: "Replay controls",
      exact: true,
    });
    const containerBox = await replayControls.boundingBox();
    const viewerBox = await viewer.boundingBox();
    const toggleBox = await replayControls
      .getByRole("button", { name: "Return to live game" })
      .boundingBox();
    assert(containerBox && viewerBox && toggleBox);
    assert(
      toggleBox.height < 80 && viewerBox.y >= toggleBox.y + toggleBox.height,
    );
    assert(viewerBox.width > containerBox.width * 0.9);
    await replayControls.screenshot({
      path: resolve(evidenceDirectory, `${options.label}-replay.png`),
    });
    await viewer
      .getByRole("button", { name: "Latest event", exact: true })
      .click();
    await viewer
      .getByText(new RegExp(`Viewing event ${liveVersion} of`))
      .waitFor();
    await viewer
      .getByRole("button", { name: /Wadsworth, P7, selectable/ })
      .waitFor();
    const authoritativeVersion = await unionPage.evaluate(async () => {
      const id = window.location.pathname.split("/").at(-1);
      const response = await fetch(`/api/games/${id}`);
      if (!response.ok)
        throw new Error("Could not verify live replay isolation");
      return (await response.json()).state.version;
    });
    assert.equal(authoritativeVersion, liveVersion);
    await unionPage
      .getByRole("button", { name: "Return to live game", exact: true })
      .click();
    await waitForVersion(unionPage, liveVersion);
    await waitForVersion(confederatePage, liveVersion);
    await unionPage
      .getByRole("button", { name: "Surrender seat", exact: true })
      .waitFor();
    const cleanupHostPage = options.hostName === "Union" ? unionPage : hostPage;
    cleanupHostPage.once("dialog", (dialog) => dialog.accept());
    await cleanupHostPage
      .getByRole("button", { name: "Surrender seat" })
      .click();
    await cleanupHostPage
      .getByRole("heading", { name: "Host controls recovered" })
      .waitFor();
    await deleteAcceptanceGame(cleanupHostPage);
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
  await checkHomeScreen(browser, origin);
  await checkPushWorker(origin);
  for (const options of [
    { label: "desktop", viewport: { height: 900, width: 1440 } },
    { label: "tablet", viewport: { height: 768, width: 1024 } },
  ])
    await checkPushConsent(browser, origin, evidenceDirectory, options);
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
  for (const options of [
    { label: "desktop", viewport: { height: 900, width: 1440 } },
    { label: "tablet", viewport: { height: 768, width: 1024 } },
  ])
    await checkReplayManagement(browser, origin, evidenceDirectory, options);
  for (const options of [
    { label: "desktop", viewport: { height: 900, width: 1440 } },
    { label: "tablet", viewport: { height: 768, width: 1024 } },
  ])
    await checkSpectatorManagement(browser, origin, evidenceDirectory, options);
  if (process.env.GETTYSBURG_FULL_GAME === "true") {
    for (const options of [
      {
        label: "desktop",
        inputMode: "keyboard",
        viewport: { height: 900, width: 1440 },
      },
      {
        label: "tablet",
        inputMode: "touch",
        viewport: { height: 768, width: 1024 },
      },
    ])
      await runEnforcedGame(browser, origin, evidenceDirectory, options);
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
