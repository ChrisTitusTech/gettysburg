import { adjacentHexes, type HexCoordinate } from "./coordinates.js";
import {
  RULESET_VERSION,
  type CombatConfirmation,
  type CombatState,
  type GameState,
  type Side,
  type UnitState,
} from "./protocol.js";

const MAX_EXACT_COVER_VERTICES = 20;

export interface CombatOpportunity {
  readonly attacker_hexes: readonly HexCoordinate[];
  readonly attacker_modifier: number;
  readonly attackers: readonly string[];
  readonly defender_hexes: readonly HexCoordinate[];
  readonly defender_modifier: number;
  readonly defenders: readonly string[];
  readonly id: string;
  readonly requires_separation: boolean;
}

export interface AutomaticCombatResolution {
  readonly attacker_total: number;
  readonly confirmation: CombatConfirmation;
  readonly defender_total: number;
  readonly margin: number;
}

export function currentCombatValue(
  unit: UnitState,
  rulesetVersion: string,
): number | null {
  if (unit.combat === null) return null;
  return rulesetVersion === RULESET_VERSION && unit.strength === "reduced"
    ? (unit.reduced_combat ?? Math.ceil(unit.combat / 2))
    : unit.combat;
}

export function isCombatUnit(unit: UnitState): boolean {
  return (
    unit.kind !== "general" &&
    unit.status === "deployed" &&
    unit.location !== null
  );
}

export function combatFactorModifier(
  state: GameState,
  unitIds: readonly string[],
): number {
  return Math.min(
    10,
    unitIds.reduce((total, id) => {
      const unit = state.units[id];
      return (
        total +
        (unit === undefined
          ? 0
          : (currentCombatValue(unit, state.ruleset_version) ?? 0))
      );
    }, 0),
  );
}

function availableSteps(state: GameState, unitIds: readonly string[]): number {
  return unitIds.reduce(
    (total, id) => total + (state.units[id]?.steps_remaining ?? 0),
    0,
  );
}

/**
 * Resolve the verified Phase 2 combat table from server dice and printed unit
 * factors. Per-hex terrain bonuses remain excluded until the board terrain
 * transcription is reviewed.
 */
export function automaticCombatResolution(
  state: GameState,
  combat: CombatState,
): AutomaticCombatResolution | null {
  if (combat.rolls === null) return null;

  const attackerModifier = combatFactorModifier(state, combat.attackers);
  const defenderModifier = combatFactorModifier(state, combat.defenders);
  const attackerTotal = combat.rolls.attacker + attackerModifier;
  const defenderTotal = combat.rolls.defender + defenderModifier;
  const attackerWins = attackerTotal > defenderTotal;
  const margin = Math.abs(attackerTotal - defenderTotal);
  const tableLosses = margin >= 6 ? 2 : margin >= 3 ? 1 : 0;

  return {
    attacker_total: attackerTotal,
    confirmation: {
      advance_offered: attackerWins,
      attacker_losses: attackerWins
        ? 0
        : Math.min(tableLosses, availableSteps(state, combat.attackers)),
      attacker_modifier: attackerModifier,
      attacker_retreat: !attackerWins,
      defender_losses: attackerWins
        ? Math.min(tableLosses, availableSteps(state, combat.defenders))
        : 0,
      defender_modifier: defenderModifier,
      defender_retreat: attackerWins,
      result: attackerWins ? "attacker_win" : "defender_win",
    },
    defender_total: defenderTotal,
    margin,
  };
}

function otherSide(side: Side): Side {
  return side === "confederate" ? "union" : "confederate";
}

function unitsByHex(
  state: GameState,
  side: Side,
  committed: ReadonlySet<string>,
): Map<HexCoordinate, string[]> {
  const grouped = new Map<HexCoordinate, string[]>();
  for (const unit of Object.values(state.units)) {
    if (unit.side !== side || !isCombatUnit(unit) || committed.has(unit.id)) {
      continue;
    }
    const ids = grouped.get(unit.location!) ?? [];
    ids.push(unit.id);
    grouped.set(unit.location!, ids.sort());
  }
  return grouped;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function nonemptySubsets<T>(values: readonly T[]): readonly (readonly T[])[] {
  const subsets: T[][] = [];
  for (let mask = 1; mask < 1 << values.length; mask += 1) {
    const subset: T[] = [];
    for (let index = 0; index < values.length; index += 1) {
      if ((mask & (1 << index)) !== 0) subset.push(values[index]!);
    }
    subsets.push(subset);
  }
  return subsets;
}

interface SkirmishCandidate {
  readonly opportunity: CombatOpportunity;
  readonly vertices: ReadonlySet<string>;
}

function candidateForHexes(
  state: GameState,
  attackersByHex: ReadonlyMap<HexCoordinate, readonly string[]>,
  defendersByHex: ReadonlyMap<HexCoordinate, readonly string[]>,
  attackerHexes: readonly HexCoordinate[],
  defenderHexes: readonly HexCoordinate[],
): SkirmishCandidate {
  const sortedAttackerHexes = [...attackerHexes].sort(compareText);
  const sortedDefenderHexes = [...defenderHexes].sort(compareText);
  const attackers = sortedAttackerHexes.flatMap(
    (hex) => attackersByHex.get(hex) ?? [],
  );
  const defenders = sortedDefenderHexes.flatMap(
    (hex) => defendersByHex.get(hex) ?? [],
  );
  const id = `${sortedAttackerHexes.join("+")}-${sortedDefenderHexes.join("+")}`;
  return {
    opportunity: {
      attacker_hexes: sortedAttackerHexes,
      attacker_modifier: combatFactorModifier(state, attackers),
      attackers,
      defender_hexes: sortedDefenderHexes,
      defender_modifier: combatFactorModifier(state, defenders),
      defenders,
      id,
      requires_separation: false,
    },
    vertices: new Set([
      ...sortedAttackerHexes.map((hex) => `attacker:${hex}`),
      ...sortedDefenderHexes.map((hex) => `defender:${hex}`),
    ]),
  };
}

function separateOpportunity(
  state: GameState,
  opportunity: CombatOpportunity,
): readonly CombatOpportunity[] {
  if (!opportunity.requires_separation) return [opportunity];

  const attackersByHex = new Map<HexCoordinate, readonly string[]>();
  const defendersByHex = new Map<HexCoordinate, readonly string[]>();
  for (const hex of opportunity.attacker_hexes) {
    attackersByHex.set(
      hex,
      opportunity.attackers.filter((id) => state.units[id]?.location === hex),
    );
  }
  for (const hex of opportunity.defender_hexes) {
    defendersByHex.set(
      hex,
      opportunity.defenders.filter((id) => state.units[id]?.location === hex),
    );
  }

  const candidates = new Map<string, SkirmishCandidate>();
  for (const defenderHex of opportunity.defender_hexes) {
    const adjacentAttackers = opportunity.attacker_hexes.filter((attackerHex) =>
      adjacentHexes(defenderHex).includes(attackerHex),
    );
    for (const attackerHexes of nonemptySubsets(adjacentAttackers)) {
      const candidate = candidateForHexes(
        state,
        attackersByHex,
        defendersByHex,
        attackerHexes,
        [defenderHex],
      );
      candidates.set(candidate.opportunity.id, candidate);
    }
  }
  for (const attackerHex of opportunity.attacker_hexes) {
    const adjacentDefenders = opportunity.defender_hexes.filter((defenderHex) =>
      adjacentHexes(attackerHex).includes(defenderHex),
    );
    for (const defenderHexes of nonemptySubsets(adjacentDefenders)) {
      const candidate = candidateForHexes(
        state,
        attackersByHex,
        defendersByHex,
        [attackerHex],
        defenderHexes,
      );
      candidates.set(candidate.opportunity.id, candidate);
    }
  }

  const vertices = [
    ...opportunity.attacker_hexes.map((hex) => `attacker:${hex}`),
    ...opportunity.defender_hexes.map((hex) => `defender:${hex}`),
  ].sort(compareText);
  const vertexIndex = new Map(vertices.map((vertex, index) => [vertex, index]));
  const indexedCandidates = [...candidates.values()]
    .map((candidate) => ({
      ...candidate,
      mask: [...candidate.vertices].reduce(
        (mask, vertex) => mask | (1n << BigInt(vertexIndex.get(vertex)!)),
        0n,
      ),
    }))
    .sort((left, right) =>
      compareText(left.opportunity.id, right.opportunity.id),
    );
  const candidatesByVertex = new Map<number, typeof indexedCandidates>();
  for (let index = 0; index < vertices.length; index += 1) {
    candidatesByVertex.set(
      index,
      indexedCandidates.filter(
        (candidate) => (candidate.mask & (1n << BigInt(index))) !== 0n,
      ),
    );
  }

  const memo = new Map<
    bigint,
    readonly (typeof indexedCandidates)[number][] | null
  >();
  const better = (
    left: readonly (typeof indexedCandidates)[number][],
    right: readonly (typeof indexedCandidates)[number][] | null,
  ) => {
    if (right === null || left.length < right.length) return true;
    if (left.length > right.length) return false;
    const leftKey = left
      .map((candidate) => candidate.opportunity.id)
      .sort(compareText)
      .join("|");
    const rightKey = right
      .map((candidate) => candidate.opportunity.id)
      .sort(compareText)
      .join("|");
    return compareText(leftKey, rightKey) < 0;
  };
  const solve = (
    remaining: bigint,
  ): readonly (typeof indexedCandidates)[number][] | null => {
    if (remaining === 0n) return [];
    const cached = memo.get(remaining);
    if (cached !== undefined) return cached;

    let options: typeof indexedCandidates | null = null;
    for (let index = 0; index < vertices.length; index += 1) {
      if ((remaining & (1n << BigInt(index))) === 0n) continue;
      const compatible = (candidatesByVertex.get(index) ?? []).filter(
        (candidate) => (candidate.mask & remaining) === candidate.mask,
      );
      if (options === null || compatible.length < options.length) {
        options = compatible;
      }
      if (options.length === 0) break;
    }

    let best: readonly (typeof indexedCandidates)[number][] | null = null;
    for (const candidate of options ?? []) {
      const rest = solve(remaining ^ candidate.mask);
      if (rest === null) continue;
      const proposal = [candidate, ...rest];
      if (better(proposal, best)) best = proposal;
    }
    memo.set(remaining, best);
    return best;
  };

  const allVertices = (1n << BigInt(vertices.length)) - 1n;
  const hasCandidateForEveryVertex = (remaining: bigint): boolean => {
    for (let index = 0; index < vertices.length; index += 1) {
      const vertexMask = 1n << BigInt(index);
      if ((remaining & vertexMask) === 0n) continue;
      if (
        !indexedCandidates.some(
          (candidate) =>
            (candidate.mask & vertexMask) !== 0n &&
            (candidate.mask & remaining) === candidate.mask,
        )
      ) {
        return false;
      }
    }
    return true;
  };
  const bitCount = (mask: bigint): number => {
    let count = 0;
    for (let value = mask; value !== 0n; value >>= 1n) {
      if ((value & 1n) !== 0n) count += 1;
    }
    return count;
  };
  const solveGreedily = () => {
    let remaining = allVertices;
    const selected: (typeof indexedCandidates)[number][] = [];
    while (remaining !== 0n) {
      const choice = indexedCandidates
        .filter(
          (candidate) =>
            (candidate.mask & remaining) === candidate.mask &&
            hasCandidateForEveryVertex(remaining ^ candidate.mask),
        )
        .sort((left, right) => {
          const sizeDifference = bitCount(right.mask) - bitCount(left.mask);
          return (
            sizeDifference ||
            compareText(left.opportunity.id, right.opportunity.id)
          );
        })[0];
      if (choice === undefined) return null;
      selected.push(choice);
      remaining ^= choice.mask;
    }
    return selected;
  };
  const solution =
    vertices.length <= MAX_EXACT_COVER_VERTICES
      ? solve(allVertices)
      : solveGreedily();
  if (solution === null) return [opportunity];
  return solution
    .map((candidate) => candidate.opportunity)
    .sort((left, right) => compareText(left.id, right.id));
}

export function combatOpportunities(
  state: GameState,
  attackerSide: Side,
): readonly CombatOpportunity[] {
  const committed = new Set(
    Object.values(state.combats).flatMap((combat) => [
      ...combat.attackers,
      ...combat.defenders,
    ]),
  );
  const attackersByHex = unitsByHex(state, attackerSide, committed);
  const defendersByHex = unitsByHex(state, otherSide(attackerSide), committed);
  const opportunities: CombatOpportunity[] = [];
  const visited = new Set<string>();

  for (const attackerHex of [...attackersByHex.keys()].sort()) {
    const startKey = `attacker:${attackerHex}`;
    if (
      visited.has(startKey) ||
      !adjacentHexes(attackerHex).some((hex) => defendersByHex.has(hex))
    ) {
      continue;
    }
    const queue: Array<{
      readonly hex: HexCoordinate;
      readonly side: "attacker" | "defender";
    }> = [{ hex: attackerHex, side: "attacker" }];
    const attackerHexes = new Set<HexCoordinate>();
    const defenderHexes = new Set<HexCoordinate>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      const key = `${current.side}:${current.hex}`;
      if (visited.has(key)) continue;
      visited.add(key);
      if (current.side === "attacker") attackerHexes.add(current.hex);
      else defenderHexes.add(current.hex);

      const opposite =
        current.side === "attacker" ? defendersByHex : attackersByHex;
      const nextSide = current.side === "attacker" ? "defender" : "attacker";
      for (const adjacent of adjacentHexes(current.hex)) {
        if (opposite.has(adjacent))
          queue.push({ hex: adjacent, side: nextSide });
      }
    }

    const sortedAttackerHexes = [...attackerHexes].sort();
    const sortedDefenderHexes = [...defenderHexes].sort();
    const attackers = sortedAttackerHexes.flatMap(
      (hex) => attackersByHex.get(hex) ?? [],
    );
    const defenders = sortedDefenderHexes.flatMap(
      (hex) => defendersByHex.get(hex) ?? [],
    );
    opportunities.push({
      attacker_hexes: sortedAttackerHexes,
      attacker_modifier: combatFactorModifier(state, attackers),
      attackers,
      defender_hexes: sortedDefenderHexes,
      defender_modifier: combatFactorModifier(state, defenders),
      defenders,
      id: `${sortedAttackerHexes.join("+")}-${sortedDefenderHexes.join("+")}`,
      requires_separation:
        sortedAttackerHexes.length > 1 && sortedDefenderHexes.length > 1,
    });
  }

  return opportunities.sort((left, right) => compareText(left.id, right.id));
}

/**
 * Deterministically partition every mandatory adjacent combat unit into legal
 * independent battles. Every combat hex is covered exactly once, same-hex
 * counters remain together, and each battle has only one side spanning more
 * than one hex.
 */
export function combatSkirmishes(
  state: GameState,
  attackerSide: Side,
): readonly CombatOpportunity[] {
  return combatOpportunities(state, attackerSide).flatMap((opportunity) =>
    separateOpportunity(state, opportunity),
  );
}
