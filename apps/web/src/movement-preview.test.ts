import { describe, expect, it } from "vitest";
import {
  MANDATORY_RULESET_VERSION,
  planNormalMove,
  prepareNormalMovement,
  type GameState,
  type UnitState,
} from "@gettysburg/game";
import { previewMandatoryMovement } from "./movement-preview";

function unit(id: string, patch: Partial<UnitState> = {}): UnitState {
  return {
    id,
    location: "L6",
    side: "confederate",
    kind: "infantry",
    combat: 3,
    movement: 1,
    entry_hexes: [],
    entry_turn: null,
    label: id,
    organization: "fixture",
    status: "deployed",
    strength: "full",
    steps_remaining: 2,
    ...patch,
  };
}
function state(patch: Partial<GameState> = {}): GameState {
  return {
    game_id: "11111111-1111-4111-8111-111111111111",
    active_side: "confederate",
    phase: "movement",
    night: false,
    turn: 1,
    version: 0,
    event_sequence: 0,
    content_revision: "mandatory-fixture",
    ruleset_version: MANDATORY_RULESET_VERSION,
    objectives: {},
    combats: {},
    terrain: {},
    movement_edges: {
      roads: [
        ["L6", "L5"],
        ["L5", "L4"],
      ],
      railroads: [],
      streams: [],
    },
    units: { a: unit("a") },
    victory: { confederate: 0, union: 0, status: "in-progress" },
    ...patch,
  };
}
describe("mandatory movement preview", () => {
  it("submits the exact weighted validator preview", () => {
    const current = state();
    expect(
      previewMandatoryMovement(current, "confederate", ["a"], "L4"),
    ).toEqual(prepareNormalMovement(current, "confederate", ["a"], "L4"));
    expect(
      previewMandatoryMovement(current, "confederate", ["a"], "L4"),
    ).toMatchObject({ ok: true, route: { cost: 1, path: ["L6", "L5", "L4"] } });
  });
  it("clamps drag overshoot by cost instead of hex count", () => {
    const current = state();
    expect(
      previewMandatoryMovement(current, "confederate", ["a"], "L3").ok,
    ).toBe(false);
    expect(
      previewMandatoryMovement(current, "confederate", ["a"], "L3", true),
    ).toMatchObject({ ok: true, route: { cost: 1, path: ["L6", "L5", "L4"] } });
  });
  it("backs up from an over-capacity friendly transit hex", () => {
    const current = state({
      units: { a: unit("a"), friend: unit("friend", { location: "L4" }) },
    });
    expect(
      previewMandatoryMovement(current, "confederate", ["a"], "L3", true),
    ).toMatchObject({ ok: true, route: { cost: 0.5, path: ["L6", "L5"] } });
  });
  it("uses an earned general bonus even after printed movement is exhausted", () => {
    const movers = [
      unit("a"),
      unit("g", { kind: "general", combat: null, movement: 5 }),
    ];
    const plan = planNormalMove(undefined, movers);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const current = state({
      normal_movement: plan.activation,
      units: Object.fromEntries(
        movers.map((unit) => [unit.id, { ...unit, movement_spent: 1 }]),
      ),
    });
    expect(
      previewMandatoryMovement(current, "confederate", ["g", "a"], "L4"),
    ).toMatchObject({ ok: true, allowance: 1, route: { cost: 1 } });
    expect(
      previewMandatoryMovement(current, "confederate", ["a"], "L4").ok,
    ).toBe(false);
  });
  it("does not clamp around authorization, activation, or missing-bundle errors", () => {
    expect(
      previewMandatoryMovement(state(), "union", ["a"], "L3", true).ok,
    ).toBe(false);
    const current = state({
      normal_movement: {
        active_unit_ids: [],
        closed_unit_ids: ["a"],
        bonus_unit_ids: [],
      },
    });
    expect(
      previewMandatoryMovement(current, "confederate", ["a"], "L3", true).ok,
    ).toBe(false);
    const { movement_edges, ...missing } = state();
    expect(movement_edges).toBeDefined();
    expect(
      previewMandatoryMovement(missing, "confederate", ["a"], "L3", true).ok,
    ).toBe(false);
  });
});
