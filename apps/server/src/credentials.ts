import { createHmac, randomBytes } from "node:crypto";

const CREDENTIAL_BYTES = 32;
const CREDENTIAL_LENGTH = 43;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type CredentialDomain =
  "browser-session" | "invitation" | "recovery-grant";

export function generateCredential(): string {
  return randomBytes(CREDENTIAL_BYTES).toString("base64url");
}

export function isCanonicalCredential(value: string): boolean {
  if (value.length !== CREDENTIAL_LENGTH || !BASE64URL_PATTERN.test(value)) {
    return false;
  }

  const decoded = Buffer.from(value, "base64url");
  return (
    decoded.byteLength === CREDENTIAL_BYTES &&
    decoded.toString("base64url") === value
  );
}

export function credentialVerifier(
  pepper: Uint8Array,
  domain: CredentialDomain,
  credential: string,
): string {
  if (!isCanonicalCredential(credential)) {
    throw new Error("Credential must be canonical 32-byte base64url");
  }

  return createHmac("sha256", pepper)
    .update(`gettysburg:${domain}:v1`, "utf8")
    .update("\0", "utf8")
    .update(credential, "ascii")
    .digest("hex");
}
