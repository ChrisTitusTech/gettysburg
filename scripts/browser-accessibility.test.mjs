import assert from "node:assert/strict";
import test from "node:test";
import { ACCESSIBILITY_TAGS } from "./browser-accessibility.mjs";

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
