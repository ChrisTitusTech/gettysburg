import { coordinateToPoint } from "@gettysburg/content";
import type { HexCoordinate } from "@gettysburg/game";

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

const HILLS = new Set<HexCoordinate>(
  coordinates(
    "B2",
    "C3",
    "D3",
    "F3",
    "G4",
    "H4",
    "H5",
    "I5",
    "J5",
    "J6",
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

function pathThrough(points: readonly HexCoordinate[]): string {
  const mapped = points.map(coordinateToPoint);
  const first = mapped[0];
  const last = mapped.at(-1);
  if (first === undefined || last === undefined) return "";
  if (mapped.length === 1) return `M ${first.x} ${first.y}`;

  const segments = [`M ${first.x} ${first.y}`];
  for (let index = 1; index < mapped.length - 1; index += 1) {
    const point = mapped[index];
    const next = mapped[index + 1];
    if (point === undefined || next === undefined) continue;
    segments.push(
      `Q ${point.x} ${point.y} ${(point.x + next.x) / 2} ${(point.y + next.y) / 2}`,
    );
  }
  segments.push(`L ${last.x} ${last.y}`);
  return segments.join(" ");
}

const STREAMS = [
  coordinates(
    "F1",
    "G2",
    "H1",
    "I2",
    "J1",
    "K2",
    "L2",
    "M3",
    "N3",
    "N4",
    "O4",
    "P3",
    "Q3",
    "R3",
    "S3",
  ),
  coordinates(
    "U8",
    "T8",
    "S8",
    "S9",
    "R9",
    "Q9",
    "P10",
    "O10",
    "N9",
    "M10",
    "L10",
    "K10",
    "J11",
    "I11",
  ),
  coordinates("A11", "B11", "C11", "D11", "E11"),
] as const;

const ROADS = [
  coordinates("A2", "C3", "F4", "H5", "K6", "O7"),
  coordinates("C7", "F7", "J8", "O7"),
  coordinates("E1", "G2", "J4", "M6", "O7"),
  coordinates("S1", "R3", "Q5", "O7"),
  coordinates("U7", "R7", "O7"),
  coordinates("U10", "R9", "O7"),
  coordinates("O7", "O10", "O11"),
  coordinates("O7", "L8", "J10", "H11"),
] as const;

const RAILROAD = coordinates("S1", "R3", "Q5", "P6", "O7", "P9", "R11");

const LANDMARKS: readonly {
  coordinate: HexCoordinate;
  label: string;
  x?: number;
  y?: number;
}[] = [
  { coordinate: "J3", label: "SEMINARY RIDGE", y: -9 },
  { coordinate: "H5", label: "PEACH ORCHARD", y: -8 },
  { coordinate: "G5", label: "WHEAT FIELD", y: 10 },
  { coordinate: "F6", label: "LITTLE ROUND TOP", y: 10 },
  { coordinate: "J6", label: "CEMETERY RIDGE", y: -8 },
  { coordinate: "L7", label: "CEMETERY HILL", y: 11 },
  { coordinate: "O7", label: "GETTYSBURG", y: 10 },
  { coordinate: "P4", label: "McPHERSON'S WOODS", y: 10 },
  { coordinate: "T5", label: "OAK RIDGE", y: 10 },
  { coordinate: "S8", label: "BARLOW'S KNOLL", y: 10 },
  { coordinate: "M9", label: "CULP'S HILL", y: 10 },
];

export function BoardTerrain() {
  return (
    <>
      <defs>
        <pattern
          height="34"
          id="terrain-clear-pattern"
          patternUnits="userSpaceOnUse"
          width="34"
        >
          <rect fill="#c9bd79" height="34" width="34" />
          <circle cx="7" cy="9" fill="#786f3d" opacity="0.14" r="1" />
          <circle cx="24" cy="25" fill="#f4e8a5" opacity="0.2" r="1.4" />
          <path d="M2 29 8 27M20 7l5-2" stroke="#827944" opacity="0.1" />
        </pattern>
        <pattern
          height="40"
          id="terrain-woods-pattern"
          patternUnits="userSpaceOnUse"
          width="40"
        >
          <rect fill="#82905b" height="40" width="40" />
          <circle cx="8" cy="12" fill="#304b35" r="5" />
          <circle cx="15" cy="8" fill="#46613e" r="6" />
          <circle cx="28" cy="17" fill="#38533a" r="7" />
          <circle cx="18" cy="28" fill="#536b41" r="7" />
          <circle cx="34" cy="34" fill="#2e4934" r="5" />
        </pattern>
        <pattern
          height="52"
          id="terrain-hill-pattern"
          patternUnits="userSpaceOnUse"
          width="52"
        >
          <rect fill="#bc9661" height="52" width="52" />
          <path
            d="M-5 40C8 26 22 28 31 18S50 8 60 14M-8 49C10 37 25 42 38 29S55 19 63 25"
            fill="none"
            opacity="0.32"
            stroke="#7e5639"
            strokeWidth="2"
          />
        </pattern>
        <pattern
          height="44"
          id="terrain-rough-pattern"
          patternUnits="userSpaceOnUse"
          width="44"
        >
          <rect fill="#986f5a" height="44" width="44" />
          <path
            d="m2 35 9-17 7 8 8-18 13 27M-4 41h53"
            fill="none"
            opacity="0.48"
            stroke="#5b4037"
            strokeWidth="2.2"
          />
        </pattern>
        <pattern
          height="34"
          id="terrain-town-pattern"
          patternUnits="userSpaceOnUse"
          width="34"
        >
          <rect fill="#b88961" height="34" width="34" />
          <rect fill="#6f5040" height="8" width="11" x="3" y="4" />
          <rect fill="#e2c597" height="9" width="8" x="20" y="2" />
          <rect fill="#785144" height="9" width="9" x="7" y="20" />
          <rect fill="#d8b47f" height="8" width="11" x="21" y="18" />
        </pattern>
      </defs>

      <g className="board-feature-layer board-roads">
        {ROADS.map((road, index) => (
          <g key={index}>
            <path className="road-edge" d={pathThrough(road)} />
            <path className="road-center" d={pathThrough(road)} />
          </g>
        ))}
        <path className="railroad-edge" d={pathThrough(RAILROAD)} />
        <path className="railroad-ties" d={pathThrough(RAILROAD)} />
      </g>

      <g className="board-feature-layer board-streams">
        {STREAMS.map((stream, index) => (
          <g key={index}>
            <path className="stream-bank" d={pathThrough(stream)} />
            <path className="stream-water" d={pathThrough(stream)} />
          </g>
        ))}
      </g>

      <g className="board-feature-layer board-landmarks">
        {LANDMARKS.map((landmark) => {
          const point = coordinateToPoint(landmark.coordinate);
          return (
            <text
              key={landmark.label}
              className="terrain-label"
              x={point.x + (landmark.x ?? 0)}
              y={point.y + (landmark.y ?? 0)}
            >
              {landmark.label}
            </text>
          );
        })}
      </g>
    </>
  );
}
