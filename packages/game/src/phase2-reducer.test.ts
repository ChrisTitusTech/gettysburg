import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  COMMAND_SCHEMA_VERSION,
  type GameState,
  type GameplayCommand,
  type Side,
  type UnitState,
} from "./protocol";
import { reduceGameplayCommand } from "./reducer";

const gameId = "11111111-1111-4111-8111-111111111111";

function unit(
  id: string,
  side: Side,
  kind: UnitState["kind"],
  location: UnitState["location"],
  patch: Partial<UnitState> = {},
): UnitState {
  return {
    combat: kind === "general" ? null : 3,
    entry_hexes: [],
    entry_turn: null,
    id,
    kind,
    label: id,
    location,
    movement: kind === "general" ? 10 : 5,
    organization: "test",
    side,
    status: location === null ? "reinforcement" : "deployed",
    steps_remaining: kind === "general" ? 1 : 2,
    strength: "full",
    ...patch,
  };
}

function state(patch: Partial<GameState> = {}): GameState {
  return {
    active_side: "confederate",
    combats: {},
    content_revision: "test-content-v1",
    event_sequence: 0,
    game_id: gameId,
    night: false,
    objectives: {},
    phase: "movement",
    ruleset_version: "phase-2-tabletop-v1",
    turn: 1,
    units: {},
    version: 0,
    victory: {
      confederate: 0,
      status: "in-progress",
      union: 0,
    },
    ...patch,
  };
}

function command(
  name: GameplayCommand["command_name"],
  payload: Record<string, unknown>,
  expectedVersion = 0,
): GameplayCommand {
  return {
    command_id: randomUUID(),
    command_name: name,
    expected_version: expectedVersion,
    game_id: gameId,
    payload,
    schema: COMMAND_SCHEMA_VERSION,
  } as GameplayCommand;
}

function accept(
  current: GameState,
  side: Side,
  nextCommand: GameplayCommand,
  dice?: { attacker: number; defender: number },
) {
  const result = reduceGameplayCommand(current, side, nextCommand, {
    ...(dice === undefined ? {} : { dice }),
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.failure.message);
  return result.state;
}

describe("24-turn phase table", () => {
  it.each([
    [24, "combat", "confederate", 24, "movement", "union"],
    [23, "combat", "union", 24, "movement", "confederate"],
  ] as const)(
    "transitions turn %i %s %s",
    (turn, phase, side, nextTurn, nextPhase, nextSide) => {
      const current = state({ active_side: side, phase, turn });
      const result = accept(current, side, command("endPhase", {}));
      expect(result).toMatchObject({
        active_side: nextSide,
        phase: nextPhase,
        turn: nextTurn,
        version: 1,
      });
    },
  );

  it.each([
    [1, "confederate"],
    [12, "union"],
  ] as const)(
    "enters turn %i %s combat when opposing combat units are adjacent",
    (turn, side) => {
      const enemySide = side === "confederate" ? "union" : "confederate";
      const current = state({
        active_side: side,
        turn,
        units: {
          attacker: unit("attacker", side, "infantry", "A1"),
          defender: unit("defender", enemySide, "infantry", "B1"),
        },
      });
      expect(accept(current, side, command("endPhase", {}))).toMatchObject({
        active_side: side,
        phase: "combat",
        turn,
        version: 1,
      });
    },
  );

  it.each([
    [2, "confederate", 2, "union"],
    [1, "union", 2, "confederate"],
  ] as const)(
    "skips turn %i %s combat when no enemy combat unit is adjacent",
    (turn, side, nextTurn, nextSide) => {
      const enemySide = side === "confederate" ? "union" : "confederate";
      const current = state({
        active_side: side,
        turn,
        units: {
          friendly: unit("friendly", side, "infantry", "A1"),
          distantEnemy: unit("distantEnemy", enemySide, "infantry", "U11"),
        },
      });
      expect(accept(current, side, command("endPhase", {}))).toMatchObject({
        active_side: nextSide,
        phase: "movement",
        turn: nextTurn,
        version: 1,
      });
    },
  );

  it("completes after Union combat on turn 24", () => {
    expect(
      accept(
        state({ active_side: "union", phase: "combat", turn: 24 }),
        "union",
        command("endPhase", {}),
      ),
    ).toMatchObject({ active_side: null, phase: "completed", turn: 24 });
  });

  it("marks night turns and applies the scenario-five automatic victory", () => {
    const turn8 = state({
      active_side: "union",
      night: true,
      objectives: { F6: { controlled_by: "confederate", value: 5 } },
      phase: "combat",
      turn: 8,
    });
    expect(accept(turn8, "union", command("endPhase", {}))).toMatchObject({
      active_side: null,
      night: true,
      phase: "completed",
      victory: { confederate: 5, status: "confederate", union: 0 },
    });

    const turn7 = state({ active_side: "union", phase: "combat", turn: 7 });
    expect(accept(turn7, "union", command("endPhase", {}))).toMatchObject({
      night: true,
      turn: 8,
    });
  });
});

describe("Phase 2 stacking capacity", () => {
  const cases = [
    ["combat into empty", "infantry", [], true],
    ["general into empty", "general", [], true],
    ["combat into general only", "infantry", ["general"], true],
    ["combat into combat only", "infantry", ["infantry"], false],
    ["general into combat only", "general", ["infantry"], true],
    [
      "combat into general plus one combat",
      "infantry",
      ["general", "infantry"],
      true,
    ],
    [
      "general into general plus one combat",
      "general",
      ["general", "infantry"],
      false,
    ],
    [
      "combat into full general stack",
      "infantry",
      ["general", "infantry", "artillery"],
      false,
    ],
  ] as const;

  it.each(cases)("handles %s", (_label, moverKind, occupantKinds, allowed) => {
    const units: Record<string, UnitState> = {
      mover: unit("mover", "confederate", moverKind, "A1"),
    };
    occupantKinds.forEach((kind, index) => {
      units[`occupant-${index}`] = unit(
        `occupant-${index}`,
        "confederate",
        kind,
        "B1",
      );
    });
    const result = reduceGameplayCommand(
      state({ units }),
      "confederate",
      command("moveUnit", { destination: "B1", unit_id: "mover" }),
    );
    expect(result.ok).toBe(allowed);
    if (!allowed && !result.ok) expect(result.failure.error).toBe("occupied");
  });

  it("moves a legal stack atomically at its slowest counter's allowance", () => {
    const units = {
      infantry: unit("infantry", "confederate", "infantry", "A1", {
        movement: 3,
      }),
      leader: unit("leader", "confederate", "general", "A1"),
    };
    const moved = accept(
      state({ units }),
      "confederate",
      command("moveStack", {
        destination: "B1",
        unit_ids: ["infantry", "leader"],
      }),
    );
    expect(moved.units.infantry).toMatchObject({
      location: "B1",
      movement_spent: 1,
    });
    expect(moved.units.leader).toMatchObject({
      location: "B1",
      movement_spent: 1,
    });

    const rejected = reduceGameplayCommand(
      state({ units }),
      "confederate",
      command("moveStack", {
        destination: "E1",
        unit_ids: ["infantry", "leader"],
      }),
    );
    expect(rejected).toMatchObject({
      failure: { error: "movement_exceeded" },
      ok: false,
    });
    if (!rejected.ok) {
      expect(rejected.failure.current_version).toBe(0);
    }
  });
});

describe("objective and casualty scoring", () => {
  it("transfers control on entry and scores reduced and eliminated enemies", () => {
    const units = {
      mover: unit("mover", "confederate", "infantry", "A1", {
        movement: 10,
      }),
      reduced: unit("reduced", "union", "infantry", "B1", {
        steps_remaining: 1,
        strength: "reduced",
      }),
      eliminated: unit("eliminated", "union", "infantry", null, {
        combat: 4,
        status: "eliminated",
        steps_remaining: 0,
        strength: "eliminated",
      }),
    };
    const moved = accept(
      state({
        objectives: { F6: { controlled_by: "union", value: 5 } },
        units,
      }),
      "confederate",
      command("moveUnit", { destination: "F6", unit_id: "mover" }),
    );
    expect(moved.objectives.F6?.controlled_by).toBe("confederate");
    expect(moved.victory).toMatchObject({ confederate: 10, union: 0 });
  });
});

describe("reinforcement entry", () => {
  const reinforcement = unit("reinforcement", "union", "infantry", null, {
    entry_hexes: ["A8"],
    entry_turn: 2,
  });

  it("rejects early and wrong-hex entry, then enters once on schedule", () => {
    const early = reduceGameplayCommand(
      state({ active_side: "union", units: { reinforcement } }),
      "union",
      command("enterReinforcement", {
        destination: "A8",
        unit_id: reinforcement.id,
      }),
    );
    expect(early).toMatchObject({
      failure: { error: "reinforcement_early" },
      ok: false,
    });

    const scheduled = state({
      active_side: "union",
      turn: 2,
      units: { reinforcement },
    });
    const wrongHex = reduceGameplayCommand(
      scheduled,
      "union",
      command("enterReinforcement", {
        destination: "B8",
        unit_id: reinforcement.id,
      }),
    );
    expect(wrongHex).toMatchObject({
      failure: { error: "invalid_hex" },
      ok: false,
    });

    const entered = accept(
      scheduled,
      "union",
      command("enterReinforcement", {
        destination: "A8",
        unit_id: reinforcement.id,
      }),
    );
    expect(entered.units.reinforcement).toMatchObject({
      location: "A8",
      status: "deployed",
    });
    expect(
      reduceGameplayCommand(
        entered,
        "union",
        command(
          "enterReinforcement",
          { destination: "A8", unit_id: reinforcement.id },
          1,
        ),
      ),
    ).toMatchObject({ failure: { error: "already_entered" }, ok: false });
  });
});

describe("automatic combat workflow", () => {
  const combatId = "22222222-2222-4222-8222-222222222222";
  const units = {
    attacker: unit("attacker", "confederate", "infantry", "A1"),
    attackerGeneral: unit("attackerGeneral", "confederate", "general", "A1"),
    blocker: unit("blocker", "union", "infantry", "C1"),
    defender: unit("defender", "union", "infantry", "B1"),
    defenderGeneral: unit("defenderGeneral", "union", "general", "B1"),
  };

  function rolledCombat(
    dice: { attacker: number; defender: number } = {
      attacker: 7,
      defender: 3,
    },
  ) {
    return accept(
      state({ phase: "combat", units }),
      "confederate",
      command("declareCombat", {
        attackers: ["attacker"],
        combat_id: combatId,
        defenders: ["defender"],
      }),
      dice,
    );
  }

  it("rejects a declaration with nonadjacent opposing participants", () => {
    const distantUnits = {
      ...units,
      defender: unit("defender", "union", "infantry", "U11"),
    };
    expect(
      reduceGameplayCommand(
        state({ phase: "combat", units: distantUnits }),
        "confederate",
        command("declareCombat", {
          attackers: ["attacker"],
          combat_id: combatId,
          defenders: ["defender"],
        }),
      ),
    ).toMatchObject({
      failure: {
        error: "combat_invalid",
        message:
          "Every combat participant must be adjacent to an opposing participant.",
      },
      ok: false,
    });
  });

  it("requires every combat unit stacked in a participating hex", () => {
    const stackedUnits = {
      ...units,
      support: unit("support", "confederate", "artillery", "A1"),
    };
    expect(
      reduceGameplayCommand(
        state({ phase: "combat", units: stackedUnits }),
        "confederate",
        command("declareCombat", {
          attackers: ["attacker"],
          combat_id: combatId,
          defenders: ["defender"],
        }),
      ),
    ).toMatchObject({
      failure: {
        error: "combat_invalid",
        message:
          "All combat units stacked in a participating hex must fight together.",
      },
      ok: false,
    });
  });

  it("rolls on declaration and calculates the rules-table result", () => {
    const current = rolledCombat();
    expect(current.combats[combatId]).toMatchObject({
      rolls: { attacker: 7, defender: 3 },
      status: "awaiting_result_confirmation",
    });
    const confirmed = accept(
      current,
      "confederate",
      command("confirmCombatResult", { combat_id: combatId }, 1),
    );
    expect(confirmed.combats[combatId]).toMatchObject({
      confirmation: {
        advance_offered: true,
        attacker_losses: 0,
        attacker_modifier: 3,
        attacker_retreat: false,
        defender_losses: 1,
        defender_modifier: 3,
        defender_retreat: true,
        result: "attacker_win",
      },
      pending_choice: { count: 1, kind: "loss", side: "union" },
      status: "pending_choice",
    });
  });

  it("awards a tied modified total to the defender", () => {
    const confirmed = accept(
      rolledCombat({ attacker: 5, defender: 5 }),
      "confederate",
      command("confirmCombatResult", { combat_id: combatId }, 1),
    );
    expect(confirmed.combats[combatId]).toMatchObject({
      confirmation: {
        attacker_losses: 0,
        attacker_retreat: true,
        defender_losses: 0,
        defender_retreat: false,
        result: "defender_win",
      },
      pending_choice: { kind: "retreat", side: "confederate" },
    });
  });

  it.each([
    [2, 0],
    [3, 1],
    [6, 2],
  ])("applies %i-point margin as %i loss(es)", (margin, losses) => {
    const confirmed = accept(
      rolledCombat({ attacker: margin + 1, defender: 1 }),
      "confederate",
      command("confirmCombatResult", { combat_id: combatId }, 1),
    );
    expect(confirmed.combats[combatId]?.confirmation?.defender_losses).toBe(
      losses,
    );
  });

  it("sequences loss, retreat, and advance choices by owning seat", () => {
    let current = accept(
      rolledCombat(),
      "confederate",
      command("confirmCombatResult", { combat_id: combatId }, 1),
    );
    expect(current.combats[combatId]?.pending_choice).toMatchObject({
      kind: "loss",
      side: "union",
    });
    current = accept(
      current,
      "union",
      command(
        "allocateLoss",
        { allocations: { defender: 1 }, combat_id: combatId },
        2,
      ),
    );
    expect(current.units.defender?.strength).toBe("reduced");
    expect(current.combats[combatId]?.pending_choice).toMatchObject({
      kind: "retreat",
      side: "union",
      unit_ids: ["defender", "defenderGeneral"],
    });
    expect(
      reduceGameplayCommand(
        current,
        "union",
        command(
          "retreatUnit",
          { combat_id: combatId, destination: "C1", unit_id: "defender" },
          3,
        ),
      ),
    ).toMatchObject({
      failure: {
        error: "pending_choice",
        message: "Counters that started together must retreat together.",
      },
      ok: false,
    });
    current = accept(
      current,
      "union",
      command(
        "retreatStack",
        {
          combat_id: combatId,
          path: ["B1", "C1", "D1"],
          unit_ids: ["defender", "defenderGeneral"],
        },
        3,
      ),
    );
    expect(current.units.defenderGeneral?.location).toBe("D1");
    expect(current.combats[combatId]?.pending_choice).toMatchObject({
      destination_hexes: ["B1"],
      eligible_unit_ids: ["attacker", "attackerGeneral"],
      kind: "advance",
      side: "confederate",
    });
    current = accept(
      current,
      "confederate",
      command(
        "advanceAfterCombat",
        {
          combat_id: combatId,
          decline: false,
          destination: "B1",
          unit_ids: ["attacker", "attackerGeneral"],
        },
        4,
      ),
    );
    expect(current.combats[combatId]?.status).toBe("resolved");
    expect(current.units.attacker?.location).toBe("B1");
    expect(current.units.attackerGeneral?.location).toBe("B1");
  });
});
