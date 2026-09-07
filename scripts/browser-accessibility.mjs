import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AxeBuilder } from "@axe-core/playwright";

export const ACCESSIBILITY_TAGS = Object.freeze([
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22a",
  "wcag22aa",
]);

export async function auditAccessibility(page, evidenceDirectory, label) {
  const results = await new AxeBuilder({ page })
    .withTags([...ACCESSIBILITY_TAGS])
    .analyze();
  // Do not retain page HTML, private invitation values, or session URLs.
  const summarize = (rules) =>
    rules.map(({ id, impact, helpUrl, nodes }) => ({
      id,
      impact,
      helpUrl,
      affectedNodes: nodes.length,
    }));
  await writeFile(
    resolve(evidenceDirectory, `${label}-accessibility.json`),
    JSON.stringify(
      {
        engine: results.testEngine,
        violations: summarize(results.violations),
        incomplete: summarize(results.incomplete),
        passedRules: results.passes.length,
      },
      null,
      2,
    ),
  );
  assert.deepEqual(
    results.violations.map(({ id, nodes }) => ({
      id,
      affectedNodes: nodes.length,
    })),
    [],
    `${label} has accessibility violations; inspect the retained summary`,
  );
  console.log(
    `${label}: accessibility checks passed; ${results.incomplete.length} rules require manual review`,
  );
}
