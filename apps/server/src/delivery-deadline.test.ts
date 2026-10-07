import { describe, expect, it, vi } from "vitest";
import {
  withinDeliveryDeadline,
  ROOM_DELIVERY_TIMEOUT_MS,
} from "./delivery-deadline.js";

describe("bounded room delivery", () => {
  it("aborts a stalled read and prevents a late send", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const send = vi.fn();
    try {
      const pending = withinDeliveryDeadline(async (signal) => {
        await barrier;
        if (!signal.aborted) send();
      });
      const failed = expect(pending).rejects.toMatchObject({
        code: 503,
        message: "Room delivery was cancelled or timed out.",
      });
      await vi.advanceTimersByTimeAsync(ROOM_DELIVERY_TIMEOUT_MS);
      await failed;
      release();
      await Promise.resolve();
      expect(send).not.toHaveBeenCalled();
    } finally {
      release();
      vi.useRealTimers();
    }
  });
  it("cancels abandoned reads immediately and skips already cancelled work", async () => {
    const controller = new AbortController();
    const pending = withinDeliveryDeadline(
      () => new Promise<void>(() => {}),
      controller.signal,
    );
    controller.abort();
    await expect(pending).rejects.toThrow(/cancelled/);
    const work = vi.fn();
    await expect(
      withinDeliveryDeadline(work, controller.signal),
    ).rejects.toThrow(/cancelled/);
    expect(work).not.toHaveBeenCalled();
  });
});
