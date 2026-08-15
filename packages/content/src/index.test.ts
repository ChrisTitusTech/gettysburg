import { describe, expect, it } from "vitest";

import { FIXTURE_CONTENT_REVISION, FIXTURE_UNITS } from "./index";

describe("Phase 1 fixture content", () => {
  it("is explicitly identified as non-production fixture data", () => {
    expect(FIXTURE_CONTENT_REVISION).toContain("fixture");
  });

  it("contains one counter for each seat", () => {
    expect(FIXTURE_UNITS.map((unit) => unit.side).sort()).toEqual([
      "confederate",
      "union",
    ]);
  });
});
