import { describe, expect, it } from "vitest";

import { adjacentHexes, hexDistance, shortestHexPath } from "./coordinates";

describe("hex movement geometry", () => {
  it("counts vertical and staggered neighbors as one movement point", () => {
    expect(hexDistance("F5", "F5")).toBe(0);
    expect(hexDistance("F5", "F6")).toBe(1);
    expect(hexDistance("F5", "G5")).toBe(1);
    expect(hexDistance("F5", "F10")).toBe(5);
  });

  it("clips edge neighbors to the playable A-U and 1-11 field", () => {
    expect(adjacentHexes("A1")).toEqual(["B1", "A2"]);
    expect(adjacentHexes("U11")).not.toContain("U12");
  });

  it("builds a contiguous shortest route including both endpoints", () => {
    const path = shortestHexPath("F5", "K8");
    expect(path).toHaveLength(hexDistance("F5", "K8") + 1);
    expect(path[0]).toBe("F5");
    expect(path.at(-1)).toBe("K8");
    for (let index = 1; index < path.length; index += 1) {
      expect(hexDistance(path[index - 1]!, path[index]!)).toBe(1);
    }
  });
});
