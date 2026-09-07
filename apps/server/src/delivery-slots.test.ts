import { describe, expect, it, vi } from "vitest";
import { DeliverySlots } from "./delivery-slots.js";

describe("abortable delivery checkout capacity", () => {
  it("removes cancelled queued joins immediately and preserves FIFO for live work", async () => {
    const slots = new DeliverySlots();
    const live = new AbortController().signal;
    const first = await slots.acquire(live);
    const second = await slots.acquire(live);
    const cancelled = new AbortController();
    const abandoned = slots
      .acquire(cancelled.signal)
      .catch((error: unknown) => error);
    const order: string[] = [];
    const third = slots.acquire(live).then((release) => {
      order.push("third");
      return release;
    });
    const fourth = slots.acquire(live).then((release) => {
      order.push("fourth");
      return release;
    });
    cancelled.abort();
    expect(await abandoned).toBeInstanceOf(Error);
    expect(order).toEqual([]);
    first();
    const releaseThird = await third;
    first(); // Duplicate release must not admit another checkout.
    await Promise.resolve();
    expect(order).toEqual(["third"]);
    second();
    const releaseFourth = await fourth;
    expect(order).toEqual(["third", "fourth"]);
    releaseThird();
    releaseFourth();
  });

  it("skips already cancelled work without consuming a slot", async () => {
    const slots = new DeliverySlots();
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(slots.acquire(cancelled.signal)).rejects.toThrow(/cancelled/);
    const entered = vi.fn();
    const releases = await Promise.all(
      [0, 1].map(async () => {
        const release = await slots.acquire(new AbortController().signal);
        entered();
        return release;
      }),
    );
    expect(entered).toHaveBeenCalledTimes(2);
    releases.forEach((release) => release());
  });
});
