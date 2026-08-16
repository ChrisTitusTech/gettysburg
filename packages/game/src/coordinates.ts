export const BOARD_COLUMNS = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
] as const;

export type BoardColumn = (typeof BOARD_COLUMNS)[number];
export type BoardRow = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
export type HexCoordinate = `${BoardColumn}${BoardRow}`;

const COORDINATE_PATTERN = /^([A-U])(1[01]|[1-9])$/;

export function isHexCoordinate(value: string): value is HexCoordinate {
  return COORDINATE_PATTERN.test(value);
}

function coordinateParts(coordinate: HexCoordinate) {
  return {
    column: BOARD_COLUMNS.indexOf(coordinate.charAt(0) as BoardColumn),
    row: Number(coordinate.slice(1)) - 1,
  };
}

function coordinateFromParts(
  column: number,
  row: number,
): HexCoordinate | null {
  const letter = BOARD_COLUMNS[column];
  if (letter === undefined || row < 0 || row >= 11) return null;
  return `${letter}${row + 1}` as HexCoordinate;
}

function cubeCoordinate(coordinate: HexCoordinate) {
  const { column, row } = coordinateParts(coordinate);
  const x = column;
  const z = row - (column - (column & 1)) / 2;
  return { x, y: -x - z, z };
}

export function hexDistance(
  origin: HexCoordinate,
  destination: HexCoordinate,
): number {
  const start = cubeCoordinate(origin);
  const end = cubeCoordinate(destination);
  return Math.max(
    Math.abs(start.x - end.x),
    Math.abs(start.y - end.y),
    Math.abs(start.z - end.z),
  );
}

export function adjacentHexes(coordinate: HexCoordinate): HexCoordinate[] {
  const { column, row } = coordinateParts(coordinate);
  const offsets =
    column % 2 === 0
      ? [
          [0, -1],
          [1, -1],
          [1, 0],
          [0, 1],
          [-1, 0],
          [-1, -1],
        ]
      : [
          [0, -1],
          [1, 0],
          [1, 1],
          [0, 1],
          [-1, 1],
          [-1, 0],
        ];
  return offsets.flatMap(([columnOffset, rowOffset]) => {
    const neighbor = coordinateFromParts(
      column + (columnOffset ?? 0),
      row + (rowOffset ?? 0),
    );
    return neighbor === null ? [] : [neighbor];
  });
}

export function shortestHexPath(
  origin: HexCoordinate,
  destination: HexCoordinate,
): HexCoordinate[] {
  if (origin === destination) return [origin];
  const frontier: HexCoordinate[] = [origin];
  const previous = new Map<HexCoordinate, HexCoordinate | null>([
    [origin, null],
  ]);

  for (let index = 0; index < frontier.length; index += 1) {
    const current = frontier[index];
    if (current === undefined) break;
    for (const neighbor of adjacentHexes(current)) {
      if (previous.has(neighbor)) continue;
      previous.set(neighbor, current);
      if (neighbor === destination) {
        const path = [destination];
        let step: HexCoordinate | null = current;
        while (step !== null) {
          path.push(step);
          step = previous.get(step) ?? null;
        }
        return path.reverse();
      }
      frontier.push(neighbor);
    }
  }
  return [origin];
}
