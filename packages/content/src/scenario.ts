import type { HexCoordinate, Side } from "@gettysburg/game";

import { FIXTURE_HEXES } from "./board.js";
import { BOARD_TERRAIN } from "./terrain.js";
import type { ScenarioHex, ScenarioUnit, UnitKind } from "./types.js";

export const SCENARIO_CONTENT_REVISION = "gettysburg-painted-board-v2";

type UnitTuple = readonly [
  id: string,
  label: string,
  organization: string,
  kind: UnitKind,
  combat: number | null,
  movement: number,
  turn: number | null,
  hex: HexCoordinate,
];

function units(
  side: Side,
  source: ScenarioUnit["source"],
  rows: readonly UnitTuple[],
) {
  return rows.map(
    ([id, label, organization, kind, combat, movement, turn, hex]) =>
      ({
        combat,
        entry_hexes:
          turn === null
            ? []
            : [hex === "U7" ? "W7" : hex === "U10" ? "W10" : hex],
        entry_turn: turn,
        id,
        kind,
        label,
        movement,
        organization,
        reduced_combat:
          combat === null || combat === 1 ? null : Math.ceil(combat / 2),
        setup_hex: turn === null ? hex : null,
        side,
        source,
        source_status: "owner-approved-derived",
      }) satisfies ScenarioUnit,
  );
}

const UNION_ROWS = [
  ["u-reynolds", "Reynolds", "I Corps", "general", null, 10, null, "D3"],
  ["u-wadsworth", "Wadsworth", "I Corps", "infantry", 3, 5, null, "D3"],
  ["u-buford", "Buford", "1 Cavalry Division", "general", null, 10, null, "O5"],
  ["u-gamble", "Gamble", "1 Cavalry Division", "cavalry", 1, 7, null, "O5"],
  ["u-devin", "Devin", "1 Cavalry Division", "cavalry", 1, 7, null, "Q7"],
  ["u-howard", "Howard", "XI Corps", "general", null, 10, 2, "A8"],
  ["u-schurz", "Schurz", "XI Corps", "infantry", 2, 5, 2, "A8"],
  ["u-osborne", "Osborne", "XI Corps", "artillery", 1, 5, 2, "A8"],
  ["u-barlow", "Barlow", "XI Corps", "infantry", 2, 5, 2, "A1"],
  ["u-robinson", "Robinson", "I Corps", "infantry", 2, 5, 2, "A1"],
  ["u-doubleday", "Doubleday", "I Corps", "infantry", 3, 5, 2, "A1"],
  ["u-wainwright", "Wainwright", "I Corps", "artillery", 1, 5, 2, "A1"],
  ["u-steinwehr", "Steinwehr", "XI Corps", "infantry", 2, 5, 3, "A8"],
  ["u-hancock", "Hancock", "II Corps", "general", null, 10, 5, "A8"],
  ["u-slocum", "Slocum", "XII Corps", "general", null, 10, 6, "I11"],
  ["u-williams", "Williams", "XII Corps", "infantry", 3, 5, 6, "I11"],
  ["u-geary", "Geary", "XII Corps", "infantry", 3, 5, 6, "I11"],
  ["u-muhlenberg", "Muhlenberg", "XII Corps", "artillery", 1, 5, 6, "I11"],
  ["u-sickles", "Sickles", "III Corps", "general", null, 10, 7, "A1"],
  ["u-birney", "Birney", "III Corps", "infantry", 4, 5, 7, "A1"],
  ["u-sykes", "Sykes", "V Corps", "general", null, 10, 8, "I11"],
  ["u-barnes", "Barnes", "V Corps", "infantry", 2, 5, 8, "I11"],
  ["u-ayres", "Ayres", "V Corps", "infantry", 3, 5, 8, "I11"],
  ["u-martin", "Martin", "V Corps", "artillery", 1, 5, 8, "I11"],
  ["u-humphreys", "Humphreys", "III Corps", "infantry", 4, 5, 8, "A1"],
  ["u-randolph", "Randolph", "III Corps", "artillery", 1, 5, 8, "A1"],
  ["u-meade", "Meade", "Army of the Potomac", "general", null, 10, 8, "A8"],
  ["u-caldwell", "Caldwell", "II Corps", "infantry", 3, 5, 8, "A8"],
  ["u-gibbon", "Gibbon", "II Corps", "infantry", 3, 5, 8, "A8"],
  ["u-hays", "Hays", "II Corps", "infantry", 3, 5, 8, "A8"],
  ["u-hazard", "Hazard", "II Corps", "artillery", 1, 5, 8, "A8"],
  ["u-ransom", "Ransom", "Artillery Reserve", "artillery", 1, 5, 8, "A8"],
  ["u-fitzhugh", "Fitzhugh", "Artillery Reserve", "artillery", 1, 5, 8, "A8"],
  ["u-robertson", "Robertson", "Cavalry", "artillery", 2, 7, 9, "A8"],
  ["u-tyler", "Tyler", "Artillery Reserve", "general", null, 10, 11, "I11"],
  [
    "u-mcgilvery",
    "McGilvery",
    "Artillery Reserve",
    "artillery",
    1,
    5,
    11,
    "I11",
  ],
  ["u-taft", "Taft", "Artillery Reserve", "artillery", 1, 5, 11, "I11"],
  [
    "u-huntington",
    "Huntington",
    "Artillery Reserve",
    "artillery",
    1,
    5,
    11,
    "I11",
  ],
  ["u-crawford", "Crawford", "V Corps", "infantry", 2, 5, 11, "I11"],
  [
    "u-pleasanton",
    "Pleasanton",
    "Cavalry Corps",
    "general",
    null,
    10,
    12,
    "I11",
  ],
  ["u-gregg", "Gregg", "2 Cavalry Division", "general", null, 10, 12, "I11"],
  ["u-mcintosh", "McIntosh", "2 Cavalry Division", "cavalry", 1, 7, 12, "I11"],
  [
    "u-gregg-brigade",
    "Gregg Brigade",
    "2 Cavalry Division",
    "cavalry",
    1,
    7,
    12,
    "I11",
  ],
  ["u-tidball", "Tidball", "2 Cavalry Division", "artillery", 1, 7, 12, "I11"],
  ["u-sedgwick", "Sedgwick", "VI Corps", "general", null, 10, 13, "I11"],
  [
    "u-kilpatrick",
    "Kilpatrick",
    "3 Cavalry Division",
    "general",
    null,
    10,
    13,
    "I11",
  ],
  ["u-wright", "Wright", "VI Corps", "infantry", 4, 5, 13, "I11"],
  [
    "u-farnsworth",
    "Farnsworth",
    "3 Cavalry Division",
    "cavalry",
    1,
    7,
    13,
    "I11",
  ],
  ["u-custer", "Custer", "3 Cavalry Division", "cavalry", 2, 7, 13, "I11"],
  ["u-howe", "Howe", "VI Corps", "infantry", 3, 5, 14, "I11"],
  ["u-newton", "Newton", "VI Corps", "infantry", 3, 5, 14, "I11"],
  ["u-tompkins", "Tompkins", "VI Corps", "artillery", 2, 5, 14, "I11"],
  ["u-huey", "Huey", "2 Cavalry Division", "cavalry", 1, 7, 16, "I11"],
  ["u-merritt", "Merritt", "1 Cavalry Division", "cavalry", 1, 7, 20, "A8"],
] as const satisfies readonly UnitTuple[];

const CONFEDERATE_ROWS = [
  ["c-heth", "Heth", "III Corps", "infantry", 5, 5, 2, "S1"],
  ["c-pegram", "Pegram", "III Corps", "artillery", 2, 5, 2, "S1"],
  ["c-a-p-hill", "A. P. Hill", "III Corps", "general", null, 10, 3, "S1"],
  ["c-pender", "Pender", "III Corps", "infantry", 4, 5, 3, "S1"],
  ["c-mcintosh", "McIntosh", "III Corps", "artillery", 2, 5, 3, "S1"],
  ["c-ewell", "Ewell", "II Corps", "general", null, 10, 4, "U7"],
  ["c-rodes", "Rodes", "II Corps", "infantry", 6, 5, 4, "U7"],
  [
    "c-r-e-lee",
    "R. E. Lee",
    "Army of Northern Virginia",
    "general",
    null,
    10,
    5,
    "S1",
  ],
  ["c-longstreet", "Longstreet", "I Corps", "general", null, 10, 5, "S1"],
  ["c-anderson", "Anderson", "III Corps", "infantry", 5, 5, 5, "S1"],
  ["c-early", "Early", "II Corps", "infantry", 5, 5, 5, "U10"],
  ["c-johnson", "Johnson", "II Corps", "infantry", 4, 5, 6, "S1"],
  ["c-nelson", "Nelson", "II Corps", "artillery", 1, 5, 6, "S1"],
  ["c-dance", "Dance", "II Corps", "artillery", 2, 5, 6, "S1"],
  ["c-jenkins", "Jenkins", "Cavalry", "cavalry", 1, 7, 6, "U10"],
  ["c-hood", "Hood", "I Corps", "infantry", 6, 5, 8, "S1"],
  ["c-mclaws", "McLaws", "I Corps", "infantry", 5, 5, 8, "S1"],
  ["c-alexander", "Alexander", "I Corps", "artillery", 2, 5, 9, "S1"],
  ["c-eshleman", "Eshleman", "I Corps", "artillery", 2, 5, 9, "S1"],
  ["c-stuart", "Stuart", "Cavalry Division", "general", null, 10, 13, "U7"],
  ["c-hampton", "Hampton", "Cavalry Division", "cavalry", 1, 7, 13, "U7"],
  ["c-beckham", "Beckham", "Cavalry Division", "artillery", 1, 7, 13, "U7"],
  ["c-pickett", "Pickett", "I Corps", "infantry", 4, 5, 13, "S1"],
  ["c-f-lee", "F. Lee", "Cavalry Division", "cavalry", 1, 7, 14, "U7"],
  ["c-chambliss", "Chambliss", "Cavalry Division", "cavalry", 1, 7, 14, "U7"],
  ["c-imboden", "Imboden", "Cavalry", "cavalry", 1, 7, 19, "S1"],
  ["c-jones", "Jones", "Cavalry", "cavalry", 1, 7, 20, "S1"],
  ["c-robertson", "Robertson", "Cavalry", "cavalry", 1, 7, 20, "S1"],
] as const satisfies readonly UnitTuple[];

export const SCENARIO_UNITS: readonly ScenarioUnit[] = [
  ...units("union", "OOP-Union.pdf", UNION_ROWS),
  ...units("confederate", "OOP-Confederate.pdf", CONFEDERATE_ROWS),
];

const OBJECTIVE_VALUES = new Map<HexCoordinate, number>([
  ["F6", 5],
  ["I11", 3],
  ["K6", 1],
  ["K7", 1],
  ["L6", 1],
  ["L7", 1],
  ["M7", 1],
  ["R10", 3],
]);

// Owner-approved painted board. Culp's Hill moves to R10; point values remain.
export const SCENARIO_HEXES: readonly ScenarioHex[] = FIXTURE_HEXES.map(
  ({ coordinate }) => ({
    coordinate,
    objective_value: OBJECTIVE_VALUES.get(coordinate) ?? null,
    terrain: BOARD_TERRAIN[coordinate].kind,
  }),
);
