import {
  BOARD_VIEW_BOX,
  FIXTURE_HEXES,
  coordinateToPoint,
  hexPolygonPoints,
  isFixtureCoordinate,
} from "@gettysburg/content";
import type { GameState, HexCoordinate, Side } from "@gettysburg/game";
import {
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
  useRef,
  useState,
} from "react";

interface BoardProps {
  readonly disabled?: boolean;
  readonly error?: string | undefined;
  readonly onMove: (unitId: string, destination: HexCoordinate) => void;
  readonly seat: Side;
  readonly state: GameState;
}

interface Pan {
  readonly x: number;
  readonly y: number;
}

interface DragStart {
  readonly clientX: number;
  readonly clientY: number;
  readonly pan: Pan;
}

const MIN_ZOOM = 0.65;
const FIT_ZOOM = 1;
const MAX_ZOOM = 2.4;

function terrainClass(coordinate: HexCoordinate): string {
  const column = coordinate.charCodeAt(0) - 65;
  const row = Number(coordinate.slice(1));
  const variant = (column * 3 + row * 5) % 11;
  if (variant <= 1) return "terrain-woods";
  if (variant === 2) return "terrain-hill";
  if (variant === 3) return "terrain-town";
  return "terrain-clear";
}

export function Board({
  disabled = false,
  error,
  onMove,
  seat,
  state,
}: BoardProps) {
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [destination, setDestination] = useState("");
  const [zoom, setZoom] = useState(FIT_ZOOM);
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const dragStart = useRef<DragStart | null>(null);
  const svgReference = useRef<SVGSVGElement | null>(null);
  const selectedUnit =
    selectedUnitId === null ? undefined : state.units[selectedUnitId];

  function selectUnit(unitId: string) {
    if (state.units[unitId]?.side === seat) {
      setSelectedUnitId(unitId);
      setDestination("");
    }
  }

  function moveSelected(target: HexCoordinate) {
    if (selectedUnit !== undefined && !disabled) {
      setDestination(target);
      onMove(selectedUnit.id, target);
    }
  }

  function submitDestination(event: FormEvent) {
    event.preventDefault();
    const normalized = destination.trim().toUpperCase();
    if (isFixtureCoordinate(normalized)) {
      moveSelected(normalized);
    }
  }

  function handleCounterKey(event: KeyboardEvent<SVGGElement>, unitId: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectUnit(unitId);
    }
  }

  function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    if ((event.target as Element).closest(".counter") !== null) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragStart.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      pan,
    };
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const start = dragStart.current;
    const element = svgReference.current;
    if (start === null || element === null) return;
    const scale = BOARD_VIEW_BOX.width / (element.clientWidth * zoom);
    setPan({
      x: start.pan.x - (event.clientX - start.clientX) * scale,
      y: start.pan.y - (event.clientY - start.clientY) * scale,
    });
  }

  const viewWidth = BOARD_VIEW_BOX.width / zoom;
  const viewHeight = BOARD_VIEW_BOX.height / zoom;
  const viewX = (BOARD_VIEW_BOX.width - viewWidth) / 2 + pan.x;
  const viewY = (BOARD_VIEW_BOX.height - viewHeight) / 2 + pan.y;

  return (
    <section className="board-workspace" aria-labelledby="board-heading">
      <div className="board-heading-row">
        <div>
          <p className="eyebrow">Original Phase 1 fixture board</p>
          <h2 id="board-heading">A-U / 1-11 field</h2>
        </div>
        <div className="zoom-controls" aria-label="Board zoom controls">
          <button
            type="button"
            onClick={() => setZoom((value) => Math.max(MIN_ZOOM, value - 0.35))}
          >
            Zoom out
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(FIT_ZOOM);
              setPan({ x: 0, y: 0 });
            }}
          >
            Fit
          </button>
          <button
            type="button"
            onClick={() => setZoom((value) => Math.min(MAX_ZOOM, value + 0.35))}
          >
            Zoom in
          </button>
          <output aria-label="Current zoom">{Math.round(zoom * 100)}%</output>
        </div>
      </div>

      <div className="board-frame">
        <svg
          ref={svgReference}
          aria-label="Interactive fixture hex board. Drag to pan, use the controls to zoom, and select your counter before choosing a destination."
          className="board-svg"
          onPointerCancel={() => (dragStart.current = null)}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={() => (dragStart.current = null)}
          role="img"
          viewBox={`${viewX} ${viewY} ${viewWidth} ${viewHeight}`}
        >
          <rect
            className="board-ground"
            height={BOARD_VIEW_BOX.height}
            width={BOARD_VIEW_BOX.width}
          />
          <g aria-hidden="true">
            {FIXTURE_HEXES.map((hex) => (
              <g key={hex.coordinate}>
                <polygon
                  className={`hex ${terrainClass(hex.coordinate)}`}
                  data-coordinate={hex.coordinate}
                  onClick={() => moveSelected(hex.coordinate)}
                  points={hexPolygonPoints(hex.point)}
                />
                <text className="hex-label" x={hex.point.x} y={hex.point.y + 4}>
                  {hex.coordinate}
                </text>
              </g>
            ))}
          </g>
          <g aria-label="Counters">
            {Object.values(state.units).map((unit) => {
              const point = coordinateToPoint(unit.location);
              const selected = unit.id === selectedUnitId;
              return (
                <g
                  key={unit.id}
                  aria-label={`${unit.label}, ${unit.location}${unit.side === seat ? ", selectable" : ""}`}
                  aria-pressed={selected}
                  className={`counter counter-${unit.side}${selected ? " selected" : ""}`}
                  data-unit-id={unit.id}
                  onClick={() => selectUnit(unit.id)}
                  onKeyDown={(event) => handleCounterKey(event, unit.id)}
                  role="button"
                  tabIndex={unit.side === seat ? 0 : -1}
                  transform={`translate(${point.x} ${point.y})`}
                >
                  <rect height="52" rx="8" width="52" x="-26" y="-26" />
                  <path d="M -13 10 L 0 -13 L 13 10 Z" />
                  <text x="0" y="20">
                    {unit.side === "union" ? "U" : "C"}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <aside
        className="counter-inspector"
        aria-label="Selected counter inspector"
      >
        <div>
          <p className="inspector-label">Your seat</p>
          <strong>{seat === "union" ? "Union" : "Confederate"}</strong>
        </div>
        <div>
          <p className="inspector-label">Selected counter</p>
          <strong>{selectedUnit?.label ?? "Select your counter"}</strong>
          {selectedUnit === undefined ? null : (
            <span> at {selectedUnit.location}</span>
          )}
        </div>
        <form onSubmit={submitDestination}>
          <label htmlFor="destination">Destination coordinate</label>
          <div className="destination-row">
            <input
              id="destination"
              aria-describedby="move-status"
              disabled={selectedUnit === undefined || disabled}
              maxLength={3}
              onChange={(event) => setDestination(event.target.value)}
              placeholder="G5"
              value={destination}
            />
            <button
              disabled={selectedUnit === undefined || disabled}
              type="submit"
            >
              Move
            </button>
          </div>
        </form>
        <p
          aria-live="polite"
          className={error ? "move-error" : "move-status"}
          id="move-status"
        >
          {error ??
            (disabled
              ? "Waiting for the authoritative server."
              : "Moves remain at their confirmed location until the server accepts them.")}
        </p>
      </aside>
    </section>
  );
}
