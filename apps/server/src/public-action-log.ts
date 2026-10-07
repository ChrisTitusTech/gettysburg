import type { ActionEvent } from "@gettysburg/game";
import type { StoredAction } from "./game-service.js";

// Copy public events only, never the private command payloads/resulting states.
export function publicActionLog(
  actions: readonly StoredAction[],
): ActionEvent[] {
  return structuredClone(
    actions.flatMap<ActionEvent>((action) => {
      if (action.result?.ok === true) return [action.result.event];
      if (action.kind === "operator_audit" && action.operatorRequestId !== null)
        return [
          {
            command_id: action.operatorRequestId,
            command_name:
              action.commandName === "adoptWholePointMovement"
                ? "adoptWholePointMovement"
                : "operatorRecovery",
            event_sequence: action.sequence,
            kind: "operator_audit",
            state_version: action.resultingVersion,
            summary:
              action.commandName === "adoptWholePointMovement"
                ? "Road and rail movement changed to 1 point; earlier moves retain their original costs"
                : "Operator recovery completed",
          },
        ];
      return [];
    }),
  );
}
