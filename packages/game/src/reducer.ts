import { adjacentHexes, hexDistance, isHexCoordinate } from "./coordinates.js";
import type { HexCoordinate } from "./coordinates.js";
import { automaticCombatResolution, combatSkirmishes } from "./combat.js";
import { enemyZoneOfControl, nightMovementPath } from "./zoc.js";
import type {
  CombatState,
  CommandFailure,
  CommandSuccess,
  GameState,
  GameplayCommand,
  PendingCombatChoice,
  Side,
  UnitState,
} from "./protocol.js";

export type ReducerResult =
  | { readonly failure: CommandFailure; readonly ok: false }
  | { readonly ok: true; readonly state: GameState; readonly summary: string };

function failure(
  state: GameState,
  error: CommandFailure["error"],
  message: string,
): ReducerResult {
  return {
    failure: { current_version: state.version, error, message, ok: false },
    ok: false,
  };
}

function accepted(
  state: GameState,
  patch: Partial<GameState>,
  summary: string,
): ReducerResult {
  const next = {
    ...state,
    ...patch,
    event_sequence: state.event_sequence + 1,
    version: state.version + 1,
  };
  return {
    ok: true,
    state: {
      ...next,
      victory: scoreVictory(next, next.victory.status),
    },
    summary,
  };
}

function otherSide(side: Side): Side {
  return side === "confederate" ? "union" : "confederate";
}

function scoreVictory(
  state: GameState,
  status: GameState["victory"]["status"] = "in-progress",
): GameState["victory"] {
  const score: Record<Side, number> = { confederate: 0, union: 0 };
  for (const objective of Object.values(state.objectives)) {
    score[objective.controlled_by] += objective.value;
  }
  for (const unit of Object.values(state.units)) {
    if (unit.kind === "general") continue;
    const beneficiary = otherSide(unit.side);
    if (unit.status === "eliminated") {
      score[beneficiary] += unit.combat ?? 0;
    } else if (unit.strength === "reduced") {
      score[beneficiary] += 1;
    }
  }
  return { ...score, status };
}

function objectivesAfterEntry(
  state: GameState,
  destination: string,
  side: Side,
): GameState["objectives"] {
  const objective = state.objectives[destination];
  if (objective === undefined || objective.controlled_by === side)
    return state.objectives;
  return {
    ...state.objectives,
    [destination]: { ...objective, controlled_by: side },
  };
}

function phaseAuthorization(
  state: GameState,
  actorSide: Side,
  phase: GameState["phase"],
) {
  if (state.active_side !== actorSide) {
    return failure(state, "wrong_seat", "It is not this seat's turn.");
  }
  if (state.phase !== phase) {
    return failure(
      state,
      "phase_invalid",
      `This command requires the ${phase} phase.`,
    );
  }
  return null;
}

function destinationCanAccept(
  state: GameState,
  mover: UnitState,
  destination: string,
): boolean {
  return destinationCanAcceptUnits(state, [mover], destination);
}

function destinationCanAcceptUnits(
  state: GameState,
  movers: readonly UnitState[],
  destination: string,
): boolean {
  const moverIds = new Set(movers.map((unit) => unit.id));
  const occupants = Object.values(state.units).filter(
    (unit) =>
      !moverIds.has(unit.id) &&
      unit.status === "deployed" &&
      unit.location === destination,
  );
  if (occupants.some((unit) => unit.side !== movers[0]?.side)) return false;
  return stackIsWithinCapacity([...occupants, ...movers]);
}

function stackIsWithinCapacity(units: readonly UnitState[]): boolean {
  const generals = units.filter((unit) => unit.kind === "general").length;
  const combatUnits = units.length - generals;
  return generals <= 1 && combatUnits <= (generals === 1 ? 2 : 1);
}

function sourceStacksRemainValid(
  state: GameState,
  movers: readonly UnitState[],
  destination: string,
): boolean {
  const moverIds = new Set(movers.map((unit) => unit.id));
  const sources = new Set(
    movers.flatMap((unit) =>
      unit.location === null || unit.location === destination
        ? []
        : [unit.location],
    ),
  );
  return [...sources].every((source) =>
    stackIsWithinCapacity(
      Object.values(state.units).filter(
        (unit) =>
          !moverIds.has(unit.id) &&
          unit.status === "deployed" &&
          unit.location === source,
      ),
    ),
  );
}

function moveUnit(
  state: GameState,
  actorSide: Side,
  command: Extract<GameplayCommand, { command_name: "moveUnit" }>,
): ReducerResult {
  const unauthorized = phaseAuthorization(state, actorSide, "movement");
  if (unauthorized !== null) return unauthorized;
  const { destination, unit_id: unitId } = command.payload;
  if (!isHexCoordinate(destination)) {
    return failure(state, "invalid_hex", "Choose a playable board hex.");
  }
  const unit = state.units[unitId];
  if (unit === undefined)
    return failure(state, "unit_not_found", "That counter does not exist.");
  if (unit.side !== actorSide)
    return failure(state, "wrong_seat", "You may move only your own counter.");
  if (unit.status !== "deployed" || unit.location === null) {
    return failure(state, "phase_invalid", "Only deployed counters can move.");
  }
  const path = nightMovementPath(state, actorSide, unit.location, destination);
  if (state.night && path.at(-1) !== destination) {
    return failure(
      state,
      "phase_invalid",
      "Night movement must withdraw from and may not enter an enemy zone of control.",
    );
  }
  const distance = state.night
    ? path.length - 1
    : hexDistance(unit.location, destination);
  const movementRemaining = unit.movement - (unit.movement_spent ?? 0);
  if (distance > movementRemaining) {
    return failure(
      state,
      "movement_exceeded",
      `${unit.label} has ${movementRemaining} movement point${movementRemaining === 1 ? "" : "s"} remaining; ${destination} ${state.night ? `requires ${distance} movement points by the safe night route` : `is ${distance} hexes away`}.`,
    );
  }
  if (!destinationCanAccept(state, unit, destination)) {
    return failure(
      state,
      "occupied",
      "That destination is at its Phase 2 stacking capacity.",
    );
  }
  if (!sourceStacksRemainValid(state, [unit], destination)) {
    return failure(
      state,
      "occupied",
      "Moving that counter would leave its source stack over capacity.",
    );
  }
  return accepted(
    state,
    {
      objectives: objectivesAfterEntry(state, destination, unit.side),
      units: {
        ...state.units,
        [unit.id]: {
          ...unit,
          location: destination,
          movement_spent: (unit.movement_spent ?? 0) + distance,
        },
      },
    },
    `${unit.label} moved to ${destination} (${distance} movement)`,
  );
}

function moveStack(
  state: GameState,
  actorSide: Side,
  command: Extract<GameplayCommand, { command_name: "moveStack" }>,
): ReducerResult {
  const unauthorized = phaseAuthorization(state, actorSide, "movement");
  if (unauthorized !== null) return unauthorized;
  const { destination, unit_ids: unitIds } = command.payload;
  if (!isHexCoordinate(destination)) {
    return failure(state, "invalid_hex", "Choose a playable board hex.");
  }
  if (new Set(unitIds).size !== unitIds.length) {
    return failure(state, "phase_invalid", "Stack counters must be unique.");
  }
  const units = unitIds.map((id) => state.units[id]);
  if (units.some((unit) => unit === undefined)) {
    return failure(state, "unit_not_found", "A stack counter does not exist.");
  }
  const movers = units as UnitState[];
  if (movers.some((unit) => unit.side !== actorSide)) {
    return failure(state, "wrong_seat", "You may move only your own stack.");
  }
  const source = movers[0]?.location;
  if (
    source === null ||
    source === undefined ||
    movers.some(
      (unit) => unit.status !== "deployed" || unit.location !== source,
    )
  ) {
    return failure(
      state,
      "phase_invalid",
      "Stack movement requires deployed counters in one hex.",
    );
  }
  const path = nightMovementPath(state, actorSide, source, destination);
  if (state.night && path.at(-1) !== destination) {
    return failure(
      state,
      "phase_invalid",
      "Night movement must withdraw from and may not enter an enemy zone of control.",
    );
  }
  const distance = state.night
    ? path.length - 1
    : hexDistance(source, destination);
  const limitingUnit = movers.find(
    (unit) => distance > unit.movement - (unit.movement_spent ?? 0),
  );
  if (limitingUnit !== undefined) {
    const remaining =
      limitingUnit.movement - (limitingUnit.movement_spent ?? 0);
    return failure(
      state,
      "movement_exceeded",
      `${limitingUnit.label} limits this stack to ${remaining} remaining movement point${remaining === 1 ? "" : "s"}.`,
    );
  }
  if (!destinationCanAcceptUnits(state, movers, destination)) {
    return failure(
      state,
      "occupied",
      "That destination is at its Phase 2 stacking capacity.",
    );
  }
  if (!sourceStacksRemainValid(state, movers, destination)) {
    return failure(
      state,
      "occupied",
      "Moving those counters would leave their source stack over capacity.",
    );
  }
  const movedUnits = { ...state.units };
  for (const unit of movers) {
    movedUnits[unit.id] = {
      ...unit,
      location: destination,
      movement_spent: (unit.movement_spent ?? 0) + distance,
    };
  }
  return accepted(
    state,
    {
      objectives: objectivesAfterEntry(state, destination, actorSide),
      units: movedUnits,
    },
    `${movers.length} stacked counters moved to ${destination} (${distance} movement)`,
  );
}

function resetMovementForSide(state: GameState, side: Side) {
  return Object.fromEntries(
    Object.entries(state.units).map(([id, unit]) => [
      id,
      unit.side === side ? { ...unit, movement_spent: 0 } : unit,
    ]),
  );
}

function isEligibleCombatUnit(unit: UnitState): boolean {
  return (
    unit.kind !== "general" &&
    unit.status === "deployed" &&
    unit.location !== null
  );
}

function unitsAreAdjacent(left: UnitState, right: UnitState): boolean {
  return (
    left.location !== null &&
    right.location !== null &&
    adjacentHexes(left.location).includes(right.location)
  );
}

function hasAdjacentEnemy(state: GameState, side: Side): boolean {
  const units = Object.values(state.units);
  const friendlyUnits = units.filter(
    (unit) => unit.side === side && isEligibleCombatUnit(unit),
  );
  const enemyUnits = units.filter(
    (unit) => unit.side !== side && isEligibleCombatUnit(unit),
  );
  return friendlyUnits.some((friendly) =>
    enemyUnits.some((enemy) => unitsAreAdjacent(friendly, enemy)),
  );
}

function nightUnitsAbleToWithdraw(
  state: GameState,
  side: Side,
): readonly UnitState[] {
  if (!state.night) return [];
  const enemyZoc = enemyZoneOfControl(state, side);
  return Object.values(state.units).filter((unit) => {
    if (
      unit.side !== side ||
      unit.status !== "deployed" ||
      unit.location === null ||
      !enemyZoc.has(unit.location) ||
      unit.movement - (unit.movement_spent ?? 0) < 1
    ) {
      return false;
    }
    return adjacentHexes(unit.location).some(
      (destination) =>
        !enemyZoc.has(destination) &&
        destinationCanAccept(state, unit, destination),
    );
  });
}

function enterReinforcement(
  state: GameState,
  actorSide: Side,
  command: Extract<GameplayCommand, { command_name: "enterReinforcement" }>,
): ReducerResult {
  const unauthorized = phaseAuthorization(state, actorSide, "movement");
  if (unauthorized !== null) return unauthorized;
  const { destination, unit_id: unitId } = command.payload;
  const unit = state.units[unitId];
  if (unit === undefined)
    return failure(state, "unit_not_found", "That counter does not exist.");
  if (unit.side !== actorSide)
    return failure(
      state,
      "wrong_seat",
      "That reinforcement belongs to the other seat.",
    );
  if (unit.status !== "reinforcement") {
    return failure(
      state,
      "already_entered",
      "That counter is not an available reinforcement.",
    );
  }
  if (unit.entry_turn === null || state.turn < unit.entry_turn) {
    return failure(
      state,
      "reinforcement_early",
      "That reinforcement is not yet available.",
    );
  }
  if (!unit.entry_hexes.includes(destination)) {
    return failure(
      state,
      "invalid_hex",
      "Choose one of the counter's approved entry hexes.",
    );
  }
  if (state.night && enemyZoneOfControl(state, actorSide).has(destination)) {
    return failure(
      state,
      "phase_invalid",
      "Reinforcements may not enter an enemy zone of control at night.",
    );
  }
  if (!destinationCanAccept(state, unit, destination)) {
    return failure(
      state,
      "occupied",
      "That entry hex is at its Phase 2 stacking capacity.",
    );
  }
  return accepted(
    state,
    {
      objectives: objectivesAfterEntry(state, destination, unit.side),
      units: {
        ...state.units,
        [unit.id]: { ...unit, location: destination, status: "deployed" },
      },
    },
    `${unit.label} entered at ${destination}`,
  );
}

function declareCombat(
  state: GameState,
  actorSide: Side,
  command: Extract<GameplayCommand, { command_name: "declareCombat" }>,
  dice: { readonly attacker: number; readonly defender: number } | undefined,
): ReducerResult {
  const unauthorized = phaseAuthorization(state, actorSide, "combat");
  if (unauthorized !== null) return unauthorized;
  const { attackers, combat_id: combatId, defenders } = command.payload;
  if (state.combats[combatId] !== undefined) {
    return failure(
      state,
      "combat_invalid",
      "That combat identifier is already in use.",
    );
  }
  const allIds = [...attackers, ...defenders];
  if (new Set(allIds).size !== allIds.length) {
    return failure(
      state,
      "combat_invalid",
      "Combat participants must be unique.",
    );
  }
  const committed = new Set(
    Object.values(state.combats).flatMap((combat) => [
      ...combat.attackers,
      ...combat.defenders,
    ]),
  );
  for (const [index, unitId] of allIds.entries()) {
    const unit = state.units[unitId];
    const expectedSide =
      index < attackers.length ? actorSide : otherSide(actorSide);
    if (
      unit === undefined ||
      unit.side !== expectedSide ||
      unit.kind === "general" ||
      unit.status !== "deployed" ||
      unit.location === null ||
      committed.has(unitId)
    ) {
      return failure(
        state,
        "combat_invalid",
        "Combat participants must be eligible deployed units.",
      );
    }
  }
  const attackerUnits = attackers.map((unitId) => state.units[unitId]!);
  const defenderUnits = defenders.map((unitId) => state.units[unitId]!);
  const participantIds = new Set(allIds);
  if (
    [...attackerUnits, ...defenderUnits].some((unit) =>
      Object.values(state.units).some(
        (candidate) =>
          candidate.id !== unit.id &&
          candidate.side === unit.side &&
          candidate.location === unit.location &&
          isEligibleCombatUnit(candidate) &&
          !participantIds.has(candidate.id),
      ),
    )
  ) {
    return failure(
      state,
      "combat_invalid",
      "All combat units stacked in a participating hex must fight together.",
    );
  }
  if (
    attackerUnits.some(
      (attacker) =>
        !defenderUnits.some((defender) => unitsAreAdjacent(attacker, defender)),
    ) ||
    defenderUnits.some(
      (defender) =>
        !attackerUnits.some((attacker) => unitsAreAdjacent(attacker, defender)),
    )
  ) {
    return failure(
      state,
      "combat_invalid",
      "Every combat participant must be adjacent to an opposing participant.",
    );
  }
  const attackerHexes = new Set(attackerUnits.map((unit) => unit.location));
  const defenderHexes = new Set(defenderUnits.map((unit) => unit.location));
  if (attackerHexes.size > 1 && defenderHexes.size > 1) {
    return failure(
      state,
      "combat_invalid",
      "Separate this combat so one side occupies a single hex.",
    );
  }
  if (dice === undefined || !validDice(dice)) {
    return failure(
      state,
      "combat_invalid",
      "Server dice must be in the range 1 through 10.",
    );
  }
  const combat: CombatState = {
    attacker_loss_allocated: false,
    attacker_retreated: false,
    attacker_hexes: [...attackerHexes].sort() as HexCoordinate[],
    attackers,
    confirmation: null,
    defender_loss_allocated: false,
    defender_retreated: false,
    defenders,
    defender_hexes: [...defenderHexes].sort() as HexCoordinate[],
    id: combatId,
    pending_choice: null,
    rolls: dice,
    status: "awaiting_result_confirmation",
  };
  return accepted(
    state,
    { combats: { ...state.combats, [combatId]: combat } },
    `Combat ${combatId} declared and rolled ${dice.attacker}-${dice.defender}`,
  );
}

function validDice(dice: {
  readonly attacker: number;
  readonly defender: number;
}): boolean {
  return (
    Number.isInteger(dice.attacker) &&
    Number.isInteger(dice.defender) &&
    dice.attacker >= 1 &&
    dice.attacker <= 10 &&
    dice.defender >= 1 &&
    dice.defender <= 10
  );
}

function rollCombat(
  state: GameState,
  actorSide: Side,
  command: Extract<GameplayCommand, { command_name: "rollCombat" }>,
  dice: { readonly attacker: number; readonly defender: number } | undefined,
): ReducerResult {
  const unauthorized = phaseAuthorization(state, actorSide, "combat");
  if (unauthorized !== null) return unauthorized;
  const combat = state.combats[command.payload.combat_id];
  if (
    combat === undefined ||
    combat.status !== "declared" ||
    dice === undefined
  ) {
    return failure(
      state,
      "combat_invalid",
      "That combat is not ready to roll.",
    );
  }
  if (!validDice(dice)) {
    return failure(
      state,
      "combat_invalid",
      "Server dice must be in the range 1 through 10.",
    );
  }
  const nextCombat: CombatState = {
    ...combat,
    rolls: dice,
    status: "awaiting_result_confirmation",
  };
  return accepted(
    state,
    { combats: { ...state.combats, [combat.id]: nextCombat } },
    `Combat ${combat.id} rolled ${dice.attacker}-${dice.defender}`,
  );
}

function nextChoice(state: GameState, combat: CombatState): CombatState {
  const confirmation = combat.confirmation;
  if (confirmation === null) return combat;
  let choice: PendingCombatChoice | null = null;
  if (!combat.attacker_loss_allocated && confirmation.attacker_losses > 0) {
    choice = {
      count: confirmation.attacker_losses,
      kind: "loss",
      side: state.active_side!,
      unit_ids: combat.attackers,
    };
  } else if (
    !combat.defender_loss_allocated &&
    confirmation.defender_losses > 0
  ) {
    choice = {
      count: confirmation.defender_losses,
      kind: "loss",
      side: otherSide(state.active_side!),
      unit_ids: combat.defenders,
    };
  } else if (!combat.attacker_retreated && confirmation.attacker_retreat) {
    const combatIds = combat.attackers.filter(
      (id) => state.units[id]?.status === "deployed",
    );
    const ids = stackedUnitsForSide(
      state,
      combatIds,
      state.active_side!,
      combat.attacker_hexes,
    );
    if (ids.length > 0)
      choice = { kind: "retreat", side: state.active_side!, unit_ids: ids };
  } else if (!combat.defender_retreated && confirmation.defender_retreat) {
    const combatIds = combat.defenders.filter(
      (id) => state.units[id]?.status === "deployed",
    );
    const ids = stackedUnitsForSide(
      state,
      combatIds,
      otherSide(state.active_side!),
      combat.defender_hexes,
    );
    if (ids.length > 0)
      choice = {
        kind: "retreat",
        side: otherSide(state.active_side!),
        unit_ids: ids,
      };
  } else if (confirmation.advance_offered) {
    const combatIds = combat.attackers.filter(
      (id) => state.units[id]?.status === "deployed",
    );
    const ids = stackedUnitsForSide(state, combatIds, state.active_side!);
    if (ids.length > 0)
      choice = {
        destination_hexes: combat.defender_hexes ?? [],
        eligible_unit_ids: ids,
        kind: "advance",
        side: state.active_side!,
      };
  }
  return {
    ...combat,
    pending_choice: choice,
    status: choice === null ? "resolved" : "pending_choice",
  };
}

function stackedUnitsForSide(
  state: GameState,
  combatUnitIds: readonly string[],
  side: Side,
  participantHexes?: readonly HexCoordinate[],
): string[] {
  const locations = new Set(
    participantHexes ??
      combatUnitIds.flatMap((id) => {
        const location = state.units[id]?.location;
        return location === null || location === undefined ? [] : [location];
      }),
  );
  const ids = [...combatUnitIds];
  for (const unit of Object.values(state.units)) {
    if (
      unit.side === side &&
      unit.status === "deployed" &&
      unit.location !== null &&
      locations.has(unit.location) &&
      !ids.includes(unit.id)
    ) {
      ids.push(unit.id);
    }
  }
  return ids;
}

function confirmCombatResult(
  state: GameState,
  actorSide: Side,
  command: Extract<GameplayCommand, { command_name: "confirmCombatResult" }>,
): ReducerResult {
  const unauthorized = phaseAuthorization(state, actorSide, "combat");
  if (unauthorized !== null) return unauthorized;
  const combat = state.combats[command.payload.combat_id];
  if (
    combat === undefined ||
    combat.status !== "awaiting_result_confirmation"
  ) {
    return failure(
      state,
      "combat_invalid",
      "That combat is not awaiting confirmation.",
    );
  }
  const resolution = automaticCombatResolution(state, combat);
  if (resolution === null) {
    return failure(
      state,
      "combat_invalid",
      "That combat has no server dice to confirm.",
    );
  }
  const nextCombat = nextChoice(state, {
    ...combat,
    confirmation: resolution.confirmation,
  });
  return accepted(
    state,
    { combats: { ...state.combats, [combat.id]: nextCombat } },
    `Combat ${combat.id} result confirmed`,
  );
}

function allocateLoss(
  state: GameState,
  actorSide: Side,
  command: Extract<GameplayCommand, { command_name: "allocateLoss" }>,
): ReducerResult {
  const combat = state.combats[command.payload.combat_id];
  const choice = combat?.pending_choice;
  if (
    combat === undefined ||
    choice?.kind !== "loss" ||
    choice.side !== actorSide
  ) {
    return failure(
      state,
      "pending_choice",
      "This seat does not own a pending loss choice.",
    );
  }
  const expectedIds = [...choice.unit_ids].sort();
  const suppliedIds = Object.keys(command.payload.allocations).sort();
  if (JSON.stringify(expectedIds) !== JSON.stringify(suppliedIds)) {
    return failure(
      state,
      "combat_invalid",
      "Loss allocations must name every owned participant exactly once.",
    );
  }
  const total = Object.values(command.payload.allocations).reduce(
    (sum, value) => sum + value,
    0,
  );
  if (total !== choice.count) {
    return failure(
      state,
      "combat_invalid",
      "Loss allocations must equal the pending loss count.",
    );
  }
  const units = { ...state.units };
  for (const id of choice.unit_ids) {
    const unit = units[id]!;
    const allocation = command.payload.allocations[id] ?? 0;
    if (allocation > unit.steps_remaining) {
      return failure(
        state,
        "combat_invalid",
        "A loss allocation exceeds a unit's available steps.",
      );
    }
    const steps = unit.steps_remaining - allocation;
    units[id] = {
      ...unit,
      location: steps === 0 ? null : unit.location,
      status: steps === 0 ? "eliminated" : unit.status,
      steps_remaining: steps,
      strength: steps === 0 ? "eliminated" : steps === 1 ? "reduced" : "full",
    };
  }
  const marked: CombatState = {
    ...combat,
    ...(actorSide === state.active_side
      ? { attacker_loss_allocated: true }
      : { defender_loss_allocated: true }),
    pending_choice: null,
  };
  const nextCombat = nextChoice({ ...state, units }, marked);
  return accepted(
    state,
    { combats: { ...state.combats, [combat.id]: nextCombat }, units },
    `Combat ${combat.id} losses allocated`,
  );
}

function retreatUnit(
  state: GameState,
  actorSide: Side,
  command: Extract<GameplayCommand, { command_name: "retreatUnit" }>,
): ReducerResult {
  const combat = state.combats[command.payload.combat_id];
  const choice = combat?.pending_choice;
  const unit = state.units[command.payload.unit_id];
  if (
    combat === undefined ||
    choice?.kind !== "retreat" ||
    choice.side !== actorSide ||
    unit === undefined ||
    !choice.unit_ids.includes(unit.id)
  ) {
    return failure(
      state,
      "pending_choice",
      "This unit is not awaiting retreat for this seat.",
    );
  }
  const sourceIds = choice.unit_ids.filter(
    (id) => state.units[id]?.location === unit.location,
  );
  if (sourceIds.length !== 1) {
    return failure(
      state,
      "pending_choice",
      "Counters that started together must retreat together.",
    );
  }
  return moveRetreatGroup(
    state,
    combat,
    choice,
    [unit],
    [unit.location!, command.payload.destination],
  );
}

function retreatStack(
  state: GameState,
  actorSide: Side,
  command: Extract<GameplayCommand, { command_name: "retreatStack" }>,
): ReducerResult {
  const combat = state.combats[command.payload.combat_id];
  const choice = combat?.pending_choice;
  if (
    combat === undefined ||
    choice?.kind !== "retreat" ||
    choice.side !== actorSide
  ) {
    return failure(
      state,
      "pending_choice",
      "This seat does not own a pending stack retreat.",
    );
  }
  const { path, unit_ids: unitIds } = command.payload;
  if (new Set(unitIds).size !== unitIds.length) {
    return failure(state, "combat_invalid", "Retreat counters must be unique.");
  }
  const movers = unitIds.flatMap((id) => {
    const unit = state.units[id];
    return unit === undefined ? [] : [unit];
  });
  const source = movers[0]?.location;
  const requiredIds = choice.unit_ids.filter(
    (id) => state.units[id]?.location === source,
  );
  if (
    movers.length !== unitIds.length ||
    source === null ||
    source === undefined ||
    movers.some(
      (unit) =>
        unit.side !== actorSide ||
        unit.status !== "deployed" ||
        unit.location !== source,
    ) ||
    requiredIds.length !== unitIds.length ||
    requiredIds.some((id) => !unitIds.includes(id))
  ) {
    return failure(
      state,
      "pending_choice",
      "Submit every retreating counter from exactly one original stack.",
    );
  }
  return moveRetreatGroup(state, combat, choice, movers, path);
}

function moveRetreatGroup(
  state: GameState,
  combat: CombatState,
  choice: Extract<PendingCombatChoice, { kind: "retreat" }>,
  movers: readonly UnitState[],
  path: readonly string[],
): ReducerResult {
  const moverIds = new Set(movers.map((unit) => unit.id));
  const source = movers[0]?.location;
  if (
    source === null ||
    source === undefined ||
    path.length < 2 ||
    path[0] !== source ||
    path.some((coordinate) => !isHexCoordinate(coordinate)) ||
    path.slice(1).some(
      (coordinate, index) =>
        // The slice index points at the preceding coordinate in the full path.
        hexDistance(
          path[index]! as HexCoordinate,
          coordinate as HexCoordinate,
        ) !== 1,
    )
  ) {
    return failure(
      state,
      "invalid_hex",
      "Retreat along connected hexes starting from the stack's current hex.",
    );
  }
  const verifiedPath = path as readonly HexCoordinate[];
  for (const [index, coordinate] of verifiedPath.entries()) {
    if (index === 0) continue;
    const occupants = Object.values(state.units).filter(
      (unit) =>
        !moverIds.has(unit.id) &&
        unit.status === "deployed" &&
        unit.location === coordinate,
    );
    if (occupants.some((unit) => unit.side !== choice.side)) {
      return failure(
        state,
        "occupied",
        "A retreat path cannot enter a hex occupied by enemy counters.",
      );
    }
    const final = index === verifiedPath.length - 1;
    if (!final && occupants.length === 0) {
      return failure(
        state,
        "combat_invalid",
        "A retreat must stop at the first empty hex.",
      );
    }
    if (final && occupants.length > 0) {
      return failure(
        state,
        "occupied",
        "Continue the retreat until the stack reaches an empty hex.",
      );
    }
  }
  const destination = verifiedPath.at(-1)!;
  const units = { ...state.units };
  for (const unit of movers) {
    units[unit.id] = { ...unit, location: destination };
  }
  const remaining = choice.unit_ids.filter((id) => !moverIds.has(id));
  let nextCombat: CombatState = {
    ...combat,
    pending_choice:
      remaining.length === 0 ? null : { ...choice, unit_ids: remaining },
  };
  if (remaining.length === 0) {
    nextCombat = nextChoice(
      { ...state, units },
      {
        ...nextCombat,
        ...(choice.side === state.active_side
          ? { attacker_retreated: true }
          : { defender_retreated: true }),
      },
    );
  }
  return accepted(
    state,
    {
      combats: { ...state.combats, [combat.id]: nextCombat },
      objectives: objectivesAfterEntry(state, destination, choice.side),
      units,
    },
    `${movers.length} counter${movers.length === 1 ? "" : "s"} retreated together to ${destination}`,
  );
}

function advanceAfterCombat(
  state: GameState,
  actorSide: Side,
  command: Extract<GameplayCommand, { command_name: "advanceAfterCombat" }>,
): ReducerResult {
  const combat = state.combats[command.payload.combat_id];
  const choice = combat?.pending_choice;
  if (
    combat === undefined ||
    choice?.kind !== "advance" ||
    choice.side !== actorSide
  ) {
    return failure(
      state,
      "pending_choice",
      "This seat does not own a pending advance choice.",
    );
  }
  const units: Record<string, UnitState> = { ...state.units };
  let summary = `Combat ${combat.id} advance declined`;
  const destination = command.payload.destination;
  const hasDestination = destination !== undefined;
  if (command.payload.decline === hasDestination) {
    return failure(
      state,
      "invalid_hex",
      "Choose either an advance destination or decline the advance.",
    );
  }
  if (destination !== undefined) {
    const unitIds = command.payload.unit_ids ?? [];
    if (!(choice.destination_hexes ?? []).includes(destination)) {
      return failure(
        state,
        "invalid_hex",
        "Advance into one of the highlighted vacated defender hexes.",
      );
    }
    if (new Set(unitIds).size !== unitIds.length) {
      return failure(
        state,
        "combat_invalid",
        "Advance counters must be unique.",
      );
    }
    const movers = unitIds.flatMap((id) => {
      const unit = state.units[id];
      return unit === undefined ? [] : [unit];
    });
    const source = movers[0]?.location;
    if (
      movers.length !== unitIds.length ||
      source === null ||
      source === undefined ||
      movers.some(
        (unit) =>
          unit.side !== actorSide ||
          unit.status !== "deployed" ||
          unit.location !== source ||
          !choice.eligible_unit_ids.includes(unit.id),
      )
    ) {
      return failure(
        state,
        "pending_choice",
        "Advance only eligible counters from one original stack.",
      );
    }
    if (!destinationCanAcceptUnits(state, movers, destination)) {
      return failure(
        state,
        "occupied",
        "The dragged counters cannot occupy that advance destination.",
      );
    }
    if (!sourceStacksRemainValid(state, movers, destination)) {
      return failure(
        state,
        "occupied",
        "Advancing those counters would leave their source stack over capacity.",
      );
    }
    for (const unit of movers) {
      units[unit.id] = { ...unit, location: destination };
    }
    summary = `${movers.length} counter${movers.length === 1 ? "" : "s"} advanced together to ${destination}`;
  }
  const nextCombat: CombatState = {
    ...combat,
    pending_choice: null,
    status: "resolved",
  };
  return accepted(
    state,
    {
      combats: { ...state.combats, [combat.id]: nextCombat },
      ...(destination !== undefined
        ? {
            objectives: objectivesAfterEntry(state, destination, actorSide),
          }
        : {}),
      units,
    },
    summary,
  );
}

function finishSideTurn(
  state: GameState,
  actorSide: Side,
  combatSkipped: boolean,
): ReducerResult {
  if (actorSide === "confederate") {
    return accepted(
      state,
      {
        active_side: "union",
        combats: {},
        phase: "movement",
        units: resetMovementForSide(state, "union"),
      },
      combatSkipped
        ? "Confederate had no adjacent enemy units; combat skipped and Union movement began"
        : "Confederate combat ended; Union movement began",
    );
  }
  const scored = scoreVictory(state);
  const automaticConfederateVictory =
    (state.turn === 8 && scored.confederate >= scored.union * 2) ||
    (state.turn === 16 && scored.confederate >= scored.union + 15);
  if (automaticConfederateVictory) {
    return accepted(
      state,
      {
        active_side: null,
        combats: {},
        phase: "completed",
        victory: { ...scored, status: "confederate" },
      },
      `Confederate automatic victory after turn ${state.turn}`,
    );
  }
  if (state.turn === 24) {
    const status =
      scored.confederate === scored.union
        ? "tie"
        : scored.confederate > scored.union
          ? "confederate"
          : "union";
    return accepted(
      state,
      {
        active_side: null,
        combats: {},
        phase: "completed",
        victory: { ...scored, status },
      },
      "Turn 24 completed",
    );
  }
  return accepted(
    state,
    {
      active_side: "confederate",
      combats: {},
      night: [8, 16, 24].includes(state.turn + 1),
      phase: "movement",
      turn: state.turn + 1,
      units: resetMovementForSide(state, "confederate"),
    },
    combatSkipped
      ? `Union had no adjacent enemy units; combat skipped and turn ${state.turn + 1} began`
      : `Turn ${state.turn + 1} began`,
  );
}

interface AutomaticCombatRoll {
  readonly combat_id: string;
  readonly dice: { readonly attacker: number; readonly defender: number };
}

function endPhase(
  state: GameState,
  actorSide: Side,
  automaticCombats: readonly AutomaticCombatRoll[] | undefined,
): ReducerResult {
  if (state.active_side !== actorSide || state.phase === "completed") {
    return failure(state, "wrong_seat", "It is not this seat's phase to end.");
  }
  if (
    state.phase === "combat" &&
    Object.values(state.combats).some((combat) => combat.status !== "resolved")
  ) {
    return failure(
      state,
      "pending_choice",
      "Resolve every declared combat before ending the phase.",
    );
  }
  const needsAutomaticCombat =
    (state.phase === "movement" ||
      (state.phase === "combat" && Object.keys(state.combats).length === 0)) &&
    hasAdjacentEnemy(state, actorSide);
  if (state.phase === "movement" && state.night) {
    const mustWithdraw = nightUnitsAbleToWithdraw(state, actorSide);
    if (mustWithdraw.length > 0) {
      const counters = mustWithdraw
        .map((unit) => `${unit.label} (${unit.location})`)
        .join(", ");
      return failure(
        state,
        "phase_invalid",
        `Night movement cannot end while these counters can withdraw from enemy zones of control: ${counters}.`,
      );
    }
  }
  if (needsAutomaticCombat) {
    const skirmishes = combatSkirmishes(state, actorSide);
    if (
      skirmishes.length === 0 ||
      automaticCombats === undefined ||
      automaticCombats.length !== skirmishes.length ||
      new Set(automaticCombats.map((combat) => combat.combat_id)).size !==
        automaticCombats.length ||
      automaticCombats.some(
        (combat) => combat.combat_id.length === 0 || !validDice(combat.dice),
      )
    ) {
      return failure(
        state,
        "combat_invalid",
        "Server rolls are required for every mandatory skirmish.",
      );
    }
    const combats = Object.fromEntries(
      skirmishes.map((skirmish, index) => {
        const automatic = automaticCombats[index]!;
        const combat: CombatState = {
          attacker_loss_allocated: false,
          attacker_retreated: false,
          attacker_hexes: skirmish.attacker_hexes,
          attackers: skirmish.attackers,
          confirmation: null,
          defender_loss_allocated: false,
          defender_retreated: false,
          defenders: skirmish.defenders,
          defender_hexes: skirmish.defender_hexes,
          id: automatic.combat_id,
          pending_choice: null,
          rolls: automatic.dice,
          status: "awaiting_result_confirmation",
        };
        return [combat.id, combat];
      }),
    );
    const rolls = Object.values(combats)
      .map(
        (combat) =>
          `${combat.id.slice(0, 8)} ${combat.rolls!.attacker}-${combat.rolls!.defender}`,
      )
      .join(", ");
    return accepted(
      state,
      { combats, phase: "combat" },
      `${actorSide} ${state.phase === "movement" ? "movement ended; " : "legacy combat upgraded; "}${skirmishes.length} mandatory skirmish${skirmishes.length === 1 ? "" : "es"} rolled (${rolls})`,
    );
  }
  if (state.phase === "movement") {
    return finishSideTurn(state, actorSide, true);
  }
  return finishSideTurn(state, actorSide, false);
}

export function reduceGameplayCommand(
  state: GameState,
  actorSide: Side,
  command: GameplayCommand,
  options: {
    readonly automaticCombats?: readonly AutomaticCombatRoll[];
    readonly dice?: { readonly attacker: number; readonly defender: number };
  } = {},
): ReducerResult {
  switch (command.command_name) {
    case "moveUnit":
      return moveUnit(state, actorSide, command);
    case "moveStack":
      return moveStack(state, actorSide, command);
    case "enterReinforcement":
      return enterReinforcement(state, actorSide, command);
    case "declareCombat":
      return declareCombat(state, actorSide, command, options.dice);
    case "rollCombat":
      return rollCombat(state, actorSide, command, options.dice);
    case "confirmCombatResult":
      return confirmCombatResult(state, actorSide, command);
    case "allocateLoss":
      return allocateLoss(state, actorSide, command);
    case "retreatUnit":
      return retreatUnit(state, actorSide, command);
    case "retreatStack":
      return retreatStack(state, actorSide, command);
    case "advanceAfterCombat":
      return advanceAfterCombat(state, actorSide, command);
    case "endPhase":
      return endPhase(state, actorSide, options.automaticCombats);
    case "surrenderSeat":
      return failure(
        state,
        "phase_invalid",
        "Seat surrender is handled by the authoritative game service.",
      );
  }
}

export function reduceMoveUnit(
  state: GameState,
  actorSide: Side,
  payload: Extract<GameplayCommand, { command_name: "moveUnit" }>["payload"],
): ReducerResult {
  return moveUnit(state, actorSide, {
    command_id: "00000000-0000-4000-8000-000000000000",
    command_name: "moveUnit",
    expected_version: state.version,
    game_id: state.game_id,
    payload,
    schema: "gettysburg-command/v1",
  });
}

export function toCommandSuccess(
  state: GameState,
  command: Pick<GameplayCommand, "command_id" | "command_name">,
  summary: string,
): CommandSuccess {
  return {
    event: {
      command_id: command.command_id,
      command_name: command.command_name,
      event_sequence: state.event_sequence,
      kind: "gameplay",
      state_version: state.version,
      summary,
    },
    ok: true,
    state,
  };
}
