import { describe, expect, it } from "vitest";

import { isHexCoordinate } from "./coordinates";

describe("isHexCoordinate", () => {
  it.each(["A1", "K6", "U11"])("accepts playable coordinate %s", (value) => {
    expect(isHexCoordinate(value)).toBe(true);
  });

  it.each(["A0", "A12", "V1", "a1", "A01", ""])(
    "rejects invalid coordinate %s",
    (value) => {
      expect(isHexCoordinate(value)).toBe(false);
    },
  );
});
