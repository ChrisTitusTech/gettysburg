import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCESSIBILITY_TAGS,
  waitForPlayerControls,
} from "./browser-accessibility.mjs";

test("live audits wait for both lazy notification regions", async () => {
  let release;
  let calls = 0;
  let finished = false;
  const ready = new Promise((resolve) => {
    release = resolve;
  });
  const page = {
    getByRole: (role, options) => {
      assert.equal(role, "region");
      assert.equal(options.name, "Turn notifications");
      calls++;
      return { waitFor: () => ready };
    },
  };
  const waiting = waitForPlayerControls([page, page]).then(() => {
    finished = true;
  });
  await Promise.resolve();
  assert.equal(calls, 2);
  assert.equal(finished, false);
  release();
  await waiting;
  assert.equal(finished, true);
});

test("accessibility audit retains the declared WCAG 2.2 AA baseline and predecessors", () => {
  for (const tag of [
    "wcag2a",
    "wcag2aa",
    "wcag21a",
    "wcag21aa",
    "wcag22a",
    "wcag22aa",
  ]) {
    assert(
      ACCESSIBILITY_TAGS.includes(tag),
      `Missing accessibility baseline: ${tag}`,
    );
  }
  assert(Object.isFrozen(ACCESSIBILITY_TAGS));
});
