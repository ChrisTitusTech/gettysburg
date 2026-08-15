import type { HexCoordinate, Side } from "@gettysburg/game";

export interface FixtureUnit {
  readonly id: string;
  readonly label: string;
  readonly location: HexCoordinate;
  readonly side: Side;
}

export type UnitKind = "artillery" | "cavalry" | "general" | "infantry";

export interface ScenarioUnit {
  readonly combat: number | null;
  readonly entry_hexes: readonly HexCoordinate[];
  readonly entry_turn: number | null;
  readonly id: string;
  readonly kind: UnitKind;
  readonly label: string;
  readonly movement: number;
  readonly organization: string;
  readonly reduced_combat: null;
  readonly setup_hex: HexCoordinate | null;
  readonly side: Side;
  readonly source: "OOP-Confederate.pdf" | "OOP-Union.pdf";
  readonly source_status: "counter-back-unavailable";
}

export type TerrainKind = "clear" | "hill" | "rough_hill" | "town" | "woods";

export interface ScenarioHex {
  readonly coordinate: HexCoordinate;
  readonly objective_value: number | null;
  readonly terrain: TerrainKind | "unverified";
}
