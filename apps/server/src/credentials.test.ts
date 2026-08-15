import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  credentialVerifier,
  generateCredential,
  isCanonicalCredential,
} from "./credentials.js";

describe("bearer credentials", () => {
  it("generates exactly 32 random bytes in canonical unpadded base64url", () => {
    const credential = generateCredential();

    expect(credential).toHaveLength(43);
    expect(isCanonicalCredential(credential)).toBe(true);
    expect(Buffer.from(credential, "base64url")).toHaveLength(32);
  });

  it.each(["", "abc", "a".repeat(42), `${"a".repeat(42)}=`, "!".repeat(43)])(
    "rejects noncanonical value %s",
    (value) => {
      expect(isCanonicalCredential(value)).toBe(false);
    },
  );

  it("domain-separates persistent verifiers", () => {
    const pepper = randomBytes(32);
    const credential = generateCredential();

    expect(credentialVerifier(pepper, "browser-session", credential)).not.toBe(
      credentialVerifier(pepper, "invitation", credential),
    );
  });
});
