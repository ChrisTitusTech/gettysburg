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
