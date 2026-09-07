import { setTimeout as delay } from "node:timers/promises";
import { createECDH, randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COMMAND_SCHEMA_VERSION } from "@gettysburg/game";
import { randomUUID } from "node:crypto";
import { InMemoryAsyncGameService } from "./postgres-store.js";
import { startPushWorker } from "./push-worker.js";
import type { PushDelivery } from "./game-service.js";
import type { PushDeliveryOutcome } from "./push-outbox.js";

vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn() }));
const vapid = {
  subject: "mailto:test@example.com",
  publicKey: "unused",
  privateKey: "unused",
};
const workers: ReturnType<typeof startPushWorker>[] = [];
afterEach(async () => {
  await Promise.all(workers.splice(0).map((worker) => worker.stop()));
  vi.resetAllMocks();
});

async function fixture() {
  const store = new InMemoryAsyncGameService();
  const host = await store.createGame("union");
  const guest = await store.claimInvitation({
    lookupId: host.invitation.lookup_id,
    secret: host.invitation.secret,
  });
  const key = createECDH("prime256v1");
  key.generateKeys();
  await store.setPushSubscription(guest.credential, host.gameId, {
    endpoint: "https://fcm.googleapis.com/fcm/send/worker-test",
    expirationTime: null,
    keys: {
      auth: randomBytes(16).toString("base64url"),
      p256dh: key.getPublicKey().toString("base64url"),
    },
  });
  await store.executeCommand(
    await store.authenticate(host.credential, host.gameId),
    {
      command_id: randomUUID(),
      command_name: "endPhase",
      payload: {},
      game_id: host.gameId,
      expected_version: 0,
      schema: COMMAND_SCHEMA_VERSION,
    },
  );
  let wake: (() => void) | undefined;
  vi.mocked(delay).mockImplementation(
    (_ms, _value, options) =>
      new Promise((resolve, reject) => {
        wake = () => resolve(undefined);
        options?.signal?.addEventListener(
          "abort",
          () => reject(new Error("stopped")),
          { once: true },
        );
      }),
  );
  return { store, host, guest, wake: () => wake!() };
}

describe("serial push worker", () => {
  it("claims one persisted lease, waits for its outcome, then polls without idle rewrites", async () => {
    const f = await fixture();
    const claim = vi.spyOn(f.store, "claimPushDelivery");
    const finish = vi.spyOn(f.store, "finishPushDelivery");
    let complete: (outcome: PushDeliveryOutcome) => void = () => undefined;
    const send = vi.fn(
      () =>
        new Promise<PushDeliveryOutcome>((resolve) => {
          complete = resolve;
        }),
    );
    const worker = startPushWorker(f.store, vapid, { send });
    workers.push(worker);
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    expect(claim).toHaveBeenCalledOnce();
    expect(finish).not.toHaveBeenCalled();
    const delivered = (await claim.mock.results[0]!.value)!;
    complete("sent");
    await vi.waitFor(() => expect(delay).toHaveBeenCalledOnce());
    expect(finish).toHaveBeenCalledWith(
      delivered.intent.id,
      delivered.intent.leaseToken,
      "sent",
      expect.any(AbortSignal),
    );
    f.wake();
    await vi.waitFor(() => expect(claim).toHaveBeenCalledTimes(2));
    expect(send).toHaveBeenCalledOnce();
    await worker.stop();
  });

  it("cancels an in-flight send and does not acknowledge its abandoned lease", async () => {
    const f = await fixture();
    const finish = vi.spyOn(f.store, "finishPushDelivery");
    const send = vi.fn(
      (_delivery: PushDelivery, signal: AbortSignal) =>
        new Promise<PushDeliveryOutcome>((resolve) =>
          signal.addEventListener("abort", () => resolve("retry"), {
            once: true,
          }),
        ),
    );
    const worker = startPushWorker(f.store, vapid, { send });
    workers.push(worker);
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    await worker.stop();
    expect(finish).not.toHaveBeenCalled();
    expect(await f.store.claimPushDelivery()).toBeUndefined();
  });

  it("survives database and telemetry failures without disclosing their errors", async () => {
    const f = await fixture();
    const claim = vi
      .spyOn(f.store, "claimPushDelivery")
      .mockRejectedValueOnce(new Error("private database details"));
    const send = vi.fn(async () => "sent" as const);
    const failure = vi.fn(() => {
      throw new Error("telemetry failed");
    });
    workers.push(startPushWorker(f.store, vapid, { send, onFailure: failure }));
    await vi.waitFor(() => expect(delay).toHaveBeenCalledOnce());
    expect(failure).toHaveBeenCalledWith();
    expect(send).not.toHaveBeenCalled();
    f.wake();
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    expect(claim).toHaveBeenCalledTimes(2);
  });

  it("authorizes only the current lease and decision, not a retained completion receipt", async () => {
    const f = await fixture();
    const delivery = (await f.store.claimPushDelivery())!;
    const begin = vi.fn();
    await f.store.authorizePushDelivery(
      delivery.intent.id,
      randomUUID(),
      begin,
      new AbortController().signal,
    );
    expect(begin).not.toHaveBeenCalled();
    await f.store.authorizePushDelivery(
      delivery.intent.id,
      delivery.intent.leaseToken!,
      begin,
      new AbortController().signal,
    );
    expect(begin).toHaveBeenCalledOnce();
    await f.store.executeCommand(
      await f.store.authenticate(f.guest.credential, f.host.gameId),
      {
        command_id: randomUUID(),
        command_name: "endPhase",
        payload: {},
        game_id: f.host.gameId,
        expected_version: 1,
        schema: COMMAND_SCHEMA_VERSION,
      },
    );
    await f.store.authorizePushDelivery(
      delivery.intent.id,
      delivery.intent.leaseToken!,
      begin,
      new AbortController().signal,
    );
    expect(begin).toHaveBeenCalledOnce();
    expect(f.store.service.exportSnapshot().pushDeliveryReceipts).toHaveLength(
      1,
    );
    await expect(
      f.store.authorizePushDelivery(
        delivery.intent.id,
        delivery.intent.leaseToken!,
        begin,
        AbortSignal.abort(),
      ),
    ).rejects.toThrow();
  });
});
