import type { HexCoordinate } from "@gettysburg/game";

import boardArtwork from "./assets/gettysburg-board-deluxe.png";

type PresentationTerrain = "clear" | "hill" | "rough-hill" | "town" | "woods";

const coordinates = (...values: HexCoordinate[]) => values;

const WOODS = new Set<HexCoordinate>(
  coordinates(
    "A1",
    "B1",
    "C1",
    "A4",
    "B4",
    "C4",
    "A5",
    "B5",
    "C5",
    "D5",
    "A6",
    "B6",
    "C6",
    "D6",
    "A7",
    "B7",
    "C7",
    "A8",
    "B8",
    "B9",
    "C9",
    "C10",
    "D3",
    "E3",
    "F3",
    "E4",
    "F4",
    "E5",
    "F5",
    "G5",
    "H1",
    "I1",
    "I2",
    "J2",
    "J3",
    "K3",
    "K4",
    "L3",
    "L4",
    "M2",
    "N2",
    "O2",
    "P2",
    "Q1",
    "Q2",
    "P4",
    "R4",
    "R5",
    "S5",
    "T5",
    "U5",
    "G7",
    "H7",
    "I7",
    "H8",
    "I8",
    "J8",
    "I9",
    "J9",
    "K9",
    "K10",
    "L9",
    "L10",
    "M9",
    "M10",
    "N9",
    "N10",
    "O9",
    "P9",
    "Q9",
    "R8",
    "S8",
    "R9",
    "S9",
    "T10",
    "U10",
    "T11",
    "U11",
  ),
);

// Presentation-only interpretation used for accessible hex descriptions and
// overlay classes. It remains separate from authoritative terrain rules.
const HILLS = new Set<HexCoordinate>(
  coordinates(
    "B2",
    "C3",
    "D3",
    "F3",
    "G4",
    "H4",
    "H5",
    "K6",
    "K7",
    "L6",
    "L7",
    "M7",
    "R1",
    "R2",
    "S2",
    "S5",
    "T5",
    "U5",
    "S8",
    "T8",
  ),
);

const ROUGH_HILLS = new Set<HexCoordinate>(
  coordinates("E6", "F6", "F7", "M9", "T5"),
);

const TOWN = new Set<HexCoordinate>(coordinates("O7", "P7"));

export function presentationTerrain(
  coordinate: HexCoordinate,
): PresentationTerrain {
  if (TOWN.has(coordinate)) return "town";
  if (ROUGH_HILLS.has(coordinate)) return "rough-hill";
  if (WOODS.has(coordinate)) return "woods";
  if (HILLS.has(coordinate)) return "hill";
  return "clear";
}

// The approved 1658 x 949 artwork uses the same 21-column staggered grid as the
// interactive board. These bounds calibrate its hex centers to the authoritative
// SVG coordinates while preserving the full painted board edge.
export const BOARD_ARTWORK_BOUNDS = {
  height: 892.91,
  width: 1403.38,
  x: 22.54,
  y: 11.31,
} as const;

export function BoardTerrain() {
  return (
    <g
      className="deluxe-board-art"
      data-art-finish="deluxe-raster"
      data-source-height="949"
      data-source-width="1658"
    >
      <image
        className="board-artwork-image"
        height={BOARD_ARTWORK_BOUNDS.height}
        href={boardArtwork}
        preserveAspectRatio="none"
        width={BOARD_ARTWORK_BOUNDS.width}
        x={BOARD_ARTWORK_BOUNDS.x}
        y={BOARD_ARTWORK_BOUNDS.y}
      />
    </g>
  );
}
