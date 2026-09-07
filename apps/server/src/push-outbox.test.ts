import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PUSH_LEASE_MS, PUSH_LIFETIME_MS, PushOutbox } from "./push-outbox.js";

function input(eventSequence = 1) {
  return {
    bindingId: randomUUID(),
    gameId: randomUUID(),
    consentTag: "a".repeat(64),
    decisionFingerprint: "b".repeat(64),
    eventSequence,
  };
}

describe("bounded push outbox", () => {
  it("retains only lease-bounded receipts across decision pruning and coalescing", () => {
    const queue = new PushOutbox();
    const item = input();
    queue.enqueue(item, 1_000, Infinity);
    const claimed = queue.claim(1_000)!;
    queue.prune(
      1_001,
      () => false,
      () => true,
    );
    expect(queue.snapshot()).toEqual([]);
    const restarted = new PushOutbox(queue.snapshot(), queue.receipts());
    restarted.enqueue({ ...item, eventSequence: 2 }, 1_002, Infinity);
    expect(
      restarted.finish(claimed.id, claimed.leaseToken!, "gone", 1_003),
    ).toBe(item.bindingId);
    expect(restarted.snapshot()).toHaveLength(1);
    expect(restarted.receipts()).toEqual([]);
    expect(
      restarted.finish(claimed.id, claimed.leaseToken!, "gone", 1_004),
    ).toBeUndefined();
    const next = restarted.claim(1_004)!;
    restarted.prune(
      1_004 + PUSH_LEASE_MS,
      () => true,
      () => true,
    );
    expect(restarted.receipts()).toEqual([]);
    expect(
      restarted.finish(
        next.id,
        next.leaseToken!,
        "gone",
        1_004 + PUSH_LEASE_MS,
      ),
    ).toBeUndefined();
  });

  it("drops damaged, duplicate, and unauthorized completion receipts", () => {
    const queue = new PushOutbox();
    queue.enqueue(input(), 1_000, Infinity);
    const claimed = queue.claim(1_000)!;
    expect(new PushOutbox([], [claimed, claimed, {}, null]).receipts()).toEqual(
      [],
    );
    queue.prune(
      1_001,
      () => true,
      () => false,
    );
    expect(queue.receipts()).toEqual([]);
  });

  it("coalesces newer intents and rejects stale outcomes without losing newer work", () => {
    const queue = new PushOutbox();
    const item = input();
    queue.enqueue(item, 1_000, Infinity);
    const first = queue.claim(1_000)!;
    expect(queue.claim(1_001)).toBeUndefined();
    queue.enqueue(item, 1_002, Infinity);
    expect(queue.snapshot()[0]).toEqual(first);
    queue.enqueue({ ...item, eventSequence: 2 }, 1_003, Infinity);
    expect(
      queue.finish(first.id, first.leaseToken!, "sent", 1_004),
    ).toBeUndefined();
    expect(queue.claim(1_004)).toMatchObject({ eventSequence: 2, attempts: 1 });
  });

  it("restores leases, reclaims abandoned work, and ignores late acknowledgements", () => {
    const queue = new PushOutbox();
    queue.enqueue(input(), 1_000, Infinity);
    const first = queue.claim(1_000)!;
    const restarted = new PushOutbox(queue.snapshot());
    expect(restarted.claim(1_001)).toBeUndefined();
    const next = restarted.claim(1_000 + PUSH_LEASE_MS)!;
    expect(next.leaseToken).not.toBe(first.leaseToken);
    expect(
      restarted.finish(
        first.id,
        first.leaseToken!,
        "sent",
        1_001 + PUSH_LEASE_MS,
      ),
    ).toBeUndefined();
    expect(restarted.snapshot()).toHaveLength(1);
    expect(
      restarted.finish(
        next.id,
        next.leaseToken!,
        "sent",
        1_001 + PUSH_LEASE_MS,
      ),
    ).toBe(next.bindingId);
    expect(restarted.snapshot()).toEqual([]);
  });

  it("bounds retries and stops after five attempts", () => {
    const queue = new PushOutbox();
    let now = 1_000;
    queue.enqueue(input(), now, Infinity);
    for (let attempt = 1; attempt <= 5; attempt++) {
      const claimed = queue.claim(now)!;
      expect(claimed.attempts).toBe(attempt);
      queue.finish(claimed.id, claimed.leaseToken!, "retry", now);
      if (attempt < 5) {
        const next = queue.snapshot()[0]!;
        expect(next.nextAttemptAt).toBeGreaterThan(now);
        expect(queue.claim(next.nextAttemptAt - 1)).toBeUndefined();
        now = next.nextAttemptAt;
      }
    }
    expect(queue.snapshot()).toEqual([]);
  });

  it("caps lifetime and prunes expired, exhausted, and unauthorized work", () => {
    const queue = new PushOutbox();
    queue.enqueue(input(), 1_000, Infinity);
    expect(queue.snapshot()[0]!.expiresAt).toBe(1_000 + PUSH_LIFETIME_MS);
    queue.prune(1_000, () => false);
    expect(queue.snapshot()).toEqual([]);
    queue.enqueue(input(), 1_000, 1_500);
    expect(queue.claim(1_000)!.leaseExpiresAt).toBe(1_500);
    queue.prune(1_500, () => true);
    expect(queue.snapshot()).toEqual([]);
    queue.enqueue(input(), 2_000, 1_500);
    expect(queue.snapshot()).toEqual([]);
  });

  it("fails closed on malformed or duplicate retained records and returns detached snapshots", () => {
    const queue = new PushOutbox();
    queue.enqueue(input(), 1_000, Infinity);
    const [saved] = queue.snapshot();
    for (const records of [
      null,
      {},
      [null, {}],
      [saved, saved],
      [{ ...saved, attempts: 99 }],
    ]) {
      expect(new PushOutbox(records).snapshot()).toEqual([]);
    }
    const external = queue.snapshot() as unknown as { attempts: number }[];
    external[0]!.attempts = 99;
    expect(queue.snapshot()[0]!.attempts).toBe(0);
  });
});
