import {
  MANDATORY_CONTENT_REVISION,
  WHOLE_POINT_CONTENT_REVISION,
} from "@gettysburg/content";
import {
  MANDATORY_RULESET_VERSION,
  WHOLE_POINT_RULESET_VERSION,
  type GameState,
} from "@gettysburg/game";
import { hasPinnedMandatoryContent } from "./mandatory-content.js";

export const WHOLE_POINT_TRANSITION = {
  from_ruleset: MANDATORY_RULESET_VERSION,
  from_content: MANDATORY_CONTENT_REVISION,
  to_ruleset: WHOLE_POINT_RULESET_VERSION,
  to_content: WHOLE_POINT_CONTENT_REVISION,
} as const;

/** One explicit forward-only operator transition, never reinterpret past moves. */
export function adoptWholePointMovement(state: GameState): GameState {
  if (
    state.ruleset_version !== MANDATORY_RULESET_VERSION ||
    state.content_revision !== MANDATORY_CONTENT_REVISION ||
    state.phase !== "movement" ||
    Object.values(state.combats).some(
      (combat) => combat.pending_choice !== undefined,
    ) ||
    !hasPinnedMandatoryContent(state)
  )
    throw new Error(
      "Whole-point transition requires a pinned v4 game in movement without pending choices",
    );
  return {
    ...state,
    ruleset_version: WHOLE_POINT_RULESET_VERSION,
    content_revision: WHOLE_POINT_CONTENT_REVISION,
    version: state.version + 1,
    event_sequence: state.event_sequence + 1,
  };
}
