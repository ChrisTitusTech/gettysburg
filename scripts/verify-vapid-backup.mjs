import { createECDH } from "node:crypto";
import { constants, closeSync, fstatSync, openSync, readSync } from "node:fs";

// Standalone on the host: no application dependencies or private-key output.
let descriptor;
try {
  if (process.argv.length !== 3) throw new Error();
  descriptor = openSync(
    process.argv[2],
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  const stat = fstatSync(descriptor);
  if (
    !stat.isFile() ||
    (stat.mode & 0o777) !== 0o600 ||
    stat.uid !== process.getuid() ||
    stat.size < 1 ||
    stat.size > 8_192
  )
    throw new Error();
  const bytes = Buffer.alloc(8_193);
  const size = readSync(descriptor, bytes, 0, bytes.length, 0);
  if (size > 8_192) throw new Error();
  const value = JSON.parse(bytes.subarray(0, size).toString("utf8"));
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== 3 ||
    typeof value.subject !== "string" ||
    value.subject.length > 2_048
  )
    throw new Error();
  const subject = new URL(value.subject);
  if (
    !["https:", "mailto:"].includes(subject.protocol) ||
    !subject.pathname ||
    subject.username ||
    subject.password ||
    subject.hash ||
    subject.href !== value.subject
  )
    throw new Error();
  const decode = (text, expectedSize) => {
    if (typeof text !== "string" || !/^[A-Za-z0-9_-]+$/.test(text))
      throw new Error();
    const decoded = Buffer.from(text, "base64url");
    if (
      decoded.length !== expectedSize ||
      decoded.toString("base64url") !== text
    )
      throw new Error();
    return decoded;
  };
  const key = createECDH("prime256v1");
  key.setPrivateKey(decode(value.privateKey, 32));
  if (!key.getPublicKey().equals(decode(value.publicKey, 65)))
    throw new Error();
} catch {
  console.error(
    "Push key backup is not a valid owner-only matching P-256 configuration.",
  );
  process.exitCode = 1;
} finally {
  if (descriptor !== undefined) closeSync(descriptor);
}
