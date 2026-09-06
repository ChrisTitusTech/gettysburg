import { RULESET_VERSION, type GameState } from "./protocol.js";

/** One skirmish, strongest effective defending hex, never one bonus per unit. */
export function terrainDefenseModifier(
  state: GameState,
  attackers: readonly string[],
  defenders: readonly string[],
): number {
  if (state.ruleset_version !== RULESET_VERSION || state.terrain === undefined)
    return 0;
  const attackerTerrain = attackers.flatMap((id) => {
    const unit = state.units[id];
    if (
      !unit ||
      unit.kind === "general" ||
      unit.status !== "deployed" ||
      !unit.location
    )
      return [];
    const terrain = state.terrain?.[unit.location];
    return terrain ? [terrain] : [];
  });
  let adjustment = 0;
  for (const id of new Set(defenders)) {
    const unit = state.units[id];
    if (
      !unit ||
      unit.kind === "general" ||
      unit.status !== "deployed" ||
      !unit.location
    )
      continue;
    const terrain = state.terrain[unit.location];
    if (!terrain) continue;
    const woods =
      terrain.woods &&
      !attackerTerrain.some(
        (a) =>
          a.forest_region !== null && a.forest_region === terrain.forest_region,
      )
        ? 2
        : 0;
    const hill =
      terrain.hill_region !== null &&
      !attackerTerrain.some(
        (a) => a.hill_region !== null && a.hill_region === terrain.hill_region,
      )
        ? terrain.hill_defense
        : 0;
    const town = terrain.kind === "town" ? 1 : 0;
    // The approved total is a ceiling, including standard wooded hills at +2.
    adjustment = Math.max(
      adjustment,
      Math.min(terrain.defense, woods + hill + town),
    );
  }
  return adjustment;
}
