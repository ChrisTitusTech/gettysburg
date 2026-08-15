import type { HexCoordinate, Side } from "@gettysburg/game";

export interface FixtureUnit {
  readonly id: string;
  readonly label: string;
  readonly location: HexCoordinate;
  readonly side: Side;
}
