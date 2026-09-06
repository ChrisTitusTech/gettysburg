import { describe, expect, it } from "vitest";
import { BOARD_HEXES } from "./coordinates";
import type { HexCoordinate } from "./coordinates";
import { prepareForcedRetreat } from "./forced-retreat";
import {
  COMMAND_SCHEMA_VERSION,
  MANDATORY_RULESET_VERSION,
  RULESET_VERSION,
  gameplayCommandSchema,
} from "./protocol";
import type {
  CombatState,
  GameState,
  GameplayCommand,
  UnitState,
} from "./protocol";
import { reduceGameplayCommand } from "./reducer";

const BATTLE_ID = "33333333-3333-4333-8333-333333333333";

function unit(
  id: string,
  location: HexCoordinate,
  patch: Partial<UnitState> = {},
): UnitState {
  return {
    id,
    location,
    side: "confederate",
    kind: "artillery",
    combat: 5,
    movement: 5,
    movement_spent: 5,
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
function combat(patch: Partial<CombatState> = {}): CombatState {
  return {
    id: BATTLE_ID,
    attackers: ["enemy"],
    defenders: ["a"],
    attacker_hexes: ["L7"],
    defender_hexes: ["L6"],
    attacker_loss_allocated: true,
    defender_loss_allocated: true,
    attacker_retreated: true,
    defender_retreated: false,
    pending_choice: { kind: "retreat", side: "confederate", unit_ids: ["a"] },
    status: "pending_choice",
    rolls: { attacker: 10, defender: 1 },
    confirmation: {
      adjudication_note: "fixture",
      advance_offered: true,
      attacker_losses: 0,
      attacker_modifier: 0,
      attacker_retreat: false,
      defender_losses: 0,
      defender_modifier: 0,
      defender_retreat: true,
      result: "attacker_win",
    },
    ...patch,
  };
}
function state(patch: Partial<GameState> = {}): GameState {
  return {
    game_id: "11111111-1111-4111-8111-111111111111",
    active_side: "union",
    phase: "combat",
    night: false,
    turn: 1,
    version: 0,
    event_sequence: 0,
    combats: { [BATTLE_ID]: combat() },
    objectives: {},
    content_revision: "mandatory-fixture",
    ruleset_version: MANDATORY_RULESET_VERSION,
    terrain: Object.fromEntries(
      BOARD_HEXES.map((hex) => [
        hex,
        {
          kind: "rough_hill",
          woods: true,
          defense: 4,
          hill_defense: 4,
          forest_region: null,
          hill_region: null,
        },
      ]),
    ),
    units: {
      a: unit("a", "L6"),
      enemy: unit("enemy", "L7", { side: "union", kind: "infantry" }),
    },
    victory: { confederate: 0, union: 0, status: "in-progress" },
    ...patch,
  };
}
function run(
  current: GameState,
  command: Pick<GameplayCommand, "command_name" | "payload">,
  side: "confederate" | "union" = "confederate",
) {
  const parsed = gameplayCommandSchema.parse({
    ...command,
    command_id: "22222222-2222-4222-8222-222222222222",
    expected_version: current.version,
    game_id: current.game_id,
    schema: COMMAND_SCHEMA_VERSION,
  });
  return reduceGameplayCommand(current, side, parsed);
}
const hold = {
  command_name: "acceptTrappedLoss",
  payload: { combat_id: BATTLE_ID, unit_id: "a" },
} as const;

describe("authoritative mandatory retreat choices", () => {
  it("exits through a friendly chain for free and cannot shortcut from an open edge", () => {
    const base = state();
    const chain = state({
      units: { a: unit("a", "C2"), b: unit("b", "B2"), c: unit("c", "A2") },
      terrain: Object.fromEntries(
        Object.entries(base.terrain!).filter(
          ([hex]) => !["C2", "B2", "A2"].includes(hex),
        ),
      ),
      combats: { [BATTLE_ID]: combat({ defender_hexes: ["C2"] }) },
    });
    const result = run(chain, {
      command_name: "retreatOffBoard",
      payload: {
        combat_id: BATTLE_ID,
        unit_ids: ["a"],
        path: ["C2", "B2", "A2"],
      },
    });
    expect(result).toMatchObject({
      ok: true,
      state: {
        units: {
          a: { status: "exited", movement_spent: 5 },
          b: { location: "B2" },
          c: { location: "A2" },
        },
      },
    });
    const open = state({
      terrain: {},
      units: { a: unit("a", "A2") },
      combats: { [BATTLE_ID]: combat({ defender_hexes: ["A2"] }) },
    });
    expect(
      run(open, {
        command_name: "retreatOffBoard",
        payload: { combat_id: BATTLE_ID, unit_ids: ["a"], path: ["A2"] },
      }).ok,
    ).toBe(false);
  });

  it("captures an unsupported general along the retreat without moving it into the path", () => {
    const current = state({
      terrain: {},
      units: {
        a: unit("a", "L6"),
        friend: unit("friend", "L5"),
        g: unit("g", "M4", { side: "union", kind: "general", combat: null }),
      },
    });
    const result = run(current, {
      command_name: "retreatStack",
      payload: {
        combat_id: BATTLE_ID,
        unit_ids: ["a"],
        path: ["L6", "L5", "L4"],
      },
    });
    expect(result).toMatchObject({
      ok: true,
      state: {
        units: {
          a: { location: "L4" },
          g: { status: "eliminated", location: null },
        },
      },
    });
    expect(current.units.g?.status).toBe("deployed");
  });

  it("takes exactly one extra loss, holds terrain, and does not offer advance into defenders", () => {
    const current = state({
      objectives: { L6: { controlled_by: "confederate", value: 2 } },
    });
    const result = run(current, hold);
    expect(result).toMatchObject({
      ok: true,
      state: {
        version: 1,
        event_sequence: 1,
        units: {
          a: {
            strength: "reduced",
            steps_remaining: 1,
            location: "L6",
            movement_spent: 5,
          },
        },
        objectives: current.objectives,
        victory: { confederate: 2, union: 1 },
        combats: {
          [BATTLE_ID]: {
            defender_retreated: true,
            status: "resolved",
            pending_choice: null,
          },
        },
      },
    });
    expect(current.units.a?.strength).toBe("full");
    if (result.ok) expect(run(result.state, hold).ok).toBe(false);
  });

  it("eliminates a reduced counter and its unsupported general, then offers the vacated hex", () => {
    const current = state();
    const result = run(
      state({
        units: {
          ...current.units,
          a: unit("a", "L6", { strength: "reduced", steps_remaining: 1 }),
          g: unit("g", "L6", { kind: "general", combat: null }),
        },
        combats: {
          [BATTLE_ID]: combat({
            pending_choice: {
              kind: "retreat",
              side: "confederate",
              unit_ids: ["a", "g"],
            },
          }),
        },
      }),
      hold,
    );
    expect(result).toMatchObject({
      ok: true,
      state: {
        units: { a: { status: "eliminated" }, g: { status: "eliminated" } },
        victory: { union: 5 },
        combats: {
          [BATTLE_ID]: {
            pending_choice: { kind: "advance", destination_hexes: ["L6"] },
          },
        },
      },
    });
  });

  it("does not charge each counter in a trapped stack or accept a general as the loss", () => {
    const current = state();
    const stacked = state({
      units: {
        ...current.units,
        b: unit("b", "L6"),
        g: unit("g", "L6", { kind: "general", combat: null }),
      },
      combats: {
        [BATTLE_ID]: combat({
          defenders: ["a", "b"],
          pending_choice: {
            kind: "retreat",
            side: "confederate",
            unit_ids: ["a", "b", "g"],
          },
        }),
      },
    });
    expect(run(stacked, hold)).toMatchObject({
      ok: true,
      state: {
        units: {
          a: { strength: "reduced" },
          b: { strength: "full" },
          g: { status: "deployed" },
        },
      },
    });
    expect(
      run(stacked, {
        command_name: "acceptTrappedLoss",
        payload: { combat_id: BATTLE_ID, unit_id: "g" },
      }).ok,
    ).toBe(false);
  });

  it("retains other original stacks in the pending choice", () => {
    const current = state();
    const result = run(
      state({
        units: { ...current.units, b: unit("b", "N6") },
        combats: {
          [BATTLE_ID]: combat({
            defenders: ["a", "b"],
            defender_hexes: ["L6", "N6"],
            pending_choice: {
              kind: "retreat",
              side: "confederate",
              unit_ids: ["a", "b"],
            },
          }),
        },
      }),
      hold,
    );
    expect(result).toMatchObject({
      ok: true,
      state: {
        combats: {
          [BATTLE_ID]: {
            status: "pending_choice",
            pending_choice: { kind: "retreat", unit_ids: ["b"] },
          },
        },
      },
    });
  });

  it("offers a free permanent exit instead of loss for a blocked edge stack", () => {
    const current = state({
      units: {
        a: unit("a", "A2", { strength: "reduced", steps_remaining: 1 }),
        enemy: unit("enemy", "A3", { side: "union" }),
      },
      combats: {
        [BATTLE_ID]: combat({ attacker_hexes: ["A3"], defender_hexes: ["A2"] }),
      },
    });
    const result = run(current, {
      command_name: "retreatOffBoard",
      payload: { combat_id: BATTLE_ID, unit_ids: ["a"], path: ["A2"] },
    });
    expect(result).toMatchObject({
      ok: true,
      state: {
        units: {
          a: {
            status: "exited",
            location: null,
            strength: "reduced",
            movement_spent: 5,
          },
        },
        victory: { union: 0 },
        combats: {
          [BATTLE_ID]: {
            pending_choice: { kind: "advance", destination_hexes: ["A2"] },
          },
        },
      },
    });
  });

  it("applies the shared route preview, captures intermediate objectives, and preserves movement", () => {
    const current = state();
    const marching = state({
      terrain: {},
      units: { ...current.units, friend: unit("friend", "L5") },
      objectives: {
        L5: { controlled_by: "union", value: 1 },
        L4: { controlled_by: "union", value: 2 },
      },
    });
    const path = ["L6", "L5", "L4"] as const;
    const preview = prepareForcedRetreat(
      marching,
      "confederate",
      BATTLE_ID,
      ["a"],
      path,
    );
    const result = run(marching, {
      command_name: "retreatStack",
      payload: { combat_id: BATTLE_ID, unit_ids: ["a"], path: [...path] },
    });
    expect(preview.ok && result.ok).toBe(true);
    if (preview.ok && result.ok) {
      expect(result.state).toMatchObject(preview.patch);
      expect(result.state.units.a).toMatchObject({
        location: "L4",
        movement_spent: 5,
      });
      expect(result.state.victory.confederate).toBe(3);
      expect(JSON.parse(JSON.stringify(result.state))).toEqual(result.state);
    }
  });

  it("requires the complete original stack for single and multi-counter retreat commands", () => {
    const current = state();
    const stacked = state({
      terrain: {},
      units: {
        ...current.units,
        g: unit("g", "L6", { kind: "general", combat: null }),
      },
      combats: {
        [BATTLE_ID]: combat({
          pending_choice: {
            kind: "retreat",
            side: "confederate",
            unit_ids: ["a", "g"],
          },
        }),
      },
    });
    expect(
      run(stacked, {
        command_name: "retreatUnit",
        payload: { combat_id: BATTLE_ID, unit_id: "a", destination: "L5" },
      }).ok,
    ).toBe(false);
    expect(
      run(stacked, {
        command_name: "retreatStack",
        payload: { combat_id: BATTLE_ID, unit_ids: ["a"], path: ["L6", "L5"] },
      }).ok,
    ).toBe(false);
    expect(
      run(stacked, {
        command_name: "retreatStack",
        payload: {
          combat_id: BATTLE_ID,
          unit_ids: ["g", "a"],
          path: ["L6", "L5"],
        },
      }).ok,
    ).toBe(true);
  });

  it("rejects terrain-prohibited retreats and leaves legacy paths unchanged", () => {
    const current = state();
    const command = {
      command_name: "retreatUnit",
      payload: { combat_id: BATTLE_ID, unit_id: "a", destination: "L5" },
    } as const;
    expect(run(current, command).ok).toBe(false);
    expect(
      run({ ...current, ruleset_version: RULESET_VERSION }, command).ok,
    ).toBe(true);
    expect(run({ ...current, ruleset_version: RULESET_VERSION }, hold).ok).toBe(
      false,
    );
    expect(
      run(
        { ...current, ruleset_version: RULESET_VERSION },
        {
          command_name: "retreatOffBoard",
          payload: { combat_id: BATTLE_ID, unit_ids: ["a"], path: ["L6"] },
        },
      ).ok,
    ).toBe(false);
  });

  it("cannot take a loss when a legal retreat exists or act for the other seat", () => {
    expect(run(state({ terrain: {} }), hold).ok).toBe(false);
    expect(run(state(), hold, "union").ok).toBe(false);
    expect(run(state({ phase: "movement" }), hold).ok).toBe(false);
    expect(run(state({ combats: {} }), hold).ok).toBe(false);
  });

  it("enforces ZOC priority in single-unit commands", () => {
    const current = state();
    const threatened = state({
      terrain: {},
      units: {
        ...current.units,
        other: unit("other", "M5", { side: "union" }),
      },
    });
    expect(
      run(threatened, {
        command_name: "retreatUnit",
        payload: { combat_id: BATTLE_ID, unit_id: "a", destination: "L5" },
      }).ok,
    ).toBe(false);
    expect(
      run(threatened, {
        command_name: "retreatUnit",
        payload: { combat_id: BATTLE_ID, unit_id: "a", destination: "K6" },
      }).ok,
    ).toBe(true);
  });
});
