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
  it("delivers private revocation metadata separately and only to the matching game", () => {
    const bus = new GameEventBus();
    const listener = vi.fn();
    const unrelated = vi.fn();
    bus.subscribeManagement("game", listener);
    bus.subscribeManagement("other", unrelated);
    bus.publishManagement("game", EVENT, "private-binding");
    expect(listener).toHaveBeenCalledWith(EVENT, "private-binding");
    expect(listener.mock.calls[0]![0]).not.toHaveProperty(
      "revokedSpectatorBindingId",
    );
    expect(unrelated).not.toHaveBeenCalled();
  });
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

  it("delivers a stable listener snapshot and isolates listener failures", () => {
    const bus = new GameEventBus();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const later = vi.fn();
    let disposeLater = () => {};
    bus.subscribeManagement("game", () => {
      disposeLater();
      throw new Error("listener failed");
    });
    disposeLater = bus.subscribeManagement("game", later);

    bus.publishManagement("game", EVENT);

    expect(later).toHaveBeenCalledWith(EVENT);
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});
