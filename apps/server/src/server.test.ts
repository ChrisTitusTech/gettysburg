import { describe, expect, it } from "vitest";

import { isTrustedWebSocketOrigin } from "./server.js";

describe("WebSocket origin policy", () => {
  it("accepts only the exact configured origin", () => {
    const trusted = "https://gettysburg.example";

    expect(isTrustedWebSocketOrigin(trusted, trusted)).toBe(true);
    expect(isTrustedWebSocketOrigin(trusted, undefined)).toBe(false);
    expect(isTrustedWebSocketOrigin(trusted, "https://evil.example")).toBe(
      false,
    );
    expect(
      isTrustedWebSocketOrigin(trusted, "https://gettysburg.example.evil"),
    ).toBe(false);
  });
});
