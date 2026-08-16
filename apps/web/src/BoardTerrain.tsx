import {
  BOARD_VIEW_BOX,
  FIXTURE_HEXES,
  HEX_RADIUS,
  coordinateToPoint,
  hexPolygonPoints,
  type BoardPoint,
} from "@gettysburg/content";
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

// Presentation-only interpretation of gameboard.jpg. The owner explicitly confirmed
// that I5, J5, and J6 must remain clear rather than receiving hill artwork.
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

const CULTIVATED_PATCHES = coordinates(
  "G5",
  "H4",
  "H5",
  "H7",
  "I4",
  "I8",
  "M5",
  "N5",
  "P5",
  "S4",
);

export function presentationTerrain(
  coordinate: HexCoordinate,
): PresentationTerrain {
  if (TOWN.has(coordinate)) return "town";
  if (ROUGH_HILLS.has(coordinate)) return "rough-hill";
  if (WOODS.has(coordinate)) return "woods";
  if (HILLS.has(coordinate)) return "hill";
  return "clear";
}

function point(
  coordinate: HexCoordinate,
  offsetX = 0,
  offsetY = 0,
): BoardPoint {
  const center = coordinateToPoint(coordinate);
  return { x: center.x + offsetX, y: center.y + offsetY };
}

function pathThrough(points: readonly BoardPoint[]): string {
  const first = points[0];
  const last = points.at(-1);
  if (first === undefined || last === undefined) return "";
  if (points.length === 1) return `M ${first.x} ${first.y}`;

  const segments = [`M ${first.x} ${first.y}`];
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    if (current === undefined || next === undefined) continue;
    segments.push(
      `Q ${current.x} ${current.y} ${(current.x + next.x) / 2} ${(current.y + next.y) / 2}`,
    );
  }
  segments.push(`L ${last.x} ${last.y}`);
  return segments.join(" ");
}

function pathAlongEdges(points: readonly BoardPoint[]): string {
  return points
    .map(
      (routePoint, index) =>
        `${index === 0 ? "M" : "L"} ${routePoint.x} ${routePoint.y}`,
    )
    .join(" ");
}

function vertexKey(vertex: BoardPoint): string {
  return `${vertex.x.toFixed(4)},${vertex.y.toFixed(4)}`;
}

function edgeKey(first: string, second: string): string {
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}

function hexVertices(center: BoardPoint): readonly BoardPoint[] {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 180) * (60 * index);
    return {
      x: Number((center.x + HEX_RADIUS * Math.cos(angle)).toFixed(4)),
      y: Number((center.y + HEX_RADIUS * Math.sin(angle)).toFixed(4)),
    };
  });
}

interface EdgeGraph {
  readonly boundaryVertices: ReadonlySet<string>;
  readonly edges: ReadonlySet<string>;
  readonly neighbors: ReadonlyMap<string, ReadonlySet<string>>;
  readonly vertices: ReadonlyMap<string, BoardPoint>;
}

function buildEdgeGraph(): EdgeGraph {
  const edgeCounts = new Map<string, number>();
  const edgeVertices = new Map<string, readonly [string, string]>();
  const neighbors = new Map<string, Set<string>>();
  const vertices = new Map<string, BoardPoint>();

  for (const hex of FIXTURE_HEXES) {
    const polygon = hexVertices(hex.point);
    for (let index = 0; index < polygon.length; index += 1) {
      const first = polygon[index];
      const second = polygon[(index + 1) % polygon.length];
      if (first === undefined || second === undefined) continue;
      const firstKey = vertexKey(first);
      const secondKey = vertexKey(second);
      const segmentKey = edgeKey(firstKey, secondKey);
      vertices.set(firstKey, first);
      vertices.set(secondKey, second);
      edgeCounts.set(segmentKey, (edgeCounts.get(segmentKey) ?? 0) + 1);
      edgeVertices.set(segmentKey, [firstKey, secondKey]);
      const firstNeighbors = neighbors.get(firstKey) ?? new Set<string>();
      const secondNeighbors = neighbors.get(secondKey) ?? new Set<string>();
      firstNeighbors.add(secondKey);
      secondNeighbors.add(firstKey);
      neighbors.set(firstKey, firstNeighbors);
      neighbors.set(secondKey, secondNeighbors);
    }
  }

  const boundaryVertices = new Set<string>();
  for (const [segmentKey, count] of edgeCounts) {
    if (count !== 1) continue;
    const endpoints = edgeVertices.get(segmentKey);
    if (endpoints === undefined) continue;
    boundaryVertices.add(endpoints[0]);
    boundaryVertices.add(endpoints[1]);
  }

  return {
    boundaryVertices,
    edges: new Set(edgeCounts.keys()),
    neighbors,
    vertices,
  };
}

const BOARD_EDGE_GRAPH = buildEdgeGraph();

function pointToSegmentDistance(
  candidate: BoardPoint,
  first: BoardPoint,
  second: BoardPoint,
): number {
  const deltaX = second.x - first.x;
  const deltaY = second.y - first.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  if (lengthSquared === 0) {
    return Math.hypot(candidate.x - first.x, candidate.y - first.y);
  }
  const projection = Math.max(
    0,
    Math.min(
      1,
      ((candidate.x - first.x) * deltaX + (candidate.y - first.y) * deltaY) /
        lengthSquared,
    ),
  );
  return Math.hypot(
    candidate.x - (first.x + projection * deltaX),
    candidate.y - (first.y + projection * deltaY),
  );
}

function distanceToGuide(
  candidate: BoardPoint,
  guide: readonly BoardPoint[],
): number {
  let closest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < guide.length - 1; index += 1) {
    const first = guide[index];
    const second = guide[index + 1];
    if (first === undefined || second === undefined) continue;
    closest = Math.min(
      closest,
      pointToSegmentDistance(candidate, first, second),
    );
  }
  return closest;
}

function nearestBoundaryVertex(target: BoardPoint): string {
  let nearest = "";
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const key of BOARD_EDGE_GRAPH.boundaryVertices) {
    const candidate = BOARD_EDGE_GRAPH.vertices.get(key);
    if (candidate === undefined) continue;
    const distance = Math.hypot(candidate.x - target.x, candidate.y - target.y);
    if (distance < nearestDistance) {
      nearest = key;
      nearestDistance = distance;
    }
  }
  return nearest;
}

export function isBoardHexEdgeSegment(
  first: BoardPoint,
  second: BoardPoint,
): boolean {
  return BOARD_EDGE_GRAPH.edges.has(
    edgeKey(vertexKey(first), vertexKey(second)),
  );
}

export function isBoardBoundaryPoint(candidate: BoardPoint): boolean {
  return BOARD_EDGE_GRAPH.boundaryVertices.has(vertexKey(candidate));
}

export function routeAlongHexEdges(
  guide: readonly BoardPoint[],
): readonly BoardPoint[] {
  const firstGuidePoint = guide[0];
  const lastGuidePoint = guide.at(-1);
  if (firstGuidePoint === undefined || lastGuidePoint === undefined) return [];

  const start = nearestBoundaryVertex(firstGuidePoint);
  const finish = nearestBoundaryVertex(lastGuidePoint);
  const distances = new Map<string, number>([[start, 0]]);
  const previous = new Map<string, string>();
  const unvisited = new Set(BOARD_EDGE_GRAPH.vertices.keys());

  while (unvisited.size > 0) {
    let current = "";
    let currentDistance = Number.POSITIVE_INFINITY;
    for (const key of unvisited) {
      const distance = distances.get(key) ?? Number.POSITIVE_INFINITY;
      if (distance < currentDistance) {
        current = key;
        currentDistance = distance;
      }
    }
    if (current === "" || current === finish) break;
    unvisited.delete(current);
    const currentPoint = BOARD_EDGE_GRAPH.vertices.get(current);
    if (currentPoint === undefined) continue;

    for (const neighbor of BOARD_EDGE_GRAPH.neighbors.get(current) ?? []) {
      if (!unvisited.has(neighbor)) continue;
      const neighborPoint = BOARD_EDGE_GRAPH.vertices.get(neighbor);
      if (neighborPoint === undefined) continue;
      const midpoint = {
        x: (currentPoint.x + neighborPoint.x) / 2,
        y: (currentPoint.y + neighborPoint.y) / 2,
      };
      const edgeLength = Math.hypot(
        currentPoint.x - neighborPoint.x,
        currentPoint.y - neighborPoint.y,
      );
      const candidateDistance =
        currentDistance + edgeLength + distanceToGuide(midpoint, guide) * 0.9;
      if (
        candidateDistance <
        (distances.get(neighbor) ?? Number.POSITIVE_INFINITY)
      ) {
        distances.set(neighbor, candidateDistance);
        previous.set(neighbor, current);
      }
    }
  }

  if (!distances.has(finish)) return [];
  const routeKeys = [finish];
  while (routeKeys[0] !== start) {
    const predecessor = previous.get(routeKeys[0]!);
    if (predecessor === undefined) return [];
    routeKeys.unshift(predecessor);
  }
  return routeKeys.flatMap((key) => {
    const routePoint = BOARD_EDGE_GRAPH.vertices.get(key);
    return routePoint === undefined ? [] : [routePoint];
  });
}

// These loose guides describe the waterways' overall geography. They are snapped
// onto the actual hex-edge graph below so every rendered segment follows a hex
// side and both ends terminate at the board boundary.
const STREAM_GUIDES: readonly (readonly BoardPoint[])[] = [
  [
    point("F1", 0, -120),
    point("F1"),
    point("G2"),
    point("H1"),
    point("I2"),
    point("J1"),
    point("K2"),
    point("L2"),
    point("M3"),
    point("N3"),
    point("N4"),
    point("O4"),
    point("P3"),
    point("Q3"),
    point("R3"),
    point("S3"),
    point("S3", 180, 24),
  ],
  [
    point("A11", -120, -10),
    point("A11"),
    point("B11"),
    point("C11"),
    point("D11"),
    point("E11"),
    point("F11"),
    point("G11"),
    point("H11"),
    point("I11"),
    point("J11"),
    point("K10"),
    point("L10"),
    point("M10"),
    point("N9"),
    point("O10"),
    point("P10"),
    point("Q9"),
    point("R9"),
    point("S9"),
    point("S8"),
    point("T8"),
    point("U8"),
    point("U8", 130, 8),
  ],
];

export const STREAM_EDGE_ROUTES = STREAM_GUIDES.map(routeAlongHexEdges);

const ROADS: readonly (readonly BoardPoint[])[] = [
  [
    point("A2", -120, -12),
    point("A2"),
    point("C3"),
    point("F4"),
    point("H5"),
    point("K6"),
    point("O7"),
  ],
  [
    point("A7", -120, 10),
    point("A7"),
    point("C7"),
    point("F7"),
    point("J8"),
    point("O7"),
  ],
  [
    point("E1", 0, -120),
    point("E1"),
    point("G2"),
    point("J4"),
    point("M6"),
    point("O7"),
  ],
  [point("S1", 0, -120), point("S1"), point("R3"), point("Q5"), point("O7")],
  [point("U7", 130, -8), point("U7"), point("R7"), point("O7")],
  [point("U10", 130, 18), point("U10"), point("R9"), point("O7")],
  [point("O7"), point("O10"), point("O11"), point("O11", 0, 130)],
  [
    point("O7"),
    point("L8"),
    point("J10"),
    point("H11"),
    point("H11", -18, 130),
  ],
];

const RAILROAD = [
  point("S1", 32, -120),
  point("S1"),
  point("R3"),
  point("Q5"),
  point("P6"),
  point("O7"),
  point("P9"),
  point("R11"),
  point("R11", 30, 130),
] as const;

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

const TREE_OFFSETS = [
  { x: -38, y: -22, scale: 0.52 },
  { x: -17, y: -29, scale: 0.43 },
  { x: 8, y: -24, scale: 0.58 },
  { x: 34, y: -18, scale: 0.46 },
  { x: -29, y: -3, scale: 0.61 },
  { x: -3, y: 0, scale: 0.48 },
  { x: 28, y: 3, scale: 0.55 },
  { x: -40, y: 24, scale: 0.42 },
  { x: -14, y: 29, scale: 0.57 },
  { x: 15, y: 25, scale: 0.45 },
  { x: 39, y: 22, scale: 0.51 },
] as const;

function coordinateSeed(coordinate: HexCoordinate): number {
  return coordinate.charCodeAt(0) * 17 + Number(coordinate.slice(1)) * 29;
}

export function BoardTerrain() {
  const gettysburg = coordinateToPoint("O7");

  return (
    <g className="deluxe-board-art" data-art-finish="deluxe">
      <defs>
        <clipPath id="board-play-field">
          {FIXTURE_HEXES.map((hex) => (
            <polygon
              key={hex.coordinate}
              points={hexPolygonPoints(hex.point)}
            />
          ))}
        </clipPath>
        <pattern
          height="86"
          id="board-paper-pattern"
          patternUnits="userSpaceOnUse"
          width="94"
        >
          <rect fill="#b9ad5b" height="86" width="94" />
          <path
            d="M4 18c13-3 24 3 37-1m14-8c8 2 19 0 30-4M7 61c15 3 27 1 39-2m12-8c10-3 20 0 31 5"
            fill="none"
            opacity="0.2"
            stroke="#625d31"
            strokeLinecap="round"
            strokeWidth="0.8"
          />
          <path
            d="m18 34 4-1m24 34 6-1m18-32 3 1M5 80l5-1"
            opacity="0.28"
            stroke="#f5df88"
            strokeLinecap="round"
            strokeWidth="1.2"
          />
          <circle cx="38" cy="43" fill="#554c28" opacity="0.18" r="0.8" />
          <circle cx="83" cy="76" fill="#fff1aa" opacity="0.24" r="1.1" />
        </pattern>
        <radialGradient id="board-paper-patina" r="72%">
          <stop offset="0" stopColor="#f8dc80" stopOpacity="0.1" />
          <stop offset="0.7" stopColor="#8f833f" stopOpacity="0.04" />
          <stop offset="1" stopColor="#4c3c1e" stopOpacity="0.25" />
        </radialGradient>
        <filter
          colorInterpolationFilters="sRGB"
          height="140%"
          id="terrain-line-wobble"
          width="140%"
          x="-20%"
          y="-20%"
        >
          <feTurbulence
            baseFrequency="0.009 0.034"
            numOctaves="2"
            result="noise"
            seed="11"
            type="fractalNoise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="2.8"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
        <filter
          colorInterpolationFilters="sRGB"
          height="150%"
          id="terrain-wash-wobble"
          width="150%"
          x="-25%"
          y="-25%"
        >
          <feTurbulence
            baseFrequency="0.022"
            numOctaves="3"
            result="washNoise"
            seed="19"
            type="fractalNoise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="washNoise"
            scale="7"
            xChannelSelector="R"
            yChannelSelector="B"
          />
        </filter>
      </defs>

      <g clipPath="url(#board-play-field)">
        <rect
          className="board-paper"
          height={BOARD_VIEW_BOX.height}
          width={BOARD_VIEW_BOX.width}
        />
        <rect
          className="board-paper-patina"
          height={BOARD_VIEW_BOX.height}
          width={BOARD_VIEW_BOX.width}
        />

        <g className="board-feature-layer terrain-elevation-washes">
          {[...HILLS].map((coordinate) => {
            const center = coordinateToPoint(coordinate);
            const seed = coordinateSeed(coordinate);
            return (
              <g
                key={coordinate}
                className="hill-wash"
                transform={`translate(${center.x} ${center.y}) rotate(${(seed % 23) - 11})`}
              >
                <ellipse cx="0" cy="0" rx="55" ry="36" />
                <path d="M-48 7c16-25 35-32 58-24 14 5 27 1 40-9" />
                <path d="M-43 19c20-17 40-21 59-13 12 5 22 2 32-5" />
              </g>
            );
          })}
          {[...ROUGH_HILLS].map((coordinate) => {
            const center = coordinateToPoint(coordinate);
            const seed = coordinateSeed(coordinate);
            return (
              <g
                key={coordinate}
                className="rough-hill-wash"
                transform={`translate(${center.x} ${center.y}) rotate(${(seed % 19) - 9})`}
              >
                <ellipse cx="0" cy="0" rx="57" ry="38" />
                <path d="M-48 18c15-19 31-27 50-20 17 6 31 0 45-13" />
                <path d="m-38 18 10-16 8 8 12-24L6 5l13-11 14 17" />
              </g>
            );
          })}
        </g>

        <g className="board-feature-layer cultivated-fields">
          {CULTIVATED_PATCHES.map((coordinate) => {
            const center = coordinateToPoint(coordinate);
            const seed = coordinateSeed(coordinate);
            return (
              <g
                key={coordinate}
                transform={`translate(${center.x} ${center.y}) rotate(${(seed % 35) - 17})`}
              >
                {Array.from({ length: 5 }, (_, row) => (
                  <path
                    d={`M -30 ${row * 7 - 14} q 14 -3 28 0 t 29 0`}
                    key={row}
                  />
                ))}
              </g>
            );
          })}
        </g>

        <g
          className="board-feature-layer woodland-landscape"
          filter="url(#terrain-wash-wobble)"
        >
          {[...WOODS].map((coordinate) => {
            const center = coordinateToPoint(coordinate);
            const seed = coordinateSeed(coordinate);
            const rotation = (seed % 29) - 14;
            return (
              <g
                key={coordinate}
                className="woodland-cluster"
                transform={`translate(${center.x} ${center.y}) rotate(${rotation})`}
              >
                <ellipse
                  className="woodland-underpainting"
                  cx="0"
                  cy="2"
                  rx={54 + (seed % 12)}
                  ry={37 + (seed % 9)}
                />
                <ellipse
                  className="woodland-underpainting-secondary"
                  cx={(seed % 17) - 8}
                  cy={(seed % 13) - 6}
                  rx={38 + (seed % 10)}
                  ry={24 + (seed % 8)}
                />
                {TREE_OFFSETS.filter(
                  (_, index) => (seed + index * 11) % 5 < 3,
                ).map((tree, index) => {
                  const shiftX = ((seed * (index + 3)) % 11) - 5;
                  const shiftY = ((seed * (index + 5)) % 9) - 4;
                  const scale =
                    tree.scale * (0.82 + ((seed + index) % 6) * 0.055);
                  return (
                    <g
                      key={index}
                      className={`map-tree tree-tone-${(seed + index) % 3}`}
                      transform={`translate(${tree.x + shiftX} ${tree.y + shiftY}) scale(${scale}) rotate(${((seed + index * 13) % 25) - 12})`}
                    >
                      {index % 3 === 0 ? (
                        <path
                          className="map-tree-crown map-tree-conifer"
                          d="M0-15-7-3h4l-8 10h7l-8 10h24L4 7h7L3-3h4Z"
                        />
                      ) : (
                        <path
                          className="map-tree-crown"
                          d="M-10 4c-5-1-7-6-3-9-1-5 5-8 9-5 3-6 12-4 12 3 6-1 10 5 6 9-4 6-27 7-34 2-4-3-1-8 4-8Z"
                        />
                      )}
                      <path
                        className="map-tree-shadow"
                        d="M-8 3c6 3 14 2 22-2"
                      />
                      <path className="map-tree-trunk" d="M1 5 0 14" />
                    </g>
                  );
                })}
              </g>
            );
          })}
        </g>

        <g
          className="board-feature-layer town-landscape"
          transform={`translate(${gettysburg.x + 28} ${gettysburg.y + 16}) rotate(-3)`}
        >
          <ellipse cx="0" cy="0" rx="70" ry="49" />
          <path
            className="town-street"
            d="M-73-7C-35-3 17-5 72-10M-62 18C-23 12 18 18 62 13M-37-48C-32-18-31 14-27 51M1-52C2-19 0 17 4 50M37-44C31-15 34 17 31 45"
          />
          {[
            [-47, -27],
            [-21, -31],
            [12, -31],
            [39, -28],
            [61, -24],
            [-52, -5],
            [-17, -7],
            [14, -8],
            [45, -4],
            [65, 1],
            [-43, 22],
            [-12, 23],
            [18, 21],
            [45, 22],
            [-57, 39],
            [-25, 42],
            [9, 40],
            [37, 41],
          ].map(([x, y], index) => (
            <path
              className={`town-building building-tone-${index % 3}`}
              d="m-8-5 15-2 2 11-16 2Z"
              key={index}
              transform={`translate(${x} ${y}) rotate(${(index % 5) * 4 - 8})`}
            />
          ))}
        </g>

        <g
          className="board-feature-layer board-roads"
          filter="url(#terrain-line-wobble)"
        >
          {ROADS.map((road, index) => (
            <g key={index}>
              <path className="road-edge" d={pathThrough(road)} />
              <path
                className="road-center"
                d={pathThrough(road)}
                data-reaches-board-edge="true"
              />
            </g>
          ))}
          <path className="railroad-edge" d={pathThrough(RAILROAD)} />
          <path
            className="railroad-ties"
            d={pathThrough(RAILROAD)}
            data-reaches-board-edge="true"
          />
        </g>

        <g className="board-feature-layer board-streams">
          {STREAM_EDGE_ROUTES.map((stream, index) => (
            <g key={index}>
              <path className="stream-bank" d={pathAlongEdges(stream)} />
              <path
                className="stream-water"
                d={pathAlongEdges(stream)}
                data-crosses-board="true"
                data-follows-hex-edges="true"
                data-reaches-board-edge="true"
              />
              <path className="stream-highlight" d={pathAlongEdges(stream)} />
            </g>
          ))}
        </g>
      </g>

      <g className="board-feature-layer board-landmarks">
        {LANDMARKS.map((landmark) => {
          const center = coordinateToPoint(landmark.coordinate);
          return (
            <text
              key={landmark.label}
              className="terrain-label"
              x={center.x + (landmark.x ?? 0)}
              y={center.y + (landmark.y ?? 0)}
            >
              {landmark.label}
            </text>
          );
        })}
      </g>
    </g>
  );
}
