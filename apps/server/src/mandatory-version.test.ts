import { randomBytes, randomUUID } from "node:crypto";
import {
  createMandatoryInitialState,
  SCENARIO_CONTENT_REVISION,
} from "@gettysburg/content";
import {
  COMMAND_SCHEMA_VERSION,
  type GameState,
  type GameplayCommandName,
} from "@gettysburg/game";
import { describe, expect, it } from "vitest";
import { InMemoryGameService } from "./game-service.js";
import { hasPinnedMandatoryContent } from "./mandatory-content.js";

function restoredGame(
  transform: (state: GameState) => unknown = (state) => state,
) {
  const pepper = randomBytes(32);
  const original = new InMemoryGameService({ pepper });
  const created = original.createGame("union");
  const guest = original.claimInvitation({
    lookupId: created.invitation.lookup_id,
    secret: created.invitation.secret,
  });
  const snapshot = original.exportSnapshot();
  // Deliberately admit malformed persisted JSON at this test-only boundary.
  const state = transform(
    createMandatoryInitialState(created.gameId),
  ) as GameState;
  const service = new InMemoryGameService({
    pepper,
    snapshot: {
      ...snapshot,
      games: snapshot.games.map(([id, record]) => [id, { ...record, state }]),
    },
  });
  return { pepper, created, guest, state, service };
}

describe("mandatory saved-version handler", () => {
  it("creates new games from the complete mandatory pinned opening", () => {
    const game = new InMemoryGameService().createGame("union");
    expect(game.state).toEqual(createMandatoryInitialState(game.gameId));
  });

  it("restores the exact state without legacy opening or combat-choice repairs", () => {
    const { service, state, created } = restoredGame((initial) => ({
      ...initial,
      active_side: "confederate",
      phase: "combat",
      version: 1,
      event_sequence: 1,
      combats: {
        ["33333333-3333-4333-8333-333333333333"]: {
          id: "33333333-3333-4333-8333-333333333333",
          attackers: ["u-wadsworth"],
          defenders: ["c-heth"],
          defender_hexes: ["E4"],
          rolls: { attacker: 4, defender: 5 },
          attacker_loss_allocated: true,
          attacker_retreated: true,
          defender_loss_allocated: true,
          defender_retreated: true,
          confirmation: null,
          status: "pending_choice",
          pending_choice: {
            kind: "advance",
            side: "union",
            destination_hexes: ["E4"],
            eligible_unit_ids: ["u-wadsworth"],
          },
        },
      },
    }));
    expect(service.isVersionRegistryReady()).toBe(true);
    expect(service.getGameState(created.gameId)).toEqual(state);
  });

  it("accepts jsonb-style reordered keys without changing data", () => {
    const initial = createMandatoryInitialState("fixture");
    const reorder = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(reorder)
        : value !== null && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value)
                .reverse()
                .map(([key, field]) => [key, reorder(field)]),
            )
          : value;
    expect(hasPinnedMandatoryContent(reorder(initial) as GameState)).toBe(true);
  });

  it.each([
    ["missing terrain", (s) => ({ ...s, terrain: undefined })],
    [
      "missing hex",
      (s) => ({
        ...s,
        terrain: Object.fromEntries(
          Object.entries(s.terrain!).filter(([h]) => h !== "A1"),
        ),
      }),
    ],
    [
      "changed woods",
      (s) => ({
        ...s,
        terrain: { ...s.terrain, A1: { ...s.terrain!.A1!, woods: false } },
      }),
    ],
    ["missing routes", (s) => ({ ...s, movement_edges: undefined })],
    [
      "changed road",
      (s) => ({
        ...s,
        movement_edges: {
          ...s.movement_edges!,
          roads: s.movement_edges!.roads.slice(1),
        },
      }),
    ],
    [
      "missing entry links",
      (s) => ({
        ...s,
        movement_edges: { ...s.movement_edges!, entry_roads: [] },
      }),
    ],
    [
      "wrong pair",
      (s) => ({ ...s, content_revision: SCENARIO_CONTENT_REVISION }),
    ],
    [
      "missing counter",
      (s) => ({
        ...s,
        units: Object.fromEntries(Object.entries(s.units).slice(1)),
      }),
    ],
    [
      "changed factor",
      (s) => ({
        ...s,
        units: {
          ...s.units,
          "u-wadsworth": { ...s.units["u-wadsworth"]!, combat: 10 },
        },
      }),
    ],
    [
      "changed entry",
      (s) => ({
        ...s,
        units: {
          ...s.units,
          "u-barlow": { ...s.units["u-barlow"]!, entry_hexes: ["W11"] },
        },
      }),
    ],
    [
      "changed objective",
      (s) => ({
        ...s,
        objectives: {
          ...s.objectives,
          R10: { controlled_by: "union", value: 5 },
        },
      }),
    ],
    ["missing activation", (s) => ({ ...s, normal_movement: undefined })],
    [
      "unknown active unit",
      (s) => ({
        ...s,
        normal_movement: {
          ...s.normal_movement!,
          active_unit_ids: ["missing"],
        },
      }),
    ],
    [
      "closed active unit",
      (s) => ({
        ...s,
        normal_movement: {
          ...s.normal_movement!,
          active_unit_ids: ["u-wadsworth"],
          closed_unit_ids: ["u-wadsworth"],
        },
      }),
    ],
    [
      "missing spent budget",
      (s) => ({
        ...s,
        units: {
          ...s.units,
          "u-wadsworth": {
            ...s.units["u-wadsworth"]!,
            movement_spent: undefined,
          },
        },
      }),
    ],
    [
      "non-finite spent budget",
      (s) => ({
        ...s,
        units: {
          ...s.units,
          "u-wadsworth": { ...s.units["u-wadsworth"]!, movement_spent: NaN },
        },
      }),
    ],
    [
      "missing steps",
      (s) => ({
        ...s,
        units: {
          ...s.units,
          "u-wadsworth": {
            ...s.units["u-wadsworth"]!,
            steps_remaining: undefined,
          },
        },
      }),
    ],
  ] satisfies readonly [string, (state: GameState) => unknown][])(
    "fails closed for %s",
    (_, transform) => {
      const { service, created, state } = restoredGame(transform);
      expect(service.isVersionRegistryReady()).toBe(false);
      expect(() => service.getGameState(created.gameId)).toThrow(
        /version is unavailable/,
      );
      expect(service.exportSnapshot().games[0]![1].state).toEqual(state);
    },
  );

  it("persists paid continuation, closed groups, idempotency, and side authorization", () => {
    const { service, created, guest, pepper } = restoredGame();
    const authorization = service.authenticate(
      created.credential,
      created.gameId,
    );
    const other = service.authenticate(guest.credential, created.gameId);
    const command = (
      name: GameplayCommandName,
      payload: Record<string, unknown>,
      version: number,
    ) => ({
      command_id: randomUUID(),
      command_name: name,
      expected_version: version,
      game_id: created.gameId,
      schema: COMMAND_SCHEMA_VERSION,
      payload,
    });
    const first = command(
      "moveStack",
      { unit_ids: ["u-reynolds", "u-wadsworth"], destination: "E4" },
      0,
    );
    expect(service.executeCommand(other, first)).toMatchObject({
      ok: false,
      error: "wrong_seat",
    });
    const accepted = service.executeCommand(authorization, first);
    expect(accepted).toMatchObject({
      ok: true,
      state: {
        version: 1,
        units: { "u-wadsworth": { location: "E4", movement_spent: 0.5 } },
      },
    });
    const restarted = new InMemoryGameService({
      pepper,
      snapshot: service.exportSnapshot(),
    });
    const resumed = restarted.authenticate(created.credential, created.gameId);
    expect(restarted.executeCommand(resumed, first)).toEqual(accepted);
    expect(
      restarted.executeCommand(
        resumed,
        command(
          "moveStack",
          { unit_ids: ["u-wadsworth", "u-reynolds"], destination: "F4" },
          1,
        ),
      ),
    ).toMatchObject({
      ok: true,
      state: { units: { "u-wadsworth": { movement_spent: 1 } } },
    });
    expect(
      restarted.executeCommand(
        resumed,
        command("moveUnit", { unit_id: "u-devin", destination: "R7" }, 2),
      ),
    ).toMatchObject({ ok: true });
    const before = restarted.getGameState(created.gameId);
    expect(
      restarted.executeCommand(
        resumed,
        command(
          "moveStack",
          { unit_ids: ["u-reynolds", "u-wadsworth"], destination: "G5" },
          3,
        ),
      ),
    ).toMatchObject({ ok: false, error: "phase_invalid" });
    expect(restarted.getGameState(created.gameId)).toEqual(before);
    expect(restarted.getActions(created.gameId)).toHaveLength(3);
    expect(restarted.isVersionRegistryReady()).toBe(true);
    expect(
      restarted.executeCommand(resumed, command("endPhase", {}, 3)),
    ).toMatchObject({
      ok: true,
      state: {
        turn: 2,
        active_side: "confederate",
        normal_movement: {
          active_unit_ids: [],
          closed_unit_ids: [],
          bonus_unit_ids: [],
        },
      },
    });
  });
});
