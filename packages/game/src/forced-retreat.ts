import { unitsAfterBoardExit } from "./board-exit.js";
import type { HexCoordinate } from "./coordinates.js";
import { eliminateLoneGenerals } from "./generals.js";
import { MANDATORY_RULESET_VERSION } from "./protocol.js";
import type { CommandFailure, GameState, Side } from "./protocol.js";
import { retreatOptions, validateRetreatPath } from "./retreat.js";

export type PreparedForcedRetreat =
  | {
      readonly ok: false;
      readonly error: CommandFailure["error"];
      readonly message: string;
    }
  | {
      readonly ok: true;
      readonly unit_ids: readonly string[];
      readonly patch: Pick<GameState, "units" | "objectives">;
      readonly summary: string;
    };

function reject(message: string): PreparedForcedRetreat {
  return { ok: false, error: "pending_choice", message };
}

function retreatGroup(
  state: GameState,
  side: Side,
  combatId: string,
  unitId: string,
): readonly string[] | null {
  const choice = state.combats[combatId]?.pending_choice;
  const unit = state.units[unitId];
  if (
    state.ruleset_version !== MANDATORY_RULESET_VERSION ||
    state.phase !== "combat" ||
    choice?.kind !== "retreat" ||
    choice.side !== side ||
    !choice.unit_ids.includes(unitId) ||
    !unit ||
    unit.status !== "deployed" ||
    unit.side !== side ||
    unit.location === null
  )
    return null;
  return choice.unit_ids.filter(
    (id) => state.units[id]?.location === unit.location,
  );
}

export function prepareForcedRetreat(
  state: GameState,
  side: Side,
  combatId: string,
  ids: readonly string[],
  path: readonly HexCoordinate[],
  exit = false,
): PreparedForcedRetreat {
  const required = retreatGroup(state, side, combatId, ids[0] ?? "");
  if (
    !required ||
    required.length !== ids.length ||
    new Set(ids).size !== ids.length ||
    required.some((id) => !ids.includes(id))
  )
    return reject(
      "Retreat every pending counter from exactly one original stack.",
    );
  if (!validateRetreatPath(state, ids, path, exit))
    return reject(
      "Choose a legal complete retreat, respecting terrain and zone-of-control priority.",
    );
  let units = eliminateLoneGenerals(state);
  let objectives = state.objectives;
  for (const location of path.slice(1)) {
    const moved = { ...units };
    for (const id of ids) moved[id] = { ...moved[id]!, location };
    const objective = objectives[location];
    if (objective)
      objectives = {
        ...objectives,
        [location]: { ...objective, controlled_by: side },
      };
    units = eliminateLoneGenerals({ ...state, units: moved });
  }
  if (exit) units = unitsAfterBoardExit({ ...state, units }, ids, 0);
  return {
    ok: true,
    unit_ids: ids,
    patch: { units, objectives },
    summary: `${ids.length} counter${ids.length === 1 ? "" : "s"} retreated ${exit ? "off-board" : `to ${path.at(-1)}`}`,
  };
}

export function prepareTrappedLoss(
  state: GameState,
  side: Side,
  combatId: string,
  unitId: string,
): PreparedForcedRetreat {
  const ids = retreatGroup(state, side, combatId, unitId);
  if (!ids || retreatOptions(state, ids)?.can_hold !== true)
    return reject(
      "An extra loss is available only when the entire stack cannot retreat.",
    );
  const selected = state.units[unitId]!;
  if (selected.kind === "general" || selected.steps_remaining < 1)
    return reject(
      "Allocate the extra loss to a surviving combat counter, not a general.",
    );
  const steps = selected.steps_remaining - 1;
  const units = {
    ...state.units,
    [unitId]: {
      ...selected,
      location: steps === 0 ? null : selected.location,
      status: steps === 0 ? ("eliminated" as const) : selected.status,
      steps_remaining: steps,
      strength: steps === 0 ? ("eliminated" as const) : ("reduced" as const),
    },
  };
  // As with ordinary combat loss allocation, a general is lost when all combat
  // support in its losing stack is eliminated, even in a terrain-trap case.
  if (
    !ids.some(
      (id) => units[id]?.kind !== "general" && units[id]?.status === "deployed",
    )
  ) {
    for (const id of ids) {
      const general = units[id]!;
      if (general.kind === "general")
        units[id] = {
          ...general,
          location: null,
          status: "eliminated",
          strength: "eliminated",
          steps_remaining: 0,
        };
    }
  }
  return {
    ok: true,
    unit_ids: ids,
    patch: {
      units: eliminateLoneGenerals({ ...state, units }),
      objectives: state.objectives,
    },
    summary: `${selected.label} took the trapped stack's one extra loss; surviving counters held position`,
  };
}
