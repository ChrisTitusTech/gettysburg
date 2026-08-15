import type { FixtureUnit } from "./types.js";

export const FIXTURE_CONTENT_REVISION = "phase-1-fixture-v1";

export const FIXTURE_UNITS = [
  {
    id: "fixture-confederate-1",
    label: "Confederate fixture counter",
    location: "F5",
    side: "confederate",
  },
  {
    id: "fixture-union-1",
    label: "Union fixture counter",
    location: "P7",
    side: "union",
  },
] as const satisfies readonly FixtureUnit[];
