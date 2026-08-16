import {
  BOARD_COLUMNS,
  isHexCoordinate,
  type BoardColumn,
  type BoardRow,
  type HexCoordinate,
} from "@gettysburg/game";

export const HEX_RADIUS = 44;
export const HEX_HORIZONTAL_SPACING = HEX_RADIUS * 1.5;
export const HEX_VERTICAL_SPACING = Math.sqrt(3) * HEX_RADIUS;
export const BOARD_PADDING = 64;

export interface BoardPoint {
  readonly x: number;
  readonly y: number;
}

export interface FixtureHex {
  readonly coordinate: HexCoordinate;
  readonly point: BoardPoint;
}

function rowNumber(row: BoardRow): number {
  return row - 1;
}

export function coordinateToPoint(coordinate: HexCoordinate): BoardPoint {
  const column = coordinate.charAt(0) as BoardColumn;
  const row = Number(coordinate.slice(1)) as BoardRow;
  const columnIndex = BOARD_COLUMNS.indexOf(column);

  return {
    x: BOARD_PADDING + columnIndex * HEX_HORIZONTAL_SPACING,
    y:
      BOARD_PADDING +
      rowNumber(row) * HEX_VERTICAL_SPACING +
      (columnIndex % 2 === 1 ? HEX_VERTICAL_SPACING / 2 : 0),
  };
}

export const FIXTURE_HEXES: readonly FixtureHex[] = BOARD_COLUMNS.flatMap(
  (column) =>
    Array.from({ length: 11 }, (_, index) => {
      const coordinate = `${column}${index + 1}` as HexCoordinate;
      return { coordinate, point: coordinateToPoint(coordinate) };
    }),
);

export const FIXTURE_HEX_BY_COORDINATE = new Map(
  FIXTURE_HEXES.map((hex) => [hex.coordinate, hex]),
);

export const BOARD_VIEW_BOX = {
  height: BOARD_PADDING * 2 + HEX_VERTICAL_SPACING * 10.5,
  width: BOARD_PADDING * 2 + HEX_HORIZONTAL_SPACING * 20,
} as const;

export function hexPolygonPoints(point: BoardPoint): string {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 180) * (60 * index);
    const x = point.x + HEX_RADIUS * Math.cos(angle);
    const y = point.y + HEX_RADIUS * Math.sin(angle);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

export function pointToCoordinate(point: BoardPoint): HexCoordinate | null {
  let closest: FixtureHex | undefined;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const hex of FIXTURE_HEXES) {
    const distance = Math.hypot(point.x - hex.point.x, point.y - hex.point.y);
    if (distance < closestDistance) {
      closest = hex;
      closestDistance = distance;
    }
  }

  if (closest === undefined || closestDistance > HEX_RADIUS) return null;

  const deltaX = Math.abs(point.x - closest.point.x);
  const deltaY = Math.abs(point.y - closest.point.y);
  const verticalRadius = (Math.sqrt(3) * HEX_RADIUS) / 2;
  const insideHex =
    deltaX <= HEX_RADIUS &&
    deltaY <= verticalRadius &&
    Math.sqrt(3) * deltaX + deltaY <= Math.sqrt(3) * HEX_RADIUS;
  return insideHex ? closest.coordinate : null;
}

export function isFixtureCoordinate(value: string): value is HexCoordinate {
  return isHexCoordinate(value) && FIXTURE_HEX_BY_COORDINATE.has(value);
}
