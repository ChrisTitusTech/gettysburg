import { describe, expect, it } from "vitest";

import {
  acceptGameplayEvent,
  acceptManagementEvent,
  moveUnitCommandSchema,
} from "./protocol";

describe("moveUnitCommandSchema", () => {
  it("normalizes only the documented command shape", () => {
    const parsed = moveUnitCommandSchema.safeParse({
      command_id: "22222222-2222-4222-8222-222222222222",
      command_name: "moveUnit",
      expected_version: 0,
      game_id: "11111111-1111-4111-8111-111111111111",
      payload: { destination: "A1", unit_id: "u1" },
      schema: "gettysburg-command/v1",
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects extra actor identity", () => {
    const parsed = moveUnitCommandSchema.safeParse({
      actor: "union",
      command_id: "22222222-2222-4222-8222-222222222222",
      command_name: "moveUnit",
      expected_version: 0,
      game_id: "11111111-1111-4111-8111-111111111111",
      payload: { destination: "A1", unit_id: "u1" },
      schema: "gettysburg-command/v1",
    });

    expect(parsed.success).toBe(false);
  });
});

describe("acceptGameplayEvent", () => {
  it("advances gap-free event and state versions", () => {
    expect(
      acceptGameplayEvent(
        { event_sequence: 4, state_version: 3 },
        { event_sequence: 5, state_version: 4 },
      ),
    ).toEqual({
      cursor: { event_sequence: 5, state_version: 4 },
      ok: true,
    });
  });

  it("detects an event sequence gap", () => {
    expect(
      acceptGameplayEvent(
        { event_sequence: 4, state_version: 3 },
        { event_sequence: 6, state_version: 4 },
      ),
    ).toEqual({ error: "event_sequence_gap", ok: false });
  });

  it("detects a gameplay version gap", () => {
    expect(
      acceptGameplayEvent(
        { event_sequence: 4, state_version: 3 },
        { event_sequence: 5, state_version: 5 },
      ),
    ).toEqual({ error: "state_version_gap", ok: false });
  });
});

describe("acceptManagementEvent", () => {
  it("advances only the shared event sequence", () => {
    expect(
      acceptManagementEvent(
        { event_sequence: 4, state_version: 3 },
        { event_sequence: 5, state_version: 3 },
      ),
    ).toEqual({
      cursor: { event_sequence: 5, state_version: 3 },
      ok: true,
    });
  });

  it("rejects an event gap or gameplay-version change", () => {
    expect(
      acceptManagementEvent(
        { event_sequence: 4, state_version: 3 },
        { event_sequence: 6, state_version: 3 },
      ),
    ).toEqual({ error: "event_sequence_gap", ok: false });
    expect(
      acceptManagementEvent(
        { event_sequence: 4, state_version: 3 },
        { event_sequence: 5, state_version: 4 },
      ),
    ).toEqual({ error: "state_version_gap", ok: false });
  });
});
