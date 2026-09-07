import { describe, expect, it, vi } from "vitest";
import { connectRoom } from "./connect-room.js";

describe("bounded room admission retries", () => {
  it("retries explicit busy responses but returns the admitted room", async () => {
    vi.useFakeTimers();
    try {
      const room = {};
      const join = vi
        .fn()
        .mockRejectedValueOnce({ code: 503 })
        .mockResolvedValue(room);
      const pending = connectRoom(join, new AbortController().signal);
      await vi.advanceTimersByTimeAsync(250);
      expect(await pending).toBe(room);
      expect(join).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it("does not retry denied access or unknown failures", async () => {
    for (const error of [{ code: 401 }, { code: 403 }, new Error("unknown")]) {
      const join = vi.fn().mockRejectedValue(error);
      await expect(
        connectRoom(join, new AbortController().signal),
      ).rejects.toBe(error);
      expect(join).toHaveBeenCalledTimes(1);
    }
  });
  it("stops after four attempts", async () => {
    vi.useFakeTimers();
    try {
      const failure = { code: 503 };
      const join = vi.fn().mockRejectedValue(failure);
      const failed = expect(
        connectRoom(join, new AbortController().signal),
      ).rejects.toBe(failure);
      await vi.advanceTimersByTimeAsync(1_750);
      await failed;
      expect(join).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });
  it("cancels backoff without another admission attempt", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const join = vi.fn().mockRejectedValue({ code: 503 });
      const pending = connectRoom(join, controller.signal);
      const failed = expect(pending).rejects.toMatchObject({
        name: "AbortError",
      });
      await Promise.resolve();
      controller.abort();
      await failed;
      await vi.runAllTimersAsync();
      expect(join).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
