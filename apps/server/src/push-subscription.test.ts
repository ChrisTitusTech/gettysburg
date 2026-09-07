import { createECDH, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  openPushSubscription,
  parsePushSubscription,
  sealPushSubscription,
} from "./push-subscription.js";

function subscription(
  endpoint = "https://fcm.googleapis.com/fcm/send/private-test-token",
) {
  const key = createECDH("prime256v1");
  key.generateKeys();
  return {
    endpoint,
    expirationTime: null,
    keys: {
      auth: randomBytes(16).toString("base64url"),
      p256dh: key.getPublicKey().toString("base64url"),
    },
  };
}

describe("protected browser push subscriptions", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/token",
    "https://updates.push.services.mozilla.com/wpush/v2/token",
    "https://web.push.apple.com/opaque/path?token=example",
    "https://region.web.push.apple.com/opaque/path",
  ])(
    "accepts the production provider authority with opaque URL %s",
    (endpoint) => {
      const input = subscription(endpoint);
      expect(parsePushSubscription(input)).toEqual(input);
      expect(
        parsePushSubscription({ ...input, expirationTime: 2_000 }),
      ).toMatchObject({ expirationTime: 2_000 });
    },
  );

  it.each([
    "http://fcm.googleapis.com/fcm/send/token",
    "https://127.0.0.1/private",
    "https://[::1]/private",
    "https://fcm.googleapis.com.attacker.example/private",
    "https://evilpush.apple.com/private",
    "https://push.apple.com/private",
    "https://web.push.apple.com.attacker.example/private",
    "https://updates-autopush.dev.mozaws.net/private",
    "https://user:secret@fcm.googleapis.com/private",
    "https://fcm.googleapis.com:8443/private",
    "https://fcm.googleapis.com/private#secret",
    "https://fcm.googleapis.com./private",
    " https://fcm.googleapis.com/private",
  ])("rejects unsupported or noncanonical endpoint %s", (endpoint) => {
    expect(() => parsePushSubscription(subscription(endpoint))).toThrow();
  });

  it("rejects malformed fields, noncanonical keys, and invalid curve points", () => {
    const valid = subscription();
    for (const input of [
      null,
      [],
      {},
      { ...valid, extra: true },
      { ...valid, endpoint: "https://fcm.googleapis.com/" + "x".repeat(2_048) },
      { ...valid, expirationTime: -1 },
      { ...valid, expirationTime: 1.5 },
      { ...valid, expirationTime: "2000" },
      { ...valid, keys: [] },
      { ...valid, keys: { ...valid.keys, extra: true } },
      { ...valid, keys: { ...valid.keys, auth: valid.keys.auth + "=" } },
      {
        ...valid,
        keys: { ...valid.keys, auth: randomBytes(32).toString("base64url") },
      },
      {
        ...valid,
        keys: {
          ...valid.keys,
          p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64)]).toString(
            "base64url",
          ),
        },
      },
    ])
      expect(() => parsePushSubscription(input)).toThrow();
  });

  it("encrypts endpoint and keys, authenticates the binding, and detects tampering", () => {
    const pepper = randomBytes(32);
    const input = subscription();
    const sealed = sealPushSubscription(pepper, "binding-one", input);
    expect(sealed).not.toContain(input.endpoint);
    expect(sealed).not.toContain(input.keys.auth);
    expect(sealed).not.toEqual(
      sealPushSubscription(pepper, "binding-one", input),
    );
    expect(openPushSubscription(pepper, "binding-one", sealed)).toEqual(input);
    expect(() => openPushSubscription(pepper, "binding-two", sealed)).toThrow();
    expect(() =>
      openPushSubscription(randomBytes(32), "binding-one", sealed),
    ).toThrow();
    const tampered = Buffer.from(sealed, "base64url");
    tampered[30] = tampered[30]! ^ 1;
    expect(() =>
      openPushSubscription(
        pepper,
        "binding-one",
        tampered.toString("base64url"),
      ),
    ).toThrow();
    expect(() =>
      openPushSubscription(pepper, "binding-one", sealed + "="),
    ).toThrow();
    expect(() =>
      sealPushSubscription(new Uint8Array(1), "binding-one", input),
    ).toThrow();
  });
});
