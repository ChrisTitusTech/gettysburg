import { adjacentHexes, type HexCoordinate } from "./coordinates.js";
import type {
  CombatConfirmation,
  CombatState,
  GameState,
  Side,
  UnitState,
} from "./protocol.js";

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
    unitIds.reduce((total, id) => total + (state.units[id]?.combat ?? 0), 0),
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

  return opportunities.sort((left, right) => left.id.localeCompare(right.id));
}
