import {
  ECDH,
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

export interface BrowserPushSubscription {
  readonly endpoint: string;
  readonly expirationTime: number | null;
  readonly keys: { readonly auth: string; readonly p256dh: string };
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bytes(value: unknown, length: number): Buffer {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value))
    throw new Error("Invalid push key.");
  const decoded = Buffer.from(value, "base64url");
  if (decoded.length !== length || decoded.toString("base64url") !== value)
    throw new Error("Invalid push key.");
  return decoded;
}

// These production provider authorities cover Chrome, Firefox, and Safari.
// Paths and query strings are opaque. The sender must additionally validate
// resolved addresses, retain TLS hostname checks, and never follow redirects.
export function parsePushSubscription(value: unknown): BrowserPushSubscription {
  if (
    !object(value) ||
    Object.keys(value).some(
      (key) => !["endpoint", "expirationTime", "keys"].includes(key),
    ) ||
    typeof value.endpoint !== "string" ||
    value.endpoint.length > 2_048 ||
    !object(value.keys) ||
    Object.keys(value.keys).length !== 2
  )
    throw new Error("Invalid push subscription.");
  const endpoint = new URL(value.endpoint);
  const permitted =
    endpoint.hostname === "fcm.googleapis.com" ||
    endpoint.hostname === "updates.push.services.mozilla.com" ||
    /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.push\.apple\.com$/.test(endpoint.hostname);
  if (
    !permitted ||
    endpoint.protocol !== "https:" ||
    endpoint.port !== "" ||
    endpoint.username !== "" ||
    endpoint.password !== "" ||
    endpoint.hash !== "" ||
    endpoint.href !== value.endpoint
  )
    throw new Error("Unsupported push endpoint.");
  bytes(value.keys.auth, 16);
  const publicKey = bytes(value.keys.p256dh, 65);
  if (publicKey[0] !== 4) throw new Error("Invalid push public key.");
  ECDH.convertKey(publicKey, "prime256v1"); // Reject points not on P-256.
  const expirationTime = value.expirationTime ?? null;
  if (
    expirationTime !== null &&
    (!Number.isSafeInteger(expirationTime) || (expirationTime as number) < 0)
  )
    throw new Error("Invalid push expiration.");
  return {
    endpoint: endpoint.href,
    expirationTime: expirationTime as number | null,
    keys: {
      auth: value.keys.auth as string,
      p256dh: value.keys.p256dh as string,
    },
  };
}

function encryptionKey(pepper: Uint8Array): Buffer {
  if (pepper.length < 32)
    throw new Error("Push encryption requires the credential pepper.");
  return createHmac("sha256", pepper)
    .update("gettysburg:push-subscription:v1")
    .digest();
}

export function sealPushSubscription(
  pepper: Uint8Array,
  bindingId: string,
  subscription: BrowserPushSubscription,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(pepper), iv);
  cipher.setAAD(Buffer.from(bindingId, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(parsePushSubscription(subscription)), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
    "base64url",
  );
}

export function openPushSubscription(
  pepper: Uint8Array,
  bindingId: string,
  sealed: string,
): BrowserPushSubscription {
  if (!/^[A-Za-z0-9_-]+$/.test(sealed) || sealed.length > 4_096)
    throw new Error("Invalid protected push subscription.");
  const data = Buffer.from(sealed, "base64url");
  if (data.length < 29 || data.toString("base64url") !== sealed)
    throw new Error("Invalid protected push subscription.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(pepper),
    data.subarray(0, 12),
  );
  decipher.setAAD(Buffer.from(bindingId, "utf8"));
  decipher.setAuthTag(data.subarray(12, 28));
  const plaintext = Buffer.concat([
    decipher.update(data.subarray(28)),
    decipher.final(),
  ]);
  return parsePushSubscription(
    JSON.parse(plaintext.toString("utf8")) as unknown,
  );
}
