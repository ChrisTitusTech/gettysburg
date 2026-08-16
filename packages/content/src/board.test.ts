import { describe, expect, it } from "vitest";

import {
  BOARD_VIEW_BOX,
  FIXTURE_HEXES,
  HEX_RADIUS,
  coordinateToPoint,
  hexPolygonPoints,
  isFixtureCoordinate,
  pointToCoordinate,
} from "./board";

describe("fixture board calibration", () => {
  it("maps all A-U and 1-11 coordinates exactly once", () => {
    expect(FIXTURE_HEXES).toHaveLength(21 * 11);
    expect(new Set(FIXTURE_HEXES.map((hex) => hex.coordinate)).size).toBe(231);
  });

  it.each(["A1", "K6", "U11"] as const)(
    "round-trips coordinate %s through its calibrated center",
    (coordinate) => {
      expect(pointToCoordinate(coordinateToPoint(coordinate))).toBe(coordinate);
    },
  );

  it("returns no coordinate outside every hit target", () => {
    expect(pointToCoordinate({ x: -HEX_RADIUS, y: -HEX_RADIUS })).toBeNull();
  });

  it("rejects the circular gap outside an edge hex polygon", () => {
    const center = coordinateToPoint("A1");
    expect(
      pointToCoordinate({
        x: center.x + HEX_RADIUS * 0.8,
        y: center.y - HEX_RADIUS * 0.6,
      }),
    ).toBeNull();
  });

  it.each([
    ["A1", true],
    ["A12", false],
    ["V1", false],
    ["not-a-coordinate", false],
  ] as const)("validates fixture coordinate %s", (coordinate, expected) => {
    expect(isFixtureCoordinate(coordinate)).toBe(expected);
  });

  it("keeps edge coordinates inside the SVG view box", () => {
    for (const coordinate of ["A1", "U11"] as const) {
      const point = coordinateToPoint(coordinate);
      expect(point.x - HEX_RADIUS).toBeGreaterThanOrEqual(0);
      expect(point.y - HEX_RADIUS).toBeGreaterThanOrEqual(0);
      expect(point.x + HEX_RADIUS).toBeLessThanOrEqual(BOARD_VIEW_BOX.width);
      expect(point.y + HEX_RADIUS).toBeLessThanOrEqual(BOARD_VIEW_BOX.height);
    }
  });

  it("builds six accessible polygon vertices", () => {
    expect(hexPolygonPoints(coordinateToPoint("K6")).split(" ")).toHaveLength(
      6,
    );
  });
});
