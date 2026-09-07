import {
  normalMovementRoute,
  normalMovementStep,
  planNormalMove,
  prepareNormalMovement,
  type GameState,
  type HexCoordinate,
  type PreparedNormalMovement,
  type Side,
} from "@gettysburg/game";

/** Drag overshoot stops at the farthest affordable legal endpoint of the
 * weighted route. Clicking a hex instead reports the full validation error. */
export function previewMandatoryMovement(
  state: GameState,
  side: Side,
  ids: readonly string[],
  target: HexCoordinate,
  clamp = false,
): PreparedNormalMovement {
  const prepared = prepareNormalMovement(state, side, ids, target);
  if (prepared.ok || !clamp || prepared.error !== "movement_exceeded")
    return prepared;
  const movers = ids.map((id) => state.units[id]!);
  const origin = movers[0]?.location;
  const plan = planNormalMove(state.normal_movement, movers);
  if (!origin || !state.movement_edges || !plan.ok) return prepared;
  const kinds = movers.map((unit) => unit.kind);
  const route = normalMovementRoute(
    state,
    side,
    kinds,
    state.movement_edges,
    origin,
    target,
  );
  if (route === null) return prepared;
  let cost = 0;
  const candidates: HexCoordinate[] = [];
  for (let index = 1; index < route.path.length; index += 1) {
    const destination = route.path[index]!;
    cost += normalMovementStep(
      state,
      side,
      kinds,
      state.movement_edges,
      route.path[index - 1]!,
      destination,
    )!.cost;
    if (cost > plan.allowance) break;
    candidates.push(destination);
  }
  for (const destination of candidates.reverse()) {
    const partial = prepareNormalMovement(state, side, ids, destination);
    if (partial.ok) return partial;
  }
  return prepared;
}
