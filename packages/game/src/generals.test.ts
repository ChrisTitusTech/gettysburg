import { describe, expect, it } from "vitest";

import { eliminateLoneGenerals } from "./generals";
import { normalMovementStep } from "./movement";
import { prepareNormalMovement } from "./movement-validation";
import {
  COMMAND_SCHEMA_VERSION,
  MANDATORY_RULESET_VERSION,
  RULESET_VERSION,
} from "./protocol";
import type { GameState, GameplayCommand, UnitState } from "./protocol";
import { reduceGameplayCommand } from "./reducer";

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
    side: "confederate",
    status: "deployed",
    steps_remaining: 2,
    strength: "full",
    ...patch,
  };
}
const enemyGeneral = unit("general", {
  combat: null,
  kind: "general",
  side: "union",
  location: "C2",
});
function state(patch: Partial<GameState> = {}): GameState {
  return {
    active_side: "confederate",
    combats: {},
    content_revision: "mandatory-fixture",
    event_sequence: 0,
    game_id: "11111111-1111-4111-8111-111111111111",
    night: false,
    objectives: {},
    phase: "movement",
    ruleset_version: MANDATORY_RULESET_VERSION,
    terrain: {},
    turn: 1,
    version: 0,
    units: { a: unit("a"), general: enemyGeneral },
    movement_edges: {
      roads: [
        ["A2", "B2"],
        ["B2", "C3"],
        ["C3", "D3"],
        ["D3", "E4"],
      ],
      railroads: [],
      streams: [],
    },
    victory: { confederate: 0, union: 0, status: "in-progress" },
    ...patch,
  };
}

describe("mandatory lone-general capture", () => {
  it("captures an unsupported general in enemy combat ZOC without mutating input", () => {
    const current = state({
      units: { a: unit("a", { location: "B2" }), general: enemyGeneral },
    });
    const captured = eliminateLoneGenerals(current);
    expect(captured.general).toMatchObject({
      status: "eliminated",
      location: null,
      strength: "eliminated",
      steps_remaining: 0,
    });
    expect(current.units.general?.status).toBe("deployed");
    expect(captured.a).toBe(current.units.a);
  });

  it("leaves supported generals, distant generals, and off-board counters unchanged", () => {
    const supported = state({
      units: {
        a: unit("a", { location: "B2" }),
        general: enemyGeneral,
        support: unit("support", {
          location: "C2",
          side: "union",
          strength: "reduced",
        }),
      },
    });
    expect(eliminateLoneGenerals(supported)).toBe(supported.units);
    const distant = state();
    expect(eliminateLoneGenerals(distant)).toBe(distant.units);
    const offboard = state({
      units: {
        a: unit("a", { location: "B2" }),
        general: { ...enemyGeneral, status: "reinforcement", location: null },
      },
    });
    expect(eliminateLoneGenerals(offboard)).toBe(offboard.units);
  });

  it("does not treat another general or eliminated counter as combat support", () => {
    for (const support of [
      unit("support", { kind: "general" }),
      unit("support", { status: "eliminated" }),
    ]) {
      const current = state({
        units: {
          a: unit("a", { location: "B2" }),
          general: enemyGeneral,
          support: { ...support, side: "union", location: "C2" },
        },
      });
      expect(eliminateLoneGenerals(current).general?.status).toBe("eliminated");
    }
  });

  it("does not let generals exert a zone of control", () => {
    const current = state({
      units: {
        a: unit("a", { kind: "general", location: "B2" }),
        general: enemyGeneral,
      },
    });
    expect(eliminateLoneGenerals(current)).toBe(current.units);
  });

  it("captures along every movement step even when the final endpoint is distant", () => {
    const current = state();
    const one = prepareNormalMovement(current, "confederate", ["a"], "E4");
    const first = prepareNormalMovement(current, "confederate", ["a"], "B2");
    expect(one.ok && first.ok).toBe(true);
    if (!one.ok || !first.ok) return;
    const second = prepareNormalMovement(
      { ...current, ...first.patch },
      "confederate",
      ["a"],
      "E4",
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(one.patch.units).toEqual(second.patch.units);
    expect(one.patch.units.general?.status).toBe("eliminated");
    expect(one.patch.units.a?.movement_spent).toBe(2);
    expect(current.units.general?.status).toBe("deployed");
  });

  it("allows a combat unit to enter the general hex after capturing on approach", () => {
    const prepared = prepareNormalMovement(state(), "confederate", ["a"], "C2");
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.patch.units.a?.location).toBe("C2");
    expect(prepared.patch.units.general?.location).toBeNull();
    const blocked = state({
      units: { a: unit("a", { kind: "general" }), general: enemyGeneral },
    });
    expect(prepareNormalMovement(blocked, "confederate", ["a"], "C2").ok).toBe(
      false,
    );
  });

  it("never allows entry into an enemy-supported general stack", () => {
    const current = state({
      units: {
        a: unit("a"),
        general: enemyGeneral,
        support: unit("support", { side: "union", location: "C2" }),
      },
    });
    expect(
      prepareNormalMovement(current, "confederate", ["a"], "C2"),
    ).toMatchObject({ ok: false, error: "occupied" });
  });

  it("eliminates a general left unsupported when its own combat counter moves away", () => {
    const current = state({
      units: {
        a: unit("a", { location: "B2" }),
        general: unit("general", { kind: "general", location: "B2" }),
        enemy: unit("enemy", { side: "union", location: "C2" }),
      },
    });
    const prepared = prepareNormalMovement(current, "confederate", ["a"], "A2");
    expect(prepared.ok).toBe(true);
    if (prepared.ok)
      expect(prepared.patch.units.general?.status).toBe("eliminated");
  });

  it("allows a lone general to enter and be captured, but not move on after capture", () => {
    const current = state({
      units: {
        a: unit("a", { kind: "general" }),
        enemy: unit("enemy", { side: "union", location: "C2" }),
      },
    });
    const prepared = prepareNormalMovement(current, "confederate", ["a"], "B2");
    expect(prepared.ok).toBe(true);
    if (prepared.ok) {
      expect(prepared.patch.units.a?.status).toBe("eliminated");
      expect(
        prepareNormalMovement(
          { ...current, ...prepared.patch },
          "confederate",
          ["a"],
          "A2",
        ).ok,
      ).toBe(false);
    }
    expect(
      normalMovementStep(
        current,
        "confederate",
        ["general"],
        current.movement_edges!,
        "B2",
        "A2",
      ),
    ).toBeNull();
  });

  it("allows general transit through friendly combat support in enemy ZOC", () => {
    const current = state({
      units: {
        a: unit("a", { kind: "general" }),
        enemy: unit("enemy", { side: "union", location: "C2" }),
        support: unit("support", { location: "B2" }),
      },
    });
    const prepared = prepareNormalMovement(current, "confederate", ["a"], "B2");
    expect(prepared.ok).toBe(true);
    if (prepared.ok) expect(prepared.patch.units.a?.status).toBe("deployed");
    expect(
      normalMovementStep(
        current,
        "confederate",
        ["general"],
        current.movement_edges!,
        "B2",
        "A2",
      )?.cost,
    ).toBe(1);
  });

  it("settles capture after accepted commands only in the new ruleset and scores no general points", () => {
    const current = state({
      phase: "combat",
      units: {
        general: unit("general", {
          kind: "general",
          combat: null,
          location: "B2",
        }),
        enemy: unit("enemy", { side: "union", location: "C2" }),
      },
    });
    const command: GameplayCommand = {
      command_id: "22222222-2222-4222-8222-222222222222",
      command_name: "endPhase" as const,
      game_id: current.game_id,
      expected_version: current.version,
      schema: COMMAND_SCHEMA_VERSION,
      payload: {},
    };
    expect(
      reduceGameplayCommand(current, "confederate", command),
    ).toMatchObject({
      ok: true,
      state: {
        units: { general: { status: "eliminated" } },
        victory: { union: 0 },
      },
    });
    expect(
      reduceGameplayCommand(
        { ...current, ruleset_version: RULESET_VERSION },
        "confederate",
        command,
      ),
    ).toMatchObject({
      ok: true,
      state: { units: { general: { status: "deployed" } } },
    });
  });
});
