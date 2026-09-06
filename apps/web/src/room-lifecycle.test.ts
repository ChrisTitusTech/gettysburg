import { describe, expect, it, vi } from "vitest";

import { leaveOpenRoom } from "./room-lifecycle";

describe("room cleanup", () => {
  it("leaves an open room with consent", async () => {
    const leave = vi.fn().mockResolvedValue(1000);
    await expect(
      leaveOpenRoom({ connection: { isOpen: true }, leave }),
    ).resolves.toBe(1000);
    expect(leave).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("does not send a leave message on closing or absent connections", () => {
    const leave = vi.fn();
    leaveOpenRoom({ connection: { isOpen: false }, leave });
    leaveOpenRoom({ leave });
    expect(leave).not.toHaveBeenCalled();
  });
});
