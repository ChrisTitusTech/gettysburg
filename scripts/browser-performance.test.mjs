import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  measureBoardResponse,
  performanceMode,
  summarizeResponseTimes,
  summarizeSessionTimings,
  withMeasurementDeadline,
} from "./browser-performance.mjs";

test("external deadline aborts operations without a responsive renderer", async () => {
  let signal;
  await assert.rejects(
    withMeasurementDeadline((value) => {
      signal = value;
      return new Promise(() => {});
    }, 10),
    /Measurement deadline exceeded/,
  );
  assert.equal(signal.aborted, true);
  assert.equal(await withMeasurementDeadline(async () => 42), 42);
});

test(
  "setup errors and frozen evaluations retain evidence in report mode",
  { timeout: 5_000 },
  async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "gettysburg-frozen-timing-"),
    );
    try {
      for (const stage of ["fit", "setup", "frozen"]) {
        const button = {
          click: async () => {
            if (stage === "fit") throw new Error("Private setup error");
          },
          evaluate: async () => {
            if (stage === "setup") throw new Error("Private setup error");
          },
        };
        const page = {
          getByRole: () => button,
          evaluate: () =>
            stage === "frozen" ? new Promise(() => {}) : Promise.resolve(),
          context: () => ({ browser: () => ({ version: () => "fixture" }) }),
          viewportSize: () => ({ width: 1440, height: 900 }),
        };
        await assert.rejects(
          measureBoardResponse(page, directory, stage, "report"),
          /incomplete board response/,
        );
        const raw = await readFile(
          join(directory, `${stage}-performance.json`),
          "utf8",
        );
        const evidence = JSON.parse(raw);
        assert.equal(evidence.samples, 1);
        assert.equal(evidence.failure, "measurement-input-or-page-failed");
        assert.equal(raw.includes("Private"), false);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test("performance mode defaults strict and rejects unknown settings", () => {
  assert.equal(performanceMode(), "strict");
  assert.equal(performanceMode("report"), "report");
  for (const value of ["", "false", "REPORT", null])
    assert.throws(() => performanceMode(value));
});

test("report mode preserves budget misses but never accepts incomplete input", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gettysburg-timing-mode-"));
  try {
    for (const mode of ["strict", "report"]) {
      for (const confirmed of [true, false]) {
        let reads = 0;
        const button = { click: async () => {}, evaluate: async () => {} };
        const page = {
          getByRole: () => button,
          evaluate: async () =>
            ++reads % 2 === 1
              ? { durationMs: 150, confirmed, confirmedAtMs: 12 }
              : undefined,
          context: () => ({ browser: () => ({ version: () => "fixture" }) }),
          viewportSize: () => ({ width: 1440, height: 900 }),
        };
        const run = measureBoardResponse(page, directory, "desktop", mode);
        if (!confirmed) await assert.rejects(run, /incomplete board response/);
        else if (mode === "strict")
          await assert.rejects(run, /exceeded the 100 ms budget/);
        else await run;
        const evidence = JSON.parse(
          await readFile(join(directory, "desktop-performance.json"), "utf8"),
        );
        assert.equal(evidence.mode, mode);
        assert.equal(evidence.budgetMs, 100);
        assert.equal(evidence.overBudget, confirmed ? 20 : 1);
        assert.equal(
          evidence.failure,
          confirmed ? null : "zoom-not-confirmed-before-deadline",
        );
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("session observations use declared budgets without retaining extra fields", () => {
  const result = summarizeSessionTimings({
    initialInteractiveMs: 3_000,
    reconnectMs: 5_001,
    inputToBothPlayersMs: 300,
    privateUrl: "ignored",
  });
  assert.equal(result.initialInteractiveMs.withinBudget, true);
  assert.equal(result.reconnectMs.withinBudget, false);
  assert.equal(result.inputToBothPlayersMs.budgetMs, 500);
  assert.equal(Object.hasOwn(result, "privateUrl"), false);
  assert.throws(() => summarizeSessionTimings({}));
});

test("response summary uses nearest-rank percentiles without mutating samples", () => {
  const samples = [110, ...Array.from({ length: 19 }, (_, index) => index + 1)];
  const original = [...samples];
  assert.deepEqual(summarizeResponseTimes(samples), {
    samples: 20,
    medianMs: 10,
    p95Ms: 19,
    maximumMs: 110,
    budgetMs: 100,
    overBudget: 1,
  });
  assert.deepEqual(samples, original);
  assert.equal(summarizeResponseTimes([100]).overBudget, 0);
});

test("response summary rejects missing, negative, or non-finite evidence", () => {
  for (const samples of [[], [-1], [NaN], [Infinity]])
    assert.throws(() => summarizeResponseTimes(samples));
});

test("failed confirmation and input retain bounded evidence before rejecting", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "gettysburg-performance-test-"),
  );
  try {
    for (const inputFailure of [false, true]) {
      let clicks = 0;
      let reads = 0;
      const button = {
        click: async () => {
          if (++clicks > 1 && inputFailure)
            throw new Error("Private value must not reach evidence");
        },
        evaluate: async () => {},
      };
      const page = {
        getByRole: () => button,
        evaluate: async () =>
          ++reads === 1 ? { durationMs: 2_000, confirmed: false } : undefined,
        context: () => ({ browser: () => ({ version: () => "fixture" }) }),
        viewportSize: () => ({ width: 1440, height: 900 }),
      };
      await assert.rejects(
        measureBoardResponse(page, directory, "desktop"),
        /incomplete board response measurement/,
      );
      const evidence = JSON.parse(
        await readFile(join(directory, "desktop-performance.json"), "utf8"),
      );
      assert.equal(evidence.samples, 1);
      assert.equal(evidence.maximumMs, 2_000);
      assert.equal(evidence.overBudget, 1);
      assert.deepEqual(
        evidence.frameDiagnostics,
        inputFailure ? [] : [{ confirmedAtMs: null, durationMs: 2_000 }],
      );
      assert.equal(
        evidence.failure,
        inputFailure
          ? "measurement-input-or-page-failed"
          : "zoom-not-confirmed-before-deadline",
      );
      assert.equal(JSON.stringify(evidence).includes("Private value"), false);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
