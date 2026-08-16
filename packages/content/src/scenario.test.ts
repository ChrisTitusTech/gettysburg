import { describe, expect, it } from "vitest";

import { SCENARIO_HEXES, SCENARIO_UNITS } from "./scenario";

describe("source-card scenario content", () => {
  it("contains every counter visible on both supplied appearance cards", () => {
    expect(SCENARIO_UNITS.filter((unit) => unit.side === "union")).toHaveLength(
      54,
    );
    expect(
      SCENARIO_UNITS.filter((unit) => unit.side === "confederate"),
    ).toHaveLength(28);
    expect(new Set(SCENARIO_UNITS.map((unit) => unit.id)).size).toBe(82);
  });

  it("uses only represented coordinates and valid entry turns", () => {
    const coordinates = new Set(SCENARIO_HEXES.map((hex) => hex.coordinate));
    for (const unit of SCENARIO_UNITS) {
      expect(unit.entry_turn === null || unit.entry_turn >= 1).toBe(true);
      expect(unit.entry_turn === null || unit.entry_turn <= 24).toBe(true);
      for (const coordinate of unit.entry_hexes) {
        expect(coordinates.has(coordinate)).toBe(true);
      }
      if (unit.setup_hex !== null)
        expect(coordinates.has(unit.setup_hex)).toBe(true);
      expect(unit.reduced_combat).toBe(
        unit.combat === null || unit.combat === 1
          ? null
          : Math.ceil(unit.combat / 2),
      );
      expect(unit.source_status).toBe("owner-approved-derived");
    }
  });

  it("keeps terrain unverified while preserving the eight board objectives", () => {
    expect(SCENARIO_HEXES).toHaveLength(231);
    expect(SCENARIO_HEXES.every((hex) => hex.terrain === "unverified")).toBe(
      true,
    );
    expect(
      Object.fromEntries(
        SCENARIO_HEXES.filter((hex) => hex.objective_value !== null).map(
          (hex) => [hex.coordinate, hex.objective_value],
        ),
      ),
    ).toEqual({
      F6: 5,
      I11: 3,
      K6: 1,
      K7: 1,
      L6: 1,
      L7: 1,
      M7: 1,
      M9: 3,
    });
    expect(
      SCENARIO_HEXES.reduce((sum, hex) => sum + (hex.objective_value ?? 0), 0),
    ).toBe(16);
  });
});
