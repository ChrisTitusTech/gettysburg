import { BOARD_TERRAIN } from "@gettysburg/content";
import type { HexCoordinate } from "@gettysburg/game";

import boardArtwork from "./assets/gettysburg-board-deluxe.png";

export function presentationTerrain(coordinate: HexCoordinate) {
  const kind = BOARD_TERRAIN[coordinate].kind;
  return kind === "rough_hill" ? "rough-hill" : kind;
}

// The approved artwork contains 23 painted columns, not the old 21-column grid.
export const BOARD_ARTWORK_BOUNDS = {
  height: 892.91,
  width: 1548,
  x: 14,
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
