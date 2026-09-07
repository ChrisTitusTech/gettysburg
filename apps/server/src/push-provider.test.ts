import { createECDH, randomBytes, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type { ClientRequest, IncomingMessage } from "node:http";
import type { request, RequestOptions } from "node:https";
import { afterEach, describe, expect, it, vi } from "vitest";
import webPush from "web-push";
import type { PushDelivery } from "./game-service.js";
import { createPushProvider, publicPushAddress } from "./push-provider.js";

function fixture() {
  const key = createECDH("prime256v1");
  key.generateKeys();
  const delivery: PushDelivery = {
    subscription: {
      endpoint: "https://fcm.googleapis.com/fcm/send/private-test-path",
      expirationTime: null,
      keys: {
        auth: randomBytes(16).toString("base64url"),
        p256dh: key.getPublicKey().toString("base64url"),
      },
    },
    intent: {
      id: randomUUID(),
      bindingId: randomUUID(),
      gameId: randomUUID(),
      consentTag: "a".repeat(64),
      decisionFingerprint: "b".repeat(64),
      eventSequence: 2,
      createdAt: 1_000,
      expiresAt: 61_000,
      attempts: 1,
      nextAttemptAt: 1_000,
      leaseToken: randomUUID(),
      leaseExpiresAt: 31_000,
    },
  };
  const vapid = {
    ...webPush.generateVAPIDKeys(),
    subject: "mailto:push@example.com",
  };
  let options: RequestOptions | undefined;
  let url: URL | undefined;
  let responseCallback: ((response: IncomingMessage) => void) | undefined;
  const outgoing = new EventEmitter() as ClientRequest;
  outgoing.end = vi.fn().mockReturnValue(outgoing);
  const send = vi.fn(
    (
      target: URL,
      config: RequestOptions,
      callback: (response: IncomingMessage) => void,
    ) => {
      url = target;
      options = config;
      responseCallback = callback;
      config.signal?.addEventListener(
        "abort",
        () => outgoing.emit("error", new Error("aborted")),
        { once: true },
      );
      return outgoing;
    },
  );
  const resolve = vi.fn(async () => ["8.8.8.8"]);
  const authorize = vi.fn(
    async (_intent: PushDelivery["intent"], begin: () => void) => begin(),
  );
  const provider = createPushProvider(vapid, authorize, {
    resolve,
    request: send as unknown as typeof request,
    now: () => 1_000,
  });
  const respond = (status: number) => {
    const response = new EventEmitter() as IncomingMessage;
    response.statusCode = status;
    response.destroy = vi.fn().mockReturnValue(response);
    responseCallback!(response);
    return response;
  };
  return {
    delivery,
    authorize,
    vapid,
    send,
    resolve,
    provider,
    outgoing,
    respond,
    options: () => options!,
    url: () => url!,
  };
}

afterEach(() => vi.useRealTimers());

describe("public provider addresses", () => {
  it.each(["8.8.8.8", "2606:4700:4700::1111"])(
    "accepts public unicast %s",
    (address) => {
      expect(publicPushAddress(address)).toBe(true);
    },
  );
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "240.0.0.1",
    "192.0.2.1",
    "198.18.0.1",
    "::",
    "::1",
    "fe80::1",
    "fd00::1",
    "ff02::1",
    "2001:db8::1",
    "::ffff:8.8.8.8",
    "64:ff9b::808:808",
    "2002:0808:0808::1",
    "3fff::1",
    "4000::1",
    "not-an-ip",
  ])("rejects non-public or translated %s", (address) =>
    expect(publicPushAddress(address)).toBe(false),
  );
});

describe("bounded encrypted provider transport", () => {
  it("rechecks authorization after DNS and refuses denied or late dispatch", async () => {
    const f = fixture();
    let late: (() => void) | undefined;
    f.authorize.mockImplementation(async (_intent, begin) => {
      expect(f.resolve).toHaveBeenCalledOnce();
      late = begin; // Current lease/consent is denied: do not dispatch.
    });
    expect(await f.provider(f.delivery)).toBe("retry");
    expect(f.send).not.toHaveBeenCalled();
    expect(() => late!()).toThrow();
    expect(f.send).not.toHaveBeenCalled();
  });

  it("uses a shorter lease deadline and cannot dispatch twice", async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.authorize.mockImplementation(async (_intent, begin) => {
      begin();
      begin();
    });
    const pending = f.provider({
      ...f.delivery,
      intent: { ...f.delivery.intent, leaseExpiresAt: 1_100 },
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(await pending).toBe("retry");
    expect(f.send).toHaveBeenCalledOnce();
  });

  it("pins checked DNS while retaining authority and TLS, encrypts payload, and discards the response", async () => {
    const f = fixture();
    const pending = f.provider(f.delivery);
    await vi.waitFor(() => expect(f.send).toHaveBeenCalledOnce());
    expect(f.url().href).toBe(f.delivery.subscription.endpoint);
    expect(f.options()).toMatchObject({
      method: "POST",
      agent: false,
      family: 4,
      servername: "fcm.googleapis.com",
      rejectUnauthorized: true,
      maxHeaderSize: 16_384,
    });
    expect(f.options().checkServerIdentity).toBeUndefined();
    const lookup = vi.fn();
    f.options().lookup!("fcm.googleapis.com", {}, lookup);
    expect(lookup).toHaveBeenCalledWith(null, "8.8.8.8", 4);
    expect(f.resolve).toHaveBeenCalledOnce();
    const body = vi.mocked(f.outgoing.end).mock.calls[0]![0] as Buffer;
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(body.toString()).not.toContain(f.delivery.intent.gameId);
    expect(f.options().headers).toMatchObject({
      "Content-Encoding": "aes128gcm",
      TTL: 60,
    });
    const response = f.respond(201);
    expect(await pending).toBe("sent");
    expect(response.destroy).toHaveBeenCalledOnce();
  });

  it.each([
    [404, "gone"],
    [410, "gone"],
    [301, "retry"],
    [307, "retry"],
    [401, "retry"],
    [429, "retry"],
    [500, "retry"],
  ])("maps %s without following redirects", async (status, outcome) => {
    const f = fixture();
    const pending = f.provider(f.delivery);
    await vi.waitFor(() => expect(f.send).toHaveBeenCalledOnce());
    f.respond(status as number);
    expect(await pending).toBe(outcome);
    expect(f.send).toHaveBeenCalledOnce();
  });

  it.each([
    [],
    ["8.8.8.8", "127.0.0.1"],
    ["::ffff:127.0.0.1"],
    Array<string>(65).fill("8.8.8.8"),
  ])(
    "rejects unsafe resolution before making a request",
    async (...addresses) => {
      const f = fixture();
      f.resolve.mockResolvedValue(addresses as string[]);
      expect(await f.provider(f.delivery)).toBe("retry");
      expect(f.send).not.toHaveBeenCalled();
    },
  );

  it("rejects unsupported endpoints, expired leases, and already-cancelled work before DNS", async () => {
    const f = fixture();
    expect(
      await f.provider({
        ...f.delivery,
        subscription: {
          ...f.delivery.subscription,
          endpoint: "https://localhost/private",
        },
      }),
    ).toBe("retry");
    expect(
      await f.provider({
        ...f.delivery,
        intent: { ...f.delivery.intent, leaseExpiresAt: 1_000 },
      }),
    ).toBe("retry");
    expect(await f.provider(f.delivery, AbortSignal.abort())).toBe("retry");
    expect(f.resolve).not.toHaveBeenCalled();
    expect(f.send).not.toHaveBeenCalled();
  });

  it("bounds stalled response headers by the total deadline and handles socket failure", async () => {
    vi.useFakeTimers();
    const f = fixture();
    const pending = f.provider(f.delivery);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toBe("retry");
    expect(f.options().signal?.aborted).toBe(true);
    const failed = f.provider(f.delivery);
    await vi.advanceTimersByTimeAsync(0);
    f.outgoing.emit("error", new Error("private provider diagnostics"));
    expect(await failed).toBe("retry");
  });

  it("cancels a pending DNS operation on shutdown and never starts a late request", async () => {
    const f = fixture();
    const shutdown = new AbortController();
    const resolver = vi.fn(
      (_host: string, signal: AbortSignal) =>
        new Promise<string[]>((_resolve, reject) =>
          signal.addEventListener(
            "abort",
            () => reject(new Error("cancelled")),
            { once: true },
          ),
        ),
    );
    const provider = createPushProvider(f.vapid, f.authorize, {
      resolve: resolver,
      request: f.send as unknown as typeof request,
      now: () => 1_000,
    });
    const pending = provider(f.delivery, shutdown.signal);
    shutdown.abort();
    expect(await pending).toBe("retry");
    expect(f.send).not.toHaveBeenCalled();
  });
});
