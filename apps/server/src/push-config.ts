import { createECDH } from "node:crypto";
import { constants } from "node:fs";
import { open, writeFile } from "node:fs/promises";
import webPush from "web-push";
import type { PushVapidDetails } from "./push-provider.js";

function parse(value: unknown): PushVapidDetails {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error();
  const config = value as Record<string, unknown>;
  if (
    Object.keys(config).length !== 3 ||
    typeof config.subject !== "string" ||
    config.subject.length > 2_048 ||
    typeof config.publicKey !== "string" ||
    typeof config.privateKey !== "string"
  )
    throw new Error();
  const subject = new URL(config.subject);
  if (
    !["https:", "mailto:"].includes(subject.protocol) ||
    !subject.pathname ||
    subject.username ||
    subject.password ||
    subject.hash ||
    subject.href !== config.subject
  )
    throw new Error();
  const decode = (encoded: string, size: number) => {
    if (!/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error();
    const bytes = Buffer.from(encoded, "base64url");
    if (bytes.length !== size || bytes.toString("base64url") !== encoded)
      throw new Error();
    return bytes;
  };
  const privateKey = decode(config.privateKey, 32);
  const publicKey = decode(config.publicKey, 65);
  const key = createECDH("prime256v1");
  key.setPrivateKey(privateKey);
  if (!key.getPublicKey().equals(publicKey)) throw new Error();
  const result = {
    subject: config.subject,
    publicKey: config.publicKey,
    privateKey: config.privateKey,
  };
  webPush.getVapidHeaders(
    "https://fcm.googleapis.com",
    result.subject,
    result.publicKey,
    result.privateKey,
    "aes128gcm",
  );
  return result;
}

export async function loadPushVapid(
  file: string | undefined,
): Promise<PushVapidDetails | undefined> {
  if (file === undefined) return undefined;
  let handle;
  try {
    handle = await open(
      file,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const stat = await handle.stat();
    if (
      !stat.isFile() ||
      (stat.mode & 0o777) !== 0o600 ||
      stat.uid !== process.getuid?.() ||
      stat.size < 1 ||
      stat.size > 8_192
    )
      throw new Error();
    const buffer = Buffer.alloc(8_193);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > 8_192) throw new Error();
    return parse(
      JSON.parse(buffer.subarray(0, bytesRead).toString("utf8")) as unknown,
    );
  } catch {
    throw new Error(
      "Push VAPID configuration must be a valid owner-only 0600 file.",
    );
  } finally {
    await handle?.close();
  }
}

// Explicit operator action only: never silently replace a key used by existing
// browser subscriptions, and never write private key material to stdout.
export async function createPushVapidFile(
  file: string,
  subject: string,
): Promise<void> {
  try {
    const config = parse({ ...webPush.generateVAPIDKeys(), subject });
    await writeFile(file, `${JSON.stringify(config)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
  } catch {
    throw new Error(
      "Could not create new push VAPID configuration; existing files are never overwritten.",
    );
  }
}
