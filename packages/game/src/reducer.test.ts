import { describe, expect, it } from "vitest";

import type { GameState, MoveUnitPayload } from "./protocol";
import { reduceMoveUnit } from "./reducer";

const state: GameState = {
  active_side: "confederate",
  content_revision: "phase-1-fixture-v1",
  event_sequence: 0,
  game_id: "11111111-1111-4111-8111-111111111111",
  ruleset_version: "phase-1-rules-v1",
  turn: 1,
  units: {
    confederate: {
      id: "confederate",
      label: "Confederate fixture counter",
      location: "F5",
      side: "confederate",
    },
    union: {
      id: "union",
      label: "Union fixture counter",
      location: "P7",
      side: "union",
    },
  },
  version: 0,
};

describe("reduceMoveUnit", () => {
  it("immutably moves a counter and increments both versions", () => {
    const result = reduceMoveUnit(state, "confederate", {
      destination: "G5",
      unit_id: "confederate",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.units.confederate?.location).toBe("G5");
      expect(result.state.version).toBe(1);
      expect(result.state.event_sequence).toBe(1);
      expect(state.units.confederate?.location).toBe("F5");
    }
  });

  it("rejects the other seat without mutation", () => {
    const result = reduceMoveUnit(state, "union", {
      destination: "G5",
      unit_id: "confederate",
    });

    expect(result).toMatchObject({
      failure: { error: "wrong_seat" },
      ok: false,
    });
    expect(state.version).toBe(0);
  });

  it("rejects an occupied destination", () => {
    const result = reduceMoveUnit(state, "confederate", {
      destination: "P7",
      unit_id: "confederate",
    });

    expect(result).toMatchObject({ failure: { error: "occupied" }, ok: false });
  });

  it("rejects malformed runtime coordinates", () => {
    const payload = {
      destination: "Z99",
      unit_id: "confederate",
    } as unknown as MoveUnitPayload;
    const result = reduceMoveUnit(state, "confederate", payload);

    expect(result).toMatchObject({
      failure: { error: "invalid_hex" },
      ok: false,
    });
  });
});
