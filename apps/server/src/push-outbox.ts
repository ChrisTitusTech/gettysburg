import { randomUUID } from "node:crypto";

export const PUSH_LIFETIME_MS = 24 * 60 * 60 * 1_000;
export const PUSH_LEASE_MS = 30_000;
const RETRY_DELAYS_MS = [60_000, 300_000, 900_000, 3_600_000] as const;

export interface StoredPushIntent {
  readonly id: string;
  readonly bindingId: string;
  readonly gameId: string;
  readonly consentTag: string;
  readonly decisionFingerprint: string;
  readonly eventSequence: number;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly attempts: number;
  readonly nextAttemptAt: number;
  readonly leaseToken: string | null;
  readonly leaseExpiresAt: number | null;
}

export type PushDeliveryOutcome = "sent" | "gone" | "retry";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function valid(value: unknown): value is StoredPushIntent {
  if (typeof value !== "object" || value === null) return false;
  const item = value as StoredPushIntent;
  return (
    [item.id, item.bindingId, item.gameId].every(
      (id) => typeof id === "string" && UUID.test(id),
    ) &&
    [
      item.eventSequence,
      item.createdAt,
      item.expiresAt,
      item.attempts,
      item.nextAttemptAt,
    ].every((number) => Number.isSafeInteger(number) && number >= 0) &&
    item.eventSequence > 0 &&
    typeof item.consentTag === "string" &&
    /^[0-9a-f]{64}$/.test(item.consentTag) &&
    typeof item.decisionFingerprint === "string" &&
    /^[0-9a-f]{64}$/.test(item.decisionFingerprint) &&
    item.expiresAt > item.createdAt &&
    item.expiresAt <= item.createdAt + PUSH_LIFETIME_MS &&
    item.attempts <= RETRY_DELAYS_MS.length + 1 &&
    item.nextAttemptAt >= item.createdAt &&
    ((item.leaseToken === null && item.leaseExpiresAt === null) ||
      (typeof item.leaseToken === "string" &&
        UUID.test(item.leaseToken) &&
        Number.isSafeInteger(item.leaseExpiresAt) &&
        item.leaseExpiresAt! >= item.createdAt &&
        item.leaseExpiresAt! <= item.expiresAt &&
        item.attempts > 0))
  );
}

// Pure queue bookkeeping apart from unguessable claim identifiers. The owning
// service supplies current authorization and persists every mutation atomically.
export class PushOutbox {
  readonly #items = new Map<string, StoredPushIntent>();
  readonly #receipts = new Map<string, StoredPushIntent>();

  constructor(records: unknown = [], receipts: unknown = []) {
    if (Array.isArray(receipts)) {
      const duplicates = new Set<string>();
      for (const receipt of receipts) {
        if (
          !valid(receipt) ||
          !receipt.leaseToken ||
          receipt.leaseExpiresAt === null
        )
          continue;
        if (this.#receipts.has(receipt.leaseToken))
          duplicates.add(receipt.leaseToken);
        this.#receipts.set(receipt.leaseToken, structuredClone(receipt));
      }
      for (const token of duplicates) this.#receipts.delete(token);
    }
    if (!Array.isArray(records)) return;
    const duplicates = new Set<string>();
    for (const record of records) {
      if (!valid(record)) continue;
      if (this.#items.has(record.bindingId)) duplicates.add(record.bindingId);
      this.#items.set(record.bindingId, structuredClone(record));
    }
    for (const bindingId of duplicates) this.#items.delete(bindingId);
  }

  snapshot(): readonly StoredPushIntent[] {
    return structuredClone([...this.#items.values()]);
  }

  receipts(): readonly StoredPushIntent[] {
    return structuredClone([...this.#receipts.values()]);
  }

  prune(
    now: number,
    authorized: (intent: StoredPushIntent) => boolean,
    receiptAuthorized: (intent: StoredPushIntent) => boolean = authorized,
  ): void {
    for (const [token, receipt] of this.#receipts) {
      if (
        (receipt.leaseExpiresAt ?? 0) <= now ||
        receipt.expiresAt <= now ||
        !receiptAuthorized(receipt)
      )
        this.#receipts.delete(token);
    }
    for (const [bindingId, item] of this.#items) {
      if (
        item.expiresAt <= now ||
        !authorized(item) ||
        (item.attempts > RETRY_DELAYS_MS.length &&
          (item.leaseExpiresAt ?? 0) <= now)
      )
        this.#items.delete(bindingId);
    }
  }

  enqueue(
    input: Pick<
      StoredPushIntent,
      | "bindingId"
      | "gameId"
      | "eventSequence"
      | "consentTag"
      | "decisionFingerprint"
    >,
    now: number,
    consentExpiresAt: number,
  ): void {
    if (consentExpiresAt <= now) return;
    const previous = this.#items.get(input.bindingId);
    if (previous && previous.eventSequence >= input.eventSequence) return;
    this.#items.set(input.bindingId, {
      ...input,
      id: randomUUID(),
      createdAt: now,
      expiresAt: Math.min(now + PUSH_LIFETIME_MS, consentExpiresAt),
      attempts: 0,
      nextAttemptAt: now,
      leaseToken: null,
      leaseExpiresAt: null,
    });
  }

  claim(now: number): StoredPushIntent | undefined {
    const item = [...this.#items.values()]
      .filter(
        (candidate) =>
          candidate.expiresAt > now &&
          candidate.nextAttemptAt <= now &&
          (candidate.leaseExpiresAt ?? 0) <= now &&
          candidate.attempts <= RETRY_DELAYS_MS.length,
      )
      .sort(
        (left, right) =>
          left.nextAttemptAt - right.nextAttemptAt ||
          left.id.localeCompare(right.id),
      )[0];
    if (!item) return undefined;
    const claimed = {
      ...item,
      attempts: item.attempts + 1,
      leaseToken: randomUUID(),
      leaseExpiresAt: Math.min(now + PUSH_LEASE_MS, item.expiresAt),
    };
    this.#items.set(item.bindingId, claimed);
    this.#receipts.set(claimed.leaseToken, structuredClone(claimed));
    return structuredClone(claimed);
  }

  finish(
    id: string,
    leaseToken: string,
    outcome: PushDeliveryOutcome,
    now: number,
  ): string | undefined {
    const receipt = this.#receipts.get(leaseToken);
    const currentReceipt =
      receipt?.id === id &&
      (receipt.leaseExpiresAt ?? 0) > now &&
      receipt.expiresAt > now;
    if (currentReceipt) this.#receipts.delete(leaseToken);
    const item = [...this.#items.values()].find(
      (candidate) => candidate.id === id,
    );
    if (
      !item ||
      item.leaseToken !== leaseToken ||
      (item.leaseExpiresAt ?? 0) <= now ||
      item.expiresAt <= now
    )
      return currentReceipt && outcome === "gone"
        ? receipt.bindingId
        : undefined;
    const delay = RETRY_DELAYS_MS[item.attempts - 1];
    if (
      outcome !== "retry" ||
      delay === undefined ||
      now + delay >= item.expiresAt
    ) {
      this.#items.delete(item.bindingId);
    } else {
      this.#items.set(item.bindingId, {
        ...item,
        nextAttemptAt: now + delay,
        leaseToken: null,
        leaseExpiresAt: null,
      });
    }
    return item.bindingId;
  }
}
