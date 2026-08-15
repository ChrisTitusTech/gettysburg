import { describe, expect, it } from "vitest";

import type { GameState, MoveUnitPayload } from "./protocol";
import { reduceMoveUnit } from "./reducer";

const state: GameState = {
  active_side: "confederate",
  combats: {},
  content_revision: "phase-1-fixture-v1",
  event_sequence: 0,
  game_id: "11111111-1111-4111-8111-111111111111",
  night: false,
  objectives: {},
  phase: "movement",
  ruleset_version: "phase-1-rules-v1",
  turn: 1,
  units: {
    confederate: {
      combat: 3,
      entry_hexes: [],
      entry_turn: null,
      id: "confederate",
      kind: "infantry",
      label: "Confederate fixture counter",
      location: "F5",
      movement: 5,
      organization: "fixture",
      side: "confederate",
      status: "deployed",
      steps_remaining: 2,
      strength: "full",
    },
    union: {
      combat: 3,
      entry_hexes: [],
      entry_turn: null,
      id: "union",
      kind: "infantry",
      label: "Union fixture counter",
      location: "P7",
      movement: 5,
      organization: "fixture",
      side: "union",
      status: "deployed",
      steps_remaining: 2,
      strength: "full",
    },
  },
  version: 0,
  victory: {
    confederate: 0,
    status: "in-progress",
    union: 0,
  },
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
    const occupiedState = {
      ...state,
      units: {
        ...state.units,
        union: { ...state.units.union!, location: "G5" as const },
      },
    };
    const result = reduceMoveUnit(occupiedState, "confederate", {
      destination: "G5",
      unit_id: "confederate",
    });

    expect(result).toMatchObject({ failure: { error: "occupied" }, ok: false });
  });

  it("spends movement across partial moves and rejects a sixth hex", () => {
    const first = reduceMoveUnit(state, "confederate", {
      destination: "F8",
      unit_id: "confederate",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.state.units.confederate?.movement_spent).toBe(3);

    const second = reduceMoveUnit(first.state, "confederate", {
      destination: "F10",
      unit_id: "confederate",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.state.units.confederate?.movement_spent).toBe(5);

    expect(
      reduceMoveUnit(second.state, "confederate", {
        destination: "F11",
        unit_id: "confederate",
      }),
    ).toMatchObject({
      failure: { error: "movement_exceeded" },
      ok: false,
    });
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
