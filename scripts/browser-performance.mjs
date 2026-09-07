import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export function summarizeSessionTimings(measurements) {
  const budgets = {
    initialInteractiveMs: 3_000,
    reconnectMs: 5_000,
    inputToBothPlayersMs: 500,
  };
  return Object.fromEntries(
    Object.entries(budgets).map(([name, budgetMs]) => {
      const durationMs = measurements[name];
      assert(Number.isFinite(durationMs) && durationMs >= 0, `Invalid ${name}`);
      return [
        name,
        { durationMs, budgetMs, withinBudget: durationMs <= budgetMs },
      ];
    }),
  );
}

export async function recordSessionTimings(evidence, label, measurements) {
  const timings = summarizeSessionTimings(measurements);
  await writeFile(
    resolve(evidence, `${label}-session-performance.json`),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        timings,
        limitations: [
          "One sample per flow/layout; not a percentile or a capacity test.",
          "Initial lobby load uses an empty browser context without network throttling.",
          "Reconnect includes a reload with this context's existing asset cache.",
          "Input-to-both-players includes automation/input/render overhead and all network latency.",
          "These observations do not prove broadband, physical-device, or VPS acceptance.",
        ],
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    `${label}: session timings ${Object.entries(timings)
      .map(
        ([name, value]) =>
          `${name}=${value.durationMs.toFixed(1)} (${value.withinBudget ? "within" : "outside"} target)`,
      )
      .join(", ")}`,
  );
}

export function summarizeResponseTimes(samples) {
  assert(samples.length > 0, "At least one timing sample is required");
  assert(samples.every((sample) => Number.isFinite(sample) && sample >= 0));
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (fraction) =>
    sorted[Math.ceil(sorted.length * fraction) - 1];
  return {
    samples: samples.length,
    medianMs: percentile(0.5),
    p95Ms: percentile(0.95),
    maximumMs: sorted.at(-1),
    budgetMs: 100,
    overBudget: samples.filter((sample) => sample > 100).length,
  };
}

// Browser-local click-to-render opportunity, not network latency or VPS capacity.
// Two animation frames include a paint opportunity after the React zoom update.
// Keep only numeric timings and public environment metadata; never retain URLs,
// cookies, invitations, game identifiers, or raw performance resource entries.
export async function measureBoardResponse(page, evidence, label) {
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  const samples = [];
  let failure;
  for (let index = 0; index < 20; index++) {
    const zoomIn = index % 2 === 0;
    const button = page.getByRole("button", {
      name: zoomIn ? "Zoom in" : "Fit",
      exact: true,
    });
    await button.evaluate(
      (element, expectedZoom) => {
        window.__gettysburgTiming = new Promise((resolveSample) => {
          element.addEventListener(
            "click",
            () => {
              const start = performance.now();
              const finish = (confirmed) => {
                clearTimeout(timeout);
                resolveSample({
                  durationMs: performance.now() - start,
                  confirmed,
                });
              };
              const timeout = setTimeout(() => finish(false), 2_000);
              const observeUpdate = () => {
                if (performance.now() - start > 2_000) {
                  finish(false);
                  return;
                }
                if (
                  document.querySelector('[aria-label="Current zoom"]')
                    ?.textContent === expectedZoom
                )
                  requestAnimationFrame(() => finish(true));
                else requestAnimationFrame(observeUpdate);
              };
              requestAnimationFrame(observeUpdate);
            },
            { capture: true, once: true },
          );
        });
      },
      zoomIn ? "135%" : "100%",
    );
    try {
      await button.click({ timeout: 2_000 });
      const sample = await page.evaluate(() => window.__gettysburgTiming);
      samples.push(sample.durationMs);
      if (!sample.confirmed) failure = "zoom-not-confirmed-before-deadline";
    } catch {
      samples.push(2_000);
      failure = "measurement-input-or-page-failed";
    } finally {
      await page
        .evaluate(() => {
          delete window.__gettysburgTiming;
        })
        .catch(() => {});
    }
    if (failure) break;
  }
  const summary = summarizeResponseTimes(samples);
  await writeFile(
    resolve(evidence, `${label}-performance.json`),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        measurement: "local-click-to-confirmed-zoom-and-paint-opportunity",
        browser: page.context().browser().version(),
        viewport: page.viewportSize(),
        ...summary,
        failure: failure ?? null,
        limitations: [
          "No CPU or network throttling; this is the current test machine.",
          "Zoom controls only; not all board interactions or physical touch latency.",
          "Not initial broadband load, cross-player latency, reconnect, or VPS capacity.",
        ],
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    `${label}: board response p95 ${summary.p95Ms.toFixed(1)} ms; ${summary.overBudget}/${summary.samples} samples exceed 100 ms`,
  );
  // Persist evidence before rejecting a missed response budget.
  assert.equal(
    failure,
    undefined,
    `${label}: incomplete board response measurement; inspect performance evidence`,
  );
  assert.equal(
    summary.overBudget,
    0,
    `${label}: board response exceeded the 100 ms budget; inspect performance evidence`,
  );
}
