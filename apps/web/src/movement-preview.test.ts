import { describe, expect, it } from "vitest";
import { createFlatMovementInitialState } from "@gettysburg/content";
import {
  MANDATORY_RULESET_VERSION,
  WHOLE_POINT_RULESET_VERSION,
  FLAT_MOVEMENT_RULESET_VERSION,
  planNormalMove,
  prepareNormalMovement,
  type GameState,
  type HexCoordinate,
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
  it("limits Reynolds/Wadsworth to five hexes across terrain with no general bonus", () => {
    const current = createFlatMovementInitialState(
      "11111111-1111-4111-8111-111111111111",
    );
    const ids = ["u-reynolds", "u-wadsworth"];
    for (const group of [["u-wadsworth"], ids]) {
      const preview = previewMandatoryMovement(
        current,
        "union",
        group,
        "D8",
        true,
      );
      expect(preview).toMatchObject({
        ok: true,
        allowance: 5,
        route: { cost: 5, path: ["D3", "D4", "D5", "D6", "D7", "D8"] },
      });
      expect(preview).toEqual(
        prepareNormalMovement(current, "union", group, "D8"),
      );
    }
    expect(
      previewMandatoryMovement(current, "union", ids, "D9", true),
    ).toMatchObject({
      ok: true,
      allowance: 5,
      route: { cost: 5, path: ["D3", "D4", "D5", "D6", "D7", "D8"] },
    });
    expect(previewMandatoryMovement(current, "union", ids, "D9")).toMatchObject(
      { ok: false, error: "movement_exceeded" },
    );
  });

  it("uses all five points, realigns while dragging, and agrees with the authoritative route", () => {
    const current = state({
      ruleset_version: FLAT_MOVEMENT_RULESET_VERSION,
      units: { a: unit("a", { location: "F5", movement: 5 }) },
    });
    for (const [target, path] of [
      ["K5", ["F5", "G5", "H5", "I5", "J5", "K5"]],
      ["F10", ["F5", "F6", "F7", "F8", "F9", "F10"]],
      ["K5", ["F5", "G5", "H5", "I5", "J5", "K5"]],
    ] as const) {
      const preview = previewMandatoryMovement(
        current,
        "confederate",
        ["a"],
        target,
        true,
      );
      expect(preview).toMatchObject({
        ok: true,
        allowance: 5,
        route: { cost: 5, path },
      });
      expect(preview).toEqual(
        prepareNormalMovement(current, "confederate", ["a"], target),
      );
    }
    expect(
      previewMandatoryMovement(current, "confederate", ["a"], "F11", true),
    ).toMatchObject({
      ok: true,
      route: { cost: 5, path: ["F5", "F6", "F7", "F8", "F9", "F10"] },
    });
    expect(current.units.a?.movement_spent).toBeUndefined();
  });

  it("can use the complete remaining budget after a first drag", () => {
    const current = state({
      ruleset_version: FLAT_MOVEMENT_RULESET_VERSION,
      units: { a: unit("a", { location: "F5", movement: 5 }) },
    });
    const first = previewMandatoryMovement(
      current,
      "confederate",
      ["a"],
      "G5",
      true,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const next = { ...current, ...first.patch };
    expect(
      previewMandatoryMovement(next, "confederate", ["a"], "K5", true),
    ).toMatchObject({
      ok: true,
      allowance: 4,
      route: { cost: 4 },
      patch: { units: { a: { location: "K5", movement_spent: 5 } } },
    });
  });

  it.each([0, 1])(
    "charges entered hexes, never the origin, with %s point already spent",
    (spent) => {
      const current = state({
        ruleset_version: FLAT_MOVEMENT_RULESET_VERSION,
        units: {
          a: unit("a", { location: "F5", movement: 5, movement_spent: spent }),
        },
      });
      const destination = `F${10 - spent}` as HexCoordinate;
      expect(
        previewMandatoryMovement(
          current,
          "confederate",
          ["a"],
          destination,
          true,
        ),
      ).toMatchObject({
        ok: true,
        allowance: 5 - spent,
        route: { cost: 5 - spent },
        patch: { units: { a: { movement_spent: 5 } } },
      });
    },
  );

  it("uses one point per v5 road step in preview, overshoot clamping, and server validation", () => {
    const current = state({ ruleset_version: WHOLE_POINT_RULESET_VERSION });
    expect(
      previewMandatoryMovement(current, "confederate", ["a"], "L4"),
    ).toEqual(prepareNormalMovement(current, "confederate", ["a"], "L4"));
    expect(
      previewMandatoryMovement(current, "confederate", ["a"], "L4"),
    ).toMatchObject({ ok: false, error: "movement_exceeded" });
    expect(
      previewMandatoryMovement(current, "confederate", ["a"], "L4", true),
    ).toMatchObject({ ok: true, route: { cost: 1, path: ["L6", "L5"] } });
  });
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
  it("clamps beyond-budget friendly full targets but preserves reachable capacity and source errors", () => {
    const current = state({
      units: { a: unit("a"), friend: unit("friend", { location: "L3" }) },
    });
    expect(
      previewMandatoryMovement(current, "confederate", ["a"], "L3", true),
    ).toMatchObject({ ok: true, route: { cost: 1, path: ["L6", "L5", "L4"] } });
    expect(
      previewMandatoryMovement(
        state({
          units: { a: unit("a"), friend: unit("friend", { location: "L4" }) },
        }),
        "confederate",
        ["a"],
        "L4",
        true,
      ),
    ).toMatchObject({ ok: false, error: "occupied" });
    const general = unit("g", { kind: "general", combat: null });
    expect(
      previewMandatoryMovement(
        state({ units: { a: unit("a"), b: unit("b"), g: general } }),
        "confederate",
        ["g"],
        "L3",
        true,
      ),
    ).toMatchObject({ ok: false, error: "occupied" });
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
