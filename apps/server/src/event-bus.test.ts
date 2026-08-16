import type { ManagementEvent } from "@gettysburg/game";
import { describe, expect, it, vi } from "vitest";

import { GameEventBus } from "./event-bus.js";

const EVENT: ManagementEvent = {
  command_id: "11111111-1111-4111-8111-111111111111",
  command_name: "deleteGame",
  event_sequence: 1,
  kind: "host_management",
  state_version: 0,
  summary: "test event",
};

describe("GameEventBus", () => {
  it("keeps a replacement subscription when an old disposer runs twice", () => {
    const bus = new GameEventBus();
    const first = vi.fn();
    const disposeFirst = bus.subscribeManagement("game", first);
    disposeFirst();

    const replacement = vi.fn();
    bus.subscribeManagement("game", replacement);
    disposeFirst();
    bus.publishManagement("game", EVENT);

    expect(first).not.toHaveBeenCalled();
    expect(replacement).toHaveBeenCalledWith(EVENT);
  });
});
