import {
  BOARD_EDGE_HEXES,
  hexDistance,
  isHexCoordinate,
} from "./coordinates.js";
import type { HexCoordinate } from "./coordinates.js";
import { terrainMovementCost } from "./movement.js";
import { movementStackFits } from "./movement-validation.js";
import { planNormalMove } from "./normal-move.js";
import type { CommandFailure, GameState, Side, UnitState } from "./protocol.js";
import { enemyZoneOfControl } from "./zoc.js";
import { eliminateLoneGenerals } from "./generals.js";

/** Scheduled or nearest enemy-free edge hexes; friendly capacity is separate. */
export function reinforcementEntryHexes(
  state: GameState,
  unit: UnitState,
): readonly HexCoordinate[] {
  const zoc = enemyZoneOfControl(state, unit.side);
  const occupied = new Set(
    Object.values(state.units).flatMap((enemy) =>
      enemy.side !== unit.side &&
      enemy.status === "deployed" &&
      enemy.location !== null
        ? [enemy.location]
        : [],
    ),
  );
  const safe = (hex: HexCoordinate) => !zoc.has(hex) && !occupied.has(hex);
  const candidates = BOARD_EDGE_HEXES.filter(safe);
  return [
    ...new Set(
      unit.entry_hexes.flatMap((entry) => {
        if (!BOARD_EDGE_HEXES.includes(entry)) return [];
        if (safe(entry)) return [entry];
        const nearest = Math.min(
          ...candidates.map((hex) => hexDistance(entry, hex)),
        );
        return candidates.filter((hex) => hexDistance(entry, hex) === nearest);
      }),
    ),
  ].sort();
}

export type PreparedReinforcement =
  | {
      readonly ok: false;
      readonly error: CommandFailure["error"];
      readonly message: string;
    }
  | {
      readonly ok: true;
      readonly cost: number;
      readonly patch: Pick<
        GameState,
        "units" | "normal_movement" | "objectives"
      >;
    };

function reject(
  error: CommandFailure["error"],
  message: string,
): PreparedReinforcement {
  return { ok: false, error, message };
}

export function prepareReinforcement(
  state: GameState,
  side: Side,
  ids: readonly string[],
  destination: HexCoordinate,
): PreparedReinforcement {
  if (state.active_side !== side)
    return reject("wrong_seat", "It is not this seat's turn.");
  if (state.phase !== "movement")
    return reject("phase_invalid", "Reinforcements enter during movement.");
  if (!isHexCoordinate(destination) || !BOARD_EDGE_HEXES.includes(destination))
    return reject("invalid_hex", "Enter through a legal board-edge hex.");
  if (state.terrain === undefined || state.movement_edges === undefined)
    return reject(
      "version_unavailable",
      "The pinned terrain/edge bundle is unavailable.",
    );
  if (ids.length === 0 || new Set(ids).size !== ids.length)
    return reject("phase_invalid", "Choose unique reinforcement counters.");
  const arriving: UnitState[] = [];
  for (const id of ids) {
    const unit = state.units[id];
    if (unit === undefined)
      return reject(
        "unit_not_found",
        "A reinforcement counter does not exist.",
      );
    if (unit.side !== side)
      return reject("wrong_seat", "Enter only your own reinforcements.");
    if (unit.status !== "reinforcement")
      return reject(
        "already_entered",
        "That counter is no longer a reinforcement.",
      );
    if (unit.entry_turn === null || unit.entry_turn > state.turn)
      return reject(
        "reinforcement_early",
        "That reinforcement is not yet available.",
      );
    if (!reinforcementEntryHexes(state, unit).includes(destination))
      return reject(
        "invalid_hex",
        "Use the scheduled entry, or a nearest enemy-free board edge when blocked.",
      );
    arriving.push({
      ...unit,
      status: "deployed",
      location: destination,
      movement_spent: 0,
    });
  }
  if (
    !arriving[0]!.entry_hexes.some((hex) =>
      arriving.every((unit) => unit.entry_hexes.includes(hex)),
    )
  )
    return reject(
      "invalid_hex",
      "A joint entry requires a common scheduled entry hex.",
    );
  const occupants = Object.values(state.units).filter(
    (unit) => unit.status === "deployed" && unit.location === destination,
  );
  if (!movementStackFits([...occupants, ...arriving]))
    return reject(
      "occupied",
      "That entry hex cannot hold this group; clear it or wait.",
    );
  const terrain = terrainMovementCost(
    state,
    arriving.map((unit) => unit.kind),
    destination,
  );
  if (terrain === null)
    return reject(
      "phase_invalid",
      "Artillery cannot enter wooded rough hills, even along a road.",
    );
  const cost =
    state.movement_edges.entry_roads?.includes(destination) === true
      ? 0.5
      : terrain;
  const plan = planNormalMove(state.normal_movement, arriving);
  if (!plan.ok)
    return reject("phase_invalid", "That group's movement has already ended.");
  if (cost > plan.allowance)
    return reject(
      "movement_exceeded",
      "This group cannot afford the entry cost.",
    );
  const units = { ...state.units };
  for (const unit of arriving)
    units[unit.id] = { ...unit, movement_spent: cost };
  const objective = state.objectives[destination];
  return {
    ok: true,
    cost,
    patch: {
      units: eliminateLoneGenerals({ ...state, units }),
      normal_movement: plan.activation,
      objectives:
        objective === undefined
          ? state.objectives
          : {
              ...state.objectives,
              [destination]: { ...objective, controlled_by: side },
            },
    },
  };
}
