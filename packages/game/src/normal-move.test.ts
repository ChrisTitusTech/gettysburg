import { describe, expect, it } from "vitest";

import { planNormalMove } from "./normal-move";
import type { NormalMovementActivation, UnitState } from "./protocol";

function unit(id: string, patch: Partial<UnitState> = {}): UnitState {
  return {
    combat: 3,
    entry_hexes: [],
    entry_turn: null,
    id,
    kind: "infantry",
    label: id,
    location: "A2",
    movement: 5,
    organization: "fixture",
    side: "union",
    status: "deployed",
    steps_remaining: 2,
    strength: "full",
    ...patch,
  };
}

const general = unit("general", {
  combat: null,
  kind: "general",
  movement: 10,
});

function activation(
  movers: readonly UnitState[],
  current?: NormalMovementActivation,
) {
  const plan = planNormalMove(current, movers);
  expect(plan.ok).toBe(true);
  if (!plan.ok) throw new Error(plan.reason);
  return plan.activation;
}

describe("continuous movement policy (not yet activated)", () => {
  it("allows repeated partial movement by the exact same unit", () => {
    const current = activation([unit("a")]);
    const plan = planNormalMove(current, [
      unit("a", { location: "A3", movement_spent: 1.5 }),
    ]);
    expect(plan).toEqual({ ok: true, activation: current, allowance: 3.5 });
  });

  it("ends the previous move only when a different group is committed", () => {
    const first = activation([unit("a")]);
    const second = activation([unit("b")], first);
    expect(second.closed_unit_ids).toEqual(["a"]);
    expect(planNormalMove(second, [unit("a")])).toEqual({
      ok: false,
      reason: "move_finished",
    });
    expect(first.closed_unit_ids).toEqual([]);
    expect(planNormalMove(first, [unit("a")]).ok).toBe(true);
  });

  it("tracks all completed groups and treats ordering as immaterial", () => {
    const first = activation([unit("b"), unit("a"), general]);
    expect(
      planNormalMove(first, [general, unit("a"), unit("b")]),
    ).toMatchObject({ ok: true, activation: first });
    const second = activation([unit("c")], first);
    const third = activation([unit("d")], second);
    expect(third.closed_unit_ids).toEqual(["a", "b", "c", "general"]);
    expect(planNormalMove(third, [unit("b")]).ok).toBe(false);
  });

  it("does not restart a mover by adding or dropping stack members", () => {
    const first = activation([unit("a"), general]);
    expect(planNormalMove(first, [unit("a")])).toEqual({
      ok: false,
      reason: "move_finished",
    });
    expect(planNormalMove(first, [unit("a"), unit("b"), general]).ok).toBe(
      false,
    );
    const second = activation([unit("b")], first);
    expect(planNormalMove(second, [unit("a"), unit("b"), general]).ok).toBe(
      false,
    );
  });

  it("preserves the boundary and bonus through a JSON snapshot round trip", () => {
    const current = activation([unit("b"), general], activation([unit("a")]));
    const restored = JSON.parse(
      JSON.stringify(current),
    ) as NormalMovementActivation;
    expect(planNormalMove(restored, [unit("a")]).ok).toBe(false);
    expect(
      planNormalMove(restored, [
        unit("b", { movement_spent: 2.5 }),
        { ...general, movement_spent: 2.5 },
      ]),
    ).toMatchObject({ ok: true, allowance: 3.5 });
  });

  it("adds one for combat units accompanied for their entire move, not generals", () => {
    expect(planNormalMove(undefined, [unit("a"), general])).toMatchObject({
      ok: true,
      allowance: 6,
      activation: { bonus_unit_ids: ["a"] },
    });
    expect(planNormalMove(undefined, [general])).toMatchObject({
      ok: true,
      allowance: 10,
      activation: { bonus_unit_ids: [] },
    });
    expect(planNormalMove(undefined, [unit("a")])).toMatchObject({
      ok: true,
      allowance: 5,
    });
  });

  it("uses the slowest remaining allowance including a limiting general", () => {
    const movers = [
      unit("a"),
      unit("artillery", { kind: "artillery", movement: 4 }),
      general,
    ];
    expect(planNormalMove(undefined, movers)).toMatchObject({
      ok: true,
      allowance: 5,
    });
    expect(
      planNormalMove(undefined, [unit("a"), { ...general, movement: 3 }]),
    ).toMatchObject({ ok: true, allowance: 3 });
    const current = activation(movers);
    expect(
      planNormalMove(
        current,
        movers.map((mover) => ({ ...mover, movement_spent: 5 })),
      ),
    ).toMatchObject({ ok: true, allowance: 0 });
  });

  it("never retroactively adds accompaniment to earlier unaccompanied steps", () => {
    const current = activation([unit("a", { movement_spent: 1 }), general]);
    expect(current.bonus_unit_ids).toEqual([]);
    expect(
      planNormalMove(current, [
        unit("a", { movement_spent: 2 }),
        { ...general, movement_spent: 1 },
      ]),
    ).toMatchObject({ ok: true, allowance: 3 });
  });

  it("ignores organization when awarding accompaniment", () => {
    expect(
      planNormalMove(undefined, [
        unit("a", { organization: "another corps" }),
        general,
      ]),
    ).toMatchObject({ ok: true, allowance: 6 });
  });

  it("rejects empty, duplicate, non-deployed, mixed-seat, and split-location groups", () => {
    const invalidGroups = [
      [],
      [unit("a"), unit("a")],
      [unit("a", { status: "reinforcement", location: null })],
      [unit("a", { status: "eliminated" })],
      [unit("a"), unit("b", { side: "confederate" })],
      [unit("a"), unit("b", { location: "A3" })],
    ];
    for (const movers of invalidGroups)
      expect(planNormalMove(undefined, movers)).toEqual({
        ok: false,
        reason: "invalid_group",
      });
  });

  it("starts fresh after the caller resets activation for a new movement phase", () => {
    const current = activation([unit("b")], activation([unit("a")]));
    expect(planNormalMove(current, [unit("a")]).ok).toBe(false);
    expect(planNormalMove(undefined, [unit("a")])).toMatchObject({
      ok: true,
      allowance: 5,
      activation: { closed_unit_ids: [] },
    });
  });
});
