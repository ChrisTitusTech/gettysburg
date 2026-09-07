import { createMandatoryInitialState } from "@gettysburg/content";
import {
  type CombatState,
  type GameState,
  type PendingCombatChoice,
} from "@gettysburg/game";
import { describe, expect, it } from "vitest";
import { turnNotificationIntents } from "./turn-notification-policy.js";

const initial = createMandatoryInitialState(
  "11111111-1111-4111-8111-111111111111",
);
const next = (before: GameState, changes: Partial<GameState>): GameState => ({
  ...before,
  ...changes,
  version: before.version + 1,
  event_sequence: before.event_sequence + 1,
});
const combat = (
  id: string,
  choice: PendingCombatChoice | null,
  status: CombatState["status"] = "pending_choice",
): CombatState => ({
  id,
  pending_choice: choice,
  status,
  attackers: ["u-wadsworth"],
  defenders: ["c-heth"],
  attacker_loss_allocated: false,
  defender_loss_allocated: false,
  attacker_retreated: false,
  defender_retreated: false,
  confirmation: null,
  rolls: null,
});
const expected = (state: GameState, side = "confederate") => [
  { gameId: state.game_id, eventSequence: state.event_sequence, side },
];

describe("turn notification intents", () => {
  it("targets the newly active opponent, not routine moves or the acting seat", () => {
    const after = next(initial, { turn: 2, active_side: "confederate" });
    expect(turnNotificationIntents(initial, after, "union")).toEqual(
      expected(after),
    );
    expect(
      turnNotificationIntents(initial, next(initial, {}), "union"),
    ).toEqual([]);
    expect(turnNotificationIntents(initial, after, "confederate")).toEqual([]);
  });
  it.each(["loss", "retreat", "advance"] as const)(
    "targets a new opponent %s choice",
    (kind) => {
      const choice: PendingCombatChoice =
        kind === "advance"
          ? { kind, side: "confederate", eligible_unit_ids: ["c-heth"] }
          : kind === "loss"
            ? { kind, side: "confederate", unit_ids: ["c-heth"], count: 1 }
            : { kind, side: "confederate", unit_ids: ["c-heth"] };
      const before = {
        ...initial,
        phase: "combat" as const,
        combats: { a: combat("a", null, "awaiting_result_confirmation") },
      };
      const after = next(before, { combats: { a: combat("a", choice) } });
      expect(turnNotificationIntents(before, after, "union")).toEqual(
        expected(after),
      );
      expect(turnNotificationIntents(after, next(after, {}), "union")).toEqual(
        [],
      );
    },
  );
  it("coalesces multiple new choices into one intent and ignores object/unit ordering", () => {
    const choice = {
      kind: "retreat" as const,
      side: "confederate" as const,
      unit_ids: ["c-heth", "c-pegram"],
    };
    const after = next(initial, {
      phase: "combat",
      combats: { a: combat("a", choice), b: combat("b", choice) },
    });
    expect(turnNotificationIntents(initial, after, "union")).toEqual(
      expected(after),
    );
    const reordered = next(after, {
      combats: {
        b: after.combats.b!,
        a: combat("a", { ...choice, unit_ids: [...choice.unit_ids].reverse() }),
      },
    });
    expect(turnNotificationIntents(after, reordered, "union")).toEqual([]);
  });
  it("notifies the active player when the opponent resolves the last blocking choice", () => {
    const before = {
      ...initial,
      phase: "combat" as const,
      combats: {
        a: combat("a", {
          kind: "retreat",
          side: "confederate",
          unit_ids: ["c-heth"],
        }),
      },
    };
    const after = next(before, {
      combats: { a: combat("a", null, "resolved") },
    });
    expect(turnNotificationIntents(before, after, "confederate")).toEqual(
      expected(after, "union"),
    );
  });
  it("ignores duplicates, non-gameplay chronology, incompatible versions, and completed games", () => {
    const after = next(initial, { turn: 2, active_side: "confederate" });
    for (const changed of [
      initial,
      { ...after, version: initial.version },
      { ...after, event_sequence: after.event_sequence + 1 },
      { ...after, game_id: "another-game" },
      { ...after, ruleset_version: "legacy" },
      { ...after, content_revision: "another-map" },
      { ...after, phase: "completed" as const },
      { ...after, victory: { ...after.victory, status: "union" as const } },
    ])
      expect(turnNotificationIntents(initial, changed, "union")).toEqual([]);
  });
  it("does not mutate the input snapshots", () => {
    const after = next(initial, { turn: 2, active_side: "confederate" });
    const saved = structuredClone([initial, after]);
    turnNotificationIntents(initial, after, "union");
    expect([initial, after]).toEqual(saved);
  });
});
