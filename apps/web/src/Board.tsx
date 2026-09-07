import {
  BOARD_TERRAIN,
  BOARD_VIEW_BOX,
  FIXTURE_HEXES,
  coordinateToPoint,
  hexPolygonPoints,
  pointToCoordinate,
} from "@gettysburg/content";
import {
  adjacentHexes,
  combatFactorModifier,
  defenderCombatModifier,
  combatOpportunities,
  currentCombatValue,
  hexDistance,
  movementPath,
  MANDATORY_RULESET_VERSION,
  planNormalMove,
  prepareForcedRetreat,
  suggestedRetreat,
  validateRetreatPath,
  shortestHexPath,
  type GameState,
  type HexCoordinate,
  type Side,
} from "@gettysburg/game";
import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useRef,
  useState,
} from "react";

import { BoardTerrain, presentationTerrain } from "./BoardTerrain";
import { previewMandatoryMovement } from "./movement-preview";
import { MovementControls } from "./MovementControls";
import { previewAdvance } from "./advance-preview";

interface BoardProps {
  readonly onExit?: (unitIds: readonly string[]) => void;
  readonly onAdvance?: (
    combatId: string,
    unitIds: readonly string[],
    destination: HexCoordinate | null,
  ) => void;
  readonly disabled?: boolean;
  readonly error?: string | undefined;
  readonly onMove: (
    unitIds: readonly string[],
    destination: HexCoordinate,
  ) => void;
  readonly onRetreat?: (
    combatId: string,
    unitIds: readonly string[],
    path: readonly HexCoordinate[],
  ) => void;
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

interface UnitDrag {
  readonly movementCost?: number;
  readonly combatId: string | null;
  readonly decline: boolean;
  readonly destinationHexes: readonly HexCoordinate[];
  readonly mode: "advance" | "movement" | "retreat";
  readonly path: readonly HexCoordinate[];
  readonly primaryUnitId: string;
  readonly unitIds: readonly string[];
}

const MIN_ZOOM = 0.65;
const FIT_ZOOM = 1;
const DEFAULT_ZOOM = 1.15;
const MAX_ZOOM = 2.4;

const UNIT_KIND_MARKS = {
  artillery: "ART",
  cavalry: "CAV",
  general: "GEN",
  infantry: "INF",
} as const;

function organizationMark(organization: string): string {
  const corps = organization.match(/^([IVX]+) Corps$/);
  if (corps?.[1] !== undefined) return corps[1];
  const cavalryDivision = organization.match(/^(\d+) Cavalry Division$/);
  if (cavalryDivision?.[1] !== undefined) return `${cavalryDivision[1]}C`;
  if (organization === "Artillery Reserve") return "AR";
  if (organization === "Army of the Potomac") return "AP";
  if (organization === "Cavalry Corps" || organization === "Cavalry") {
    return "C";
  }
  if (organization === "Cavalry Division") return "CD";
  return organization.slice(0, 3).toUpperCase();
}

function unitFactor(combat: number | null, movement: number): string {
  return combat === null ? String(movement) : `${combat}-${movement}`;
}

export function Board({
  disabled = false,
  error,
  onAdvance = () => undefined,
  onMove,
  onExit = () => undefined,
  onRetreat = () => undefined,
  seat,
  state,
}: BoardProps) {
  const mandatory = state.ruleset_version === MANDATORY_RULESET_VERSION;
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [selectedSingle, setSelectedSingle] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<{
    readonly source: HexCoordinate;
    readonly ids: readonly string[];
  } | null>(null);
  const [singleCounterMode, setSingleCounterMode] = useState(false);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const [movementNotice, setMovementNotice] = useState<string | null>(null);
  const [unitDrag, setUnitDrag] = useState<UnitDrag | null>(null);
  const dragStart = useRef<DragStart | null>(null);
  const unitDragReference = useRef<UnitDrag | null>(null);
  const svgReference = useRef<SVGSVGElement | null>(null);
  const selectedUnit =
    selectedUnitId === null ? undefined : state.units[selectedUnitId];
  const selectedCombat =
    selectedUnit === undefined
      ? null
      : currentCombatValue(selectedUnit, state.ruleset_version);
  const deployedUnits = Object.values(state.units).filter(
    (unit) => unit.location !== null && unit.status === "deployed",
  );
  const visibleCombatOpportunities =
    state.phase === "combat" && state.active_side !== null
      ? combatOpportunities(state, state.active_side)
      : [];
  const visibleDeclaredCombats =
    state.phase === "combat"
      ? Object.values(state.combats)
          .filter((combat) => combat.status !== "resolved")
          .map((combat) => ({
            attacker_hexes: [
              ...new Set(
                combat.attackers.flatMap((id) => {
                  const location = state.units[id]?.location;
                  return location === null || location === undefined
                    ? []
                    : [location];
                }),
              ),
            ].sort(),
            attacker_modifier:
              combat.confirmation?.attacker_modifier ??
              combatFactorModifier(state, combat.attackers),
            defender_hexes: [
              ...new Set(
                combat.defenders.flatMap((id) => {
                  const location = state.units[id]?.location;
                  return location === null || location === undefined
                    ? []
                    : [location];
                }),
              ),
            ].sort(),
            defender_modifier:
              combat.confirmation?.defender_modifier ??
              defenderCombatModifier(state, combat.attackers, combat.defenders),
            id: combat.id,
          }))
      : [];
  const visibleCombats = [
    ...visibleCombatOpportunities,
    ...visibleDeclaredCombats,
  ];
  const pendingAdvance = Object.values(state.combats).find(
    (combat) =>
      combat.pending_choice?.kind === "advance" &&
      combat.pending_choice.side === seat,
  );
  const stackPosition = new Map<string, { x: number; y: number }>();
  for (const unit of deployedUnits) {
    const stack = deployedUnits.filter(
      (candidate) => candidate.location === unit.location,
    );
    const index = stack.findIndex((candidate) => candidate.id === unit.id);
    const offsets =
      stack.length === 1
        ? [{ x: 0, y: 0 }]
        : stack.length === 2
          ? [
              { x: -18, y: -11 },
              { x: 18, y: 11 },
            ]
          : stack.length === 3
            ? [
                { x: -22, y: -14 },
                { x: 22, y: -14 },
                { x: 0, y: 22 },
              ]
            : Array.from({ length: stack.length }, (_, slot) => {
                const angle = (2 * Math.PI * slot) / stack.length;
                return {
                  x: Math.round(Math.cos(angle) * 24),
                  y: Math.round(Math.sin(angle) * 20),
                };
              });
    stackPosition.set(unit.id, offsets[index] ?? { x: 0, y: 0 });
  }
  const renderedUnits = [...deployedUnits].sort((left, right) => {
    if (left.id === selectedUnitId) return 1;
    if (right.id === selectedUnitId) return -1;
    return 0;
  });

  function selectUnit(unitId: string, single = false) {
    if (state.units[unitId]?.side === seat) {
      setSelectedUnitId(unitId);
      setSelectedSingle(single || singleCounterMode);
      setMovementNotice(null);
    }
  }

  function toggleSingleCounterMode() {
    setSingleCounterMode((current) => {
      const next = !current;
      if (selectedUnitId !== null) setSelectedSingle(next);
      setMovementNotice(
        next
          ? "Single-counter mode enabled. Select or drag one counter from a stack."
          : "Stack movement mode enabled.",
      );
      return next;
    });
  }

  function movementStackIds(unitId: string, single: boolean): string[] {
    const unit = state.units[unitId];
    if (unit?.location === null || unit === undefined) return [];
    if (single) return [unitId];
    const activeIds = state.normal_movement?.active_unit_ids ?? [];
    if (
      mandatory &&
      activeIds.includes(unitId) &&
      activeIds.every(
        (id) =>
          state.units[id]?.status === "deployed" &&
          state.units[id]?.side === seat &&
          state.units[id]?.location === unit.location,
      )
    )
      return [...activeIds];
    if (
      mandatory &&
      selectedGroup?.source === unit.location &&
      selectedGroup.ids.includes(unitId) &&
      selectedGroup.ids.every(
        (id) =>
          state.units[id]?.location === unit.location &&
          state.units[id]?.status === "deployed" &&
          state.units[id]?.side === seat,
      )
    )
      return [...selectedGroup.ids];
    return deployedUnits
      .filter(
        (candidate) =>
          candidate.side === seat && candidate.location === unit.location,
      )
      .map((candidate) => candidate.id);
  }

  function retreatContext(unitId: string) {
    const unit = state.units[unitId];
    if (unit?.location === null || unit === undefined) return null;
    for (const combat of Object.values(state.combats)) {
      const choice = combat.pending_choice;
      if (
        choice?.kind === "retreat" &&
        choice.side === seat &&
        choice.unit_ids.includes(unitId)
      ) {
        return {
          combatId: combat.id,
          unitIds: choice.unit_ids.filter(
            (id) => state.units[id]?.location === unit.location,
          ),
        };
      }
    }
    return null;
  }

  function advanceContext(unitId: string, single = false) {
    const unit = state.units[unitId];
    if (unit?.location === null || unit === undefined) return null;
    for (const combat of Object.values(state.combats)) {
      const choice = combat.pending_choice;
      if (
        choice?.kind === "advance" &&
        choice.side === seat &&
        choice.eligible_unit_ids.includes(unitId)
      ) {
        return {
          combatId: combat.id,
          destinationHexes:
            choice.destination_hexes ?? combat.defender_hexes ?? [],
          unitIds: single
            ? [unitId]
            : choice.eligible_unit_ids.filter(
                (id) => state.units[id]?.location === unit.location,
              ),
        };
      }
    }
    return null;
  }

  function selectedIds(): string[] {
    if (selectedUnitId === null) return [];
    const retreat = retreatContext(selectedUnitId);
    const advance = advanceContext(selectedUnitId, selectedSingle);
    return (
      retreat?.unitIds ??
      advance?.unitIds ??
      movementStackIds(selectedUnitId, selectedSingle)
    );
  }

  function movementRemaining(unitId: string): number {
    const unit = state.units[unitId];
    return unit === undefined
      ? 0
      : Math.max(0, unit.movement - (unit.movement_spent ?? 0));
  }

  function canMoveUnit(unitId: string): boolean {
    const unit = state.units[unitId];
    return (
      unit !== undefined &&
      unit.side === seat &&
      unit.status === "deployed" &&
      unit.location !== null &&
      state.active_side === seat &&
      state.phase === "movement" &&
      !disabled &&
      (mandatory || movementRemaining(unitId) > 0)
    );
  }

  function movementAllowance(unitIds: readonly string[]): number {
    if (mandatory) {
      const movers = unitIds.flatMap((id) =>
        state.units[id] ? [state.units[id]!] : [],
      );
      const plan = planNormalMove(state.normal_movement, movers);
      return plan.ok && movers.length === unitIds.length ? plan.allowance : 0;
    }
    return unitIds.reduce(
      (remaining, id) => Math.min(remaining, movementRemaining(id)),
      Number.POSITIVE_INFINITY,
    );
  }

  function canMoveStack(unitIds: readonly string[]): boolean {
    return (
      unitIds.length > 0 &&
      unitIds.every(canMoveUnit) &&
      movementAllowance(unitIds) > 0
    );
  }

  function moveSelected(target: HexCoordinate) {
    if (selectedUnit === undefined || selectedUnit.location === null) return;
    if (disabled) {
      setMovementNotice("Waiting for the authoritative server.");
      return;
    }
    const retreat = retreatContext(selectedUnit.id);
    if (retreat !== null) {
      const path = retreatPath(selectedUnit.location, target, retreat.unitIds);
      if (path.length <= 1) {
        setMovementNotice(
          mandatory
            ? "Use the retreat controls to choose legal steps, an edge exit, or a trapped loss."
            : "Choose a connected path to the first empty hex.",
        );
        return;
      }
      const destination = path.at(-1)!;
      if (
        mandatory &&
        !prepareForcedRetreat(
          state,
          seat,
          retreat.combatId,
          retreat.unitIds,
          path,
        ).ok
      )
        return;
      setMovementNotice(
        `Submitting ${retreat.unitIds.length}-counter retreat to ${destination}.`,
      );
      onRetreat(retreat.combatId, retreat.unitIds, path);
      return;
    }
    const advance = advanceContext(selectedUnit.id, selectedSingle);
    if (advance !== null) {
      if (mandatory) {
        const preview = previewAdvance(
          state,
          seat,
          advance.combatId,
          advance.unitIds,
          target,
        );
        if (!preview.ok) {
          setMovementNotice(preview.failure.message);
          return;
        }
      }
      if (!advance.destinationHexes.includes(target)) {
        setMovementNotice("Choose a highlighted advance destination.");
        return;
      }
      setMovementNotice(
        `Submitting ${advance.unitIds.length}-counter advance to ${target}.`,
      );
      onAdvance(advance.combatId, advance.unitIds, target);
      return;
    }
    const unitIds = selectedIds();
    if (mandatory) {
      const preview = previewMandatoryMovement(state, seat, unitIds, target);
      if (!preview.ok) {
        setMovementNotice(preview.message);
        return;
      }
      setMovementNotice(
        `Submitting ${preview.route.cost} movement point${preview.route.cost === 1 ? "" : "s"} to ${target}.`,
      );
      onMove(unitIds, target);
      return;
    }
    if (!canMoveStack(unitIds)) {
      setMovementNotice("This counter cannot move during the current phase.");
      return;
    }
    const path = movementPath(state, seat, selectedUnit.location, target);
    if (path.at(-1) !== target) {
      setMovementNotice(
        state.night
          ? "Night movement must withdraw from and cannot enter an enemy zone of control."
          : "Movement cannot pass through an enemy-occupied hex.",
      );
      return;
    }
    const distance = path.length - 1;
    const remaining = movementAllowance(unitIds);
    if (distance > remaining) {
      setMovementNotice(
        `${target} is ${distance} hexes away; this ${unitIds.length === 1 ? "counter has" : "stack has"} ${remaining} movement remaining.`,
      );
      return;
    }
    setMovementNotice(`Submitting ${distance} movement to ${target}.`);
    onMove(unitIds, target);
  }

  function declineSelectedAdvance() {
    if (disabled) {
      setMovementNotice("Waiting for the authoritative server.");
      return;
    }
    if (selectedUnitId === null) {
      setMovementNotice("Select an eligible counter before declining advance.");
      return;
    }
    const advance = advanceContext(selectedUnitId, selectedSingle);
    if (advance === null) {
      setMovementNotice("The selected counter cannot decline this advance.");
      return;
    }
    if (
      mandatory &&
      !previewAdvance(state, seat, advance.combatId, advance.unitIds, null).ok
    )
      return;
    setMovementNotice("Submitting declined advance.");
    onAdvance(advance.combatId, advance.unitIds, null);
  }

  function handleCounterKey(event: KeyboardEvent<SVGGElement>, unitId: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectUnit(unitId, event.ctrlKey);
    }
  }

  function boardPointFromPointer(event: PointerEvent<SVGSVGElement>) {
    const element = svgReference.current;
    if (element === null) return null;
    const matrix = element.getScreenCTM?.();
    if (matrix !== null && matrix !== undefined && element.createSVGPoint) {
      const screenPoint = element.createSVGPoint();
      screenPoint.x = event.clientX;
      screenPoint.y = event.clientY;
      const boardPoint = screenPoint.matrixTransform(matrix.inverse());
      return { x: boardPoint.x, y: boardPoint.y };
    }
    const bounds = element.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return null;
    return {
      x: viewX + ((event.clientX - bounds.left) / bounds.width) * viewWidth,
      y: viewY + ((event.clientY - bounds.top) / bounds.height) * viewHeight,
    };
  }

  function handleCounterPointerDown(
    event: PointerEvent<SVGGElement>,
    unitId: string,
  ) {
    if (event.button !== 0) return;
    event.stopPropagation();
    const retreat = retreatContext(unitId);
    const single =
      retreat === null &&
      (event.ctrlKey ||
        singleCounterMode ||
        (selectedUnitId === unitId && selectedSingle));
    const advance = retreat === null ? advanceContext(unitId, single) : null;
    selectUnit(unitId, single);
    const unit = state.units[unitId];
    if (unit === undefined || unit.location === null) return;
    const unitIds =
      retreat?.unitIds ?? advance?.unitIds ?? movementStackIds(unitId, single);
    if (retreat === null && advance === null && !canMoveStack(unitIds)) return;
    if (retreat === null && advance === null && state.phase !== "movement") {
      return;
    }
    if (disabled || (advance !== null && state.phase !== "combat")) return;
    event.preventDefault();
    const drag = {
      combatId: retreat?.combatId ?? advance?.combatId ?? null,
      decline: false,
      destinationHexes: advance?.destinationHexes ?? [],
      mode:
        retreat !== null
          ? "retreat"
          : advance !== null
            ? "advance"
            : "movement",
      path: [unit.location],
      primaryUnitId: unitId,
      unitIds,
    } satisfies UnitDrag;
    unitDragReference.current = drag;
    setUnitDrag(drag);
    setMovementNotice(
      retreat !== null
        ? `Retreating ${unitIds.length} stacked counter${unitIds.length === 1 ? "" : "s"} together. Drag to the first empty hex.`
        : advance !== null
          ? `Advancing ${unitIds.length === 1 ? unit.label : `${unitIds.length} stacked counters`}. Drop on a highlighted vacated hex, or in the Decline advance tray.`
          : `Moving ${unitIds.length === 1 ? unit.label : `${unitIds.length} stacked counters`}. Drag up to ${movementAllowance(unitIds)} ${mandatory ? "movement points" : "hexes"}; hold Ctrl before dragging to move only one counter.`,
    );
    svgReference.current?.setPointerCapture?.(event.pointerId);
  }

  function cancelUnitDrag() {
    unitDragReference.current = null;
    setUnitDrag(null);
  }

  function finishUnitDrag() {
    const drag = unitDragReference.current;
    cancelUnitDrag();
    const target = drag?.path.at(-1);
    if (drag === null || target === undefined) return;
    if (disabled) {
      setMovementNotice("Waiting for the authoritative server.");
      return;
    }
    if (mandatory && drag.mode === "advance") {
      const preview = previewAdvance(
        state,
        seat,
        drag.combatId!,
        drag.unitIds,
        drag.decline ? null : target,
      );
      if (!preview.ok) {
        setMovementNotice(preview.failure.message);
        return;
      }
    }
    if (drag.mode === "advance" && drag.decline) {
      setMovementNotice("Submitting declined advance.");
      onAdvance(drag.combatId!, drag.unitIds, null);
      return;
    }
    if (drag.path.length <= 1) return;
    if (mandatory && drag.mode === "retreat") {
      const preview = prepareForcedRetreat(
        state,
        seat,
        drag.combatId!,
        drag.unitIds,
        drag.path,
      );
      if (!preview.ok) {
        setMovementNotice(preview.message);
        return;
      }
    }
    if (mandatory && drag.mode === "movement") {
      const preview = previewMandatoryMovement(
        state,
        seat,
        drag.unitIds,
        target,
      );
      if (!preview.ok) {
        setMovementNotice(preview.message);
        return;
      }
    }
    setMovementNotice(
      drag.mode === "movement"
        ? `Submitting ${drag.unitIds.length === 1 ? "counter" : "stack"} movement to ${target}.`
        : drag.mode === "retreat"
          ? `Submitting ${drag.unitIds.length}-counter retreat to ${target}.`
          : `Submitting ${drag.unitIds.length}-counter advance to ${target}.`,
    );
    if (drag.mode === "retreat") {
      onRetreat(drag.combatId!, drag.unitIds, drag.path);
    } else if (drag.mode === "advance") {
      onAdvance(drag.combatId!, drag.unitIds, target);
    } else {
      onMove(drag.unitIds, target);
    }
  }

  function retreatPath(
    source: HexCoordinate,
    target: HexCoordinate,
    unitIds: readonly string[],
  ): readonly HexCoordinate[] {
    if (mandatory) {
      const direct = [source, target];
      if (validateRetreatPath(state, unitIds, direct)) return direct;
      const suggested = suggestedRetreat(state, unitIds);
      return suggested !== null &&
        !suggested.exit &&
        suggested.path.at(-1) === target
        ? suggested.path
        : [source];
    }
    const moving = new Set(unitIds);
    const frontier: HexCoordinate[] = [source];
    const previous = new Map<HexCoordinate, HexCoordinate | null>([
      [source, null],
    ]);
    for (let index = 0; index < frontier.length; index += 1) {
      const current = frontier[index];
      if (current === undefined) break;
      for (const neighbor of adjacentHexes(current)) {
        if (previous.has(neighbor)) continue;
        const occupants = deployedUnits.filter(
          (unit) => !moving.has(unit.id) && unit.location === neighbor,
        );
        if (occupants.some((unit) => unit.side !== seat)) continue;
        previous.set(neighbor, current);
        if (neighbor === target && occupants.length === 0) {
          const path: HexCoordinate[] = [target];
          let step: HexCoordinate | null = current;
          while (step !== null) {
            path.push(step);
            step = previous.get(step) ?? null;
          }
          return path.reverse();
        }
        if (occupants.length > 0) frontier.push(neighbor);
      }
    }
    return [source];
  }

  function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    const target = event.target as Element;
    if (target.closest(".counter") !== null) return;
    if (target.closest(".advance-decline-target") !== null) return;
    if (selectedUnitId !== null && target.closest(".hex") !== null) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragStart.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      pan,
    };
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const unitMove = unitDragReference.current;
    if (unitMove !== null) {
      event.preventDefault();
      const unit = state.units[unitMove.primaryUnitId];
      const point = boardPointFromPointer(event);
      if (unit?.location === null || unit === undefined || point === null)
        return;
      if (unitMove.mode === "advance" && pointInDeclineTarget(point)) {
        const drag = {
          ...unitMove,
          decline: true,
          path: [unit.location],
        } satisfies UnitDrag;
        unitDragReference.current = drag;
        setUnitDrag(drag);
        setMovementNotice("Release to decline this advance.");
        return;
      }
      const target = pointToCoordinate(point);
      if (target === null) return;
      if (mandatory && unitMove.mode === "advance") {
        const preview = previewAdvance(
          state,
          seat,
          unitMove.combatId!,
          unitMove.unitIds,
          target,
        );
        const path = preview.ok ? [unit.location, target] : [unit.location];
        const drag = { ...unitMove, decline: false, path } satisfies UnitDrag;
        unitDragReference.current = drag;
        setUnitDrag(drag);
        setMovementNotice(
          preview.ok
            ? `Release to advance to ${target} for no movement cost.`
            : preview.failure.message,
        );
        return;
      }
      if (mandatory && unitMove.mode === "movement") {
        const preview = previewMandatoryMovement(
          state,
          seat,
          unitMove.unitIds,
          target,
          true,
        );
        const path = preview.ok ? preview.route.path : [unit.location];
        const drag = {
          ...unitMove,
          decline: false,
          path,
          movementCost: preview.ok ? preview.route.cost : 0,
        } satisfies UnitDrag;
        unitDragReference.current = drag;
        setUnitDrag(drag);
        setMovementNotice(
          preview.ok
            ? `${unitMove.unitIds.length === 1 ? unit.label : `${unitMove.unitIds.length}-counter stack`}: ${preview.route.cost} of ${preview.allowance} movement points to ${path.at(-1)}.`
            : preview.message,
        );
        return;
      }
      const path =
        unitMove.mode === "retreat"
          ? retreatPath(unit.location, target, unitMove.unitIds)
          : unitMove.mode === "advance"
            ? unitMove.destinationHexes.includes(target)
              ? shortestHexPath(unit.location, target)
              : [unit.location]
            : movementPath(state, seat, unit.location, target).slice(
                0,
                movementAllowance(unitMove.unitIds) + 1,
              );
      const drag = { ...unitMove, decline: false, path } satisfies UnitDrag;
      unitDragReference.current = drag;
      setUnitDrag(drag);
      const endpoint = path.at(-1) ?? unit.location;
      setMovementNotice(
        unitMove.mode === "retreat"
          ? `${unitMove.unitIds.length} stacked counter${unitMove.unitIds.length === 1 ? "" : "s"}: retreat ${path.length - 1} hex${path.length === 2 ? "" : "es"} to ${endpoint}.`
          : unitMove.mode === "advance"
            ? path.length > 1
              ? `${unitMove.unitIds.length} counter${unitMove.unitIds.length === 1 ? "" : "s"}: release to advance to ${endpoint}.`
              : "Drag to a highlighted vacated hex or the Decline advance tray."
            : state.night &&
                movementPath(state, seat, unit.location, target).at(-1) !==
                  target
              ? "Night movement stops before an enemy zone of control. Withdraw away from enemy counters."
              : `${unitMove.unitIds.length === 1 ? unit.label : `${unitMove.unitIds.length}-counter stack`}: ${path.length - 1} of ${movementAllowance(unitMove.unitIds)} movement to ${endpoint}.`,
      );
      return;
    }
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
  const declineTarget = {
    height: 64,
    width: Math.min(230, viewWidth * 0.32),
    x: viewX + viewWidth - Math.min(230, viewWidth * 0.32) - 20,
    y: viewY + 20,
  };

  function pointInDeclineTarget(point: {
    readonly x: number;
    readonly y: number;
  }) {
    return (
      point.x >= declineTarget.x &&
      point.x <= declineTarget.x + declineTarget.width &&
      point.y >= declineTarget.y &&
      point.y <= declineTarget.y + declineTarget.height
    );
  }

  return (
    <section className="board-workspace" aria-labelledby="board-heading">
      <div className="board-heading-row">
        <div>
          <p className="eyebrow">
            {mandatory
              ? "Original mandatory-rules board"
              : "Original rules-light tabletop board"}
          </p>
          <h2 id="board-heading">A-W / 1-11 field</h2>
        </div>
        <div className="zoom-controls" aria-label="Board controls">
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
          <button
            aria-pressed={singleCounterMode}
            type="button"
            onClick={toggleSingleCounterMode}
          >
            One counter
          </button>
          <output aria-label="Current zoom">{Math.round(zoom * 100)}%</output>
        </div>
      </div>

      <div className="board-frame">
        <svg
          ref={svgReference}
          aria-label={`Interactive ${mandatory ? "mandatory-rules" : "rules-light"} hex board. Drag to pan, use the controls to zoom, and select your counter before choosing a destination.`}
          className="board-svg"
          onPointerCancel={() => {
            dragStart.current = null;
            cancelUnitDrag();
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={() => {
            dragStart.current = null;
            finishUnitDrag();
          }}
          viewBox={`${viewX} ${viewY} ${viewWidth} ${viewHeight}`}
        >
          <rect
            className="board-ground"
            height={BOARD_VIEW_BOX.height}
            width={BOARD_VIEW_BOX.width}
          />
          <g aria-hidden="true">
            <BoardTerrain />
          </g>
          <g
            aria-label="Board destinations"
            data-grid-presentation="interaction-only"
          >
            {FIXTURE_HEXES.map((hex) => (
              <polygon
                aria-label={
                  selectedUnit === undefined
                    ? undefined
                    : `Move selected counters to ${hex.coordinate}`
                }
                className={`hex terrain-${presentationTerrain(hex.coordinate)}`}
                data-coordinate={hex.coordinate}
                key={hex.coordinate}
                onClick={() => moveSelected(hex.coordinate)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    moveSelected(hex.coordinate);
                  }
                }}
                points={hexPolygonPoints(hex.point)}
                role={selectedUnit === undefined ? undefined : "button"}
                tabIndex={selectedUnit === undefined ? -1 : 0}
              >
                <title>{`${hex.coordinate}: ${presentationTerrain(hex.coordinate)}; defense +${BOARD_TERRAIN[hex.coordinate].defense} before connected-terrain cancellation`}</title>
              </polygon>
            ))}
          </g>
          <g aria-hidden="true">
            {FIXTURE_HEXES.map((hex) => (
              <text
                className="hex-label"
                key={hex.coordinate}
                x={hex.point.x}
                y={hex.point.y + 4}
              >
                {hex.coordinate}
              </text>
            ))}
          </g>
          {pendingAdvance?.pending_choice?.kind !== "advance" ? null : (
            <g aria-label="Available advance destinations">
              {(
                pendingAdvance.pending_choice.destination_hexes ??
                pendingAdvance.defender_hexes ??
                []
              ).map((coordinate) => (
                <polygon
                  aria-label={`Advance destination ${coordinate}`}
                  className="advance-target"
                  data-advance-coordinate={coordinate}
                  key={coordinate}
                  points={hexPolygonPoints(coordinateToPoint(coordinate))}
                />
              ))}
            </g>
          )}
          {pendingAdvance?.pending_choice?.kind !== "advance" ? null : (
            <g
              aria-label="Decline advance"
              className={`advance-decline-target${unitDrag?.decline === true ? " active" : ""}`}
              data-decline-height={declineTarget.height}
              data-decline-width={declineTarget.width}
              data-decline-x={declineTarget.x}
              data-decline-y={declineTarget.y}
              onClick={declineSelectedAdvance}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  declineSelectedAdvance();
                }
              }}
              role="button"
              tabIndex={0}
            >
              <rect
                height={declineTarget.height}
                rx="8"
                width={declineTarget.width}
                x={declineTarget.x}
                y={declineTarget.y}
              />
              <text
                x={declineTarget.x + declineTarget.width / 2}
                y={declineTarget.y + 27}
              >
                DECLINE ADVANCE
              </text>
              <text
                className="advance-decline-hint"
                x={declineTarget.x + declineTarget.width / 2}
                y={declineTarget.y + 47}
              >
                Select eligible counters, then click
              </text>
            </g>
          )}
          {visibleCombats.length === 0 ? null : (
            <g aria-label="Detected adjacent combats" className="combat-links">
              {visibleCombats.flatMap((opportunity) =>
                opportunity.attacker_hexes.flatMap((attackerHex) =>
                  opportunity.defender_hexes
                    .filter(
                      (defenderHex) =>
                        hexDistance(attackerHex, defenderHex) === 1,
                    )
                    .map((defenderHex) => {
                      const attacker = coordinateToPoint(attackerHex);
                      const defender = coordinateToPoint(defenderHex);
                      return (
                        <line
                          aria-label={
                            "Combat contact " +
                            attackerHex +
                            " to " +
                            defenderHex
                          }
                          key={
                            opportunity.id +
                            ":" +
                            attackerHex +
                            ":" +
                            defenderHex
                          }
                          x1={attacker.x}
                          x2={defender.x}
                          y1={attacker.y}
                          y2={defender.y}
                        >
                          <title>
                            Adjacent combat: attacker +
                            {opportunity.attacker_modifier}, defender +
                            {opportunity.defender_modifier} including terrain
                          </title>
                        </line>
                      );
                    }),
                ),
              )}
            </g>
          )}
          {unitDrag === null ? null : (
            <g aria-hidden="true" className="movement-route">
              <polyline
                points={unitDrag.path
                  .map((coordinate) => {
                    const point = coordinateToPoint(coordinate);
                    return `${point.x},${point.y}`;
                  })
                  .join(" ")}
              />
              {unitDrag.path.map((coordinate, index) => {
                const point = coordinateToPoint(coordinate);
                return (
                  <circle
                    className="movement-route-step"
                    cx={point.x}
                    cy={point.y}
                    key={coordinate}
                    r={index === unitDrag.path.length - 1 ? 8 : 4}
                  />
                );
              })}
              {(() => {
                const endpoint = coordinateToPoint(
                  unitDrag.path.at(-1) ?? unitDrag.path[0]!,
                );
                return (
                  <text x={endpoint.x} y={endpoint.y - 15}>
                    {unitDrag.mode === "retreat"
                      ? `Retreat ${unitDrag.unitIds.length} together`
                      : unitDrag.mode === "advance"
                        ? unitDrag.decline
                          ? "Release to decline"
                          : `Advance ${unitDrag.unitIds.length} together`
                        : `${mandatory ? (unitDrag.movementCost ?? 0) : unitDrag.path.length - 1} / ${movementAllowance(unitDrag.unitIds)}`}
                  </text>
                );
              })()}
            </g>
          )}
          <g aria-label="Counters">
            {renderedUnits.map((unit) => {
              if (unit.location === null || unit.status !== "deployed") {
                return null;
              }
              const point = coordinateToPoint(unit.location);
              const offset = stackPosition.get(unit.id) ?? { x: 0, y: 0 };
              const draggedPath =
                unitDrag?.unitIds.includes(unit.id) === true
                  ? unitDrag.path
                  : null;
              const draggedCoordinate = draggedPath?.at(-1);
              const displayPoint =
                draggedCoordinate === undefined
                  ? point
                  : coordinateToPoint(draggedCoordinate);
              const selected = selectedIds().includes(unit.id);
              const retreatRequired = retreatContext(unit.id) !== null;
              const advanceEligible = advanceContext(unit.id) !== null;
              const currentCombat = currentCombatValue(
                unit,
                state.ruleset_version,
              );
              const factor = unitFactor(currentCombat, unit.movement);
              const details =
                currentCombat === null
                  ? `${unit.kind}, movement ${unit.movement}`
                  : `${unit.kind}, combat ${currentCombat}, movement ${unit.movement}`;
              return (
                <g
                  key={unit.id}
                  aria-label={`${unit.label}, ${unit.location}${unit.side === seat ? ", selectable" : ""}, ${details}, ${unit.organization}`}
                  aria-pressed={selected}
                  className={`counter counter-${unit.side}${retreatRequired ? " retreat-required" : ""}${advanceEligible ? " advance-eligible" : ""}${selected ? " selected" : ""}${draggedPath === null ? "" : " dragging"}`}
                  data-combat={currentCombat ?? ""}
                  data-movement={unit.movement}
                  data-unit-id={unit.id}
                  onClick={(event: MouseEvent<SVGGElement>) =>
                    selectUnit(
                      unit.id,
                      (event.ctrlKey || singleCounterMode) &&
                        retreatContext(unit.id) === null,
                    )
                  }
                  onKeyDown={(event) => handleCounterKey(event, unit.id)}
                  onPointerDown={(event) =>
                    handleCounterPointerDown(event, unit.id)
                  }
                  role="button"
                  tabIndex={unit.side === seat ? 0 : -1}
                  transform={`translate(${displayPoint.x + (draggedPath === null || (unitDrag?.unitIds.length ?? 0) > 1 ? offset.x : 0)} ${displayPoint.y + (draggedPath === null || (unitDrag?.unitIds.length ?? 0) > 1 ? offset.y : 0)})`}
                >
                  <title>
                    {unit.label}: {details}; {unit.organization}; arrives turn{" "}
                    {unit.entry_turn ?? 1}
                  </title>
                  <rect height="56" rx="4" width="56" x="-28" y="-28" />
                  <text className="counter-name" x="0" y="-17">
                    {unit.label}
                  </text>
                  <text className="counter-turn" x="21" y="-7">
                    {unit.entry_turn ?? 1}
                  </text>
                  <g className={`counter-kind counter-kind-${unit.kind}`}>
                    <rect height="15" rx="0" width="25" x="-12.5" y="-12" />
                    <text x="0" y="-1">
                      {UNIT_KIND_MARKS[unit.kind]}
                    </text>
                  </g>
                  <text className="counter-org" x="-19" y="20">
                    {organizationMark(unit.organization)}
                  </text>
                  <text className="counter-factor" x="13" y="20">
                    {factor}
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
          <strong>
            {selectedUnit === undefined
              ? "Select your counter"
              : selectedIds().length > 1
                ? `${selectedIds().length}-counter stack (${selectedUnit.label})`
                : selectedUnit.label}
          </strong>
          {selectedUnit === undefined ? null : (
            <div className="counter-details">
              <span>
                {selectedUnit.kind} · {selectedUnit.organization} · at{" "}
                {selectedUnit.location}
              </span>
              <span>
                {selectedCombat === null
                  ? `Movement ${selectedUnit.movement}`
                  : `Combat ${selectedCombat} · Movement ${selectedUnit.movement}`}
                {selectedUnit.entry_turn === null
                  ? " · Initial setup"
                  : ` · Arrival turn ${selectedUnit.entry_turn}`}
              </span>
              <span>
                {retreatContext(selectedUnit.id) !== null
                  ? "Retreat pending: drag this stack to the first empty hex"
                  : advanceContext(selectedUnit.id) !== null
                    ? "Advance pending: drag to a highlighted hex or the decline tray"
                    : selectedSingle
                      ? "Single-counter mode: drag this counter alone; turn off One counter to rejoin its stack"
                      : `Movement remaining: ${movementAllowance(selectedIds())} (stack limit)`}
              </span>
              <span>
                {selectedUnit.strength} strength ·{" "}
                {selectedUnit.steps_remaining} step
                {selectedUnit.steps_remaining === 1 ? "" : "s"}
              </span>
            </div>
          )}
        </div>
        <div className="drag-guidance">
          <strong>Board drag controls</strong>
          <span>No hex number entry is required.</span>
        </div>
        <p
          aria-live="polite"
          className={error ? "move-error" : "move-status"}
          id="move-status"
        >
          {error ??
            movementNotice ??
            (disabled
              ? "Waiting for the authoritative server."
              : "Drag a stack to move it together. Hold Ctrl or turn on One counter before dragging to move only one counter. Combat retreats, advances, and declined advances are also resolved on the board.")}
        </p>
      </aside>
      {mandatory &&
      selectedUnit?.location &&
      selectedUnit.side === seat &&
      state.phase === "movement" &&
      state.active_side === seat ? (
        <MovementControls
          key={`${state.game_id}:${state.version}:${selectedUnit.location}`}
          state={state}
          seat={seat}
          source={selectedUnit.location}
          ids={selectedIds()}
          disabled={disabled}
          onExit={onExit}
          onSelect={(ids) => {
            setSelectedGroup({ source: selectedUnit.location!, ids });
            setSelectedUnitId(ids[0]!);
            setSelectedSingle(false);
            setSingleCounterMode(false);
            setMovementNotice(
              "Group selected; no movement has been committed.",
            );
          }}
        />
      ) : null}
    </section>
  );
}
