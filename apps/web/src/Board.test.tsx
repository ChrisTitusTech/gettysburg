import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BOARD_VIEW_BOX, coordinateToPoint } from "@gettysburg/content";
import {
  adjacentHexes,
  MANDATORY_RULESET_VERSION,
  type GameState,
  type HexCoordinate,
} from "@gettysburg/game";
import { describe, expect, it, vi } from "vitest";

import { Board } from "./Board";
import { BOARD_ARTWORK_BOUNDS } from "./BoardTerrain";

const state: GameState = {
  active_side: "confederate",
  combats: {},
  content_revision: "phase-1-fixture-v1",
  event_sequence: 0,
  game_id: "11111111-1111-4111-8111-111111111111",
  night: false,
  objectives: {},
  phase: "movement",
  ruleset_version: "phase-1-rules-v1",
  turn: 1,
  units: {
    "fixture-confederate-1": {
      combat: 3,
      entry_hexes: [],
      entry_turn: null,
      id: "fixture-confederate-1",
      kind: "infantry",
      label: "Confederate fixture counter",
      location: "F5",
      movement: 5,
      organization: "fixture",
      side: "confederate",
      status: "deployed",
      steps_remaining: 2,
      strength: "full",
    },
    "fixture-union-1": {
      combat: 3,
      entry_hexes: [],
      entry_turn: null,
      id: "fixture-union-1",
      kind: "infantry",
      label: "Union fixture counter",
      location: "P7",
      movement: 5,
      organization: "fixture",
      side: "union",
      status: "deployed",
      steps_remaining: 2,
      strength: "full",
    },
  },
  version: 0,
  victory: {
    confederate: 0,
    status: "in-progress",
    union: 0,
  },
};

it("lets a read-only viewer inspect either side without sending commands", async () => {
  const onMove = vi.fn();
  const user = userEvent.setup();
  render(<Board readOnly seat="confederate" state={state} onMove={onMove} />);
  for (const name of ["Board controls", "Board destinations", "Counters"]) {
    expect(screen.getByRole("group", { name })).toBeVisible();
  }
  const opponent = screen.getByRole("button", {
    name: /Union fixture counter, P7, selectable/,
  });
  opponent.focus();
  await user.keyboard("{Enter}");
  expect(screen.getByText("Both sides (read-only)")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: /Move selected counters/ }),
  ).not.toBeInTheDocument();
  for (const hex of document.querySelectorAll(".hex")) {
    expect(hex).not.toHaveAttribute("role");
    expect(hex).not.toHaveAttribute("aria-label");
    expect(hex).toHaveAttribute("tabindex", "-1");
  }
  await user.click(document.querySelector('[data-coordinate="O7"]')!);
  expect(onMove).not.toHaveBeenCalled();
  expect(
    screen.getByText("Read-only history; no commands are sent."),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "One counter" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Fit" }));
  expect(screen.getByLabelText("Current zoom")).toHaveTextContent("100%");
});

function prepareBoardPointer(
  container: HTMLElement,
  coordinate: HexCoordinate,
) {
  return prepareBoardPoint(container, coordinateToPoint(coordinate));
}

it("keeps replay hexes pannable after inspecting a counter", () => {
  const onMove = vi.fn();
  const { container } = render(
    <Board readOnly seat="union" state={state} onMove={onMove} />,
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: /Confederate fixture counter, F5, selectable/,
    }),
  );
  const { svg } = prepareBoardPointer(container, "J5");
  const before = svg.getAttribute("viewBox");
  fireEvent.pointerDown(container.querySelector('[data-coordinate="J5"]')!, {
    button: 0,
    pointerId: 1,
    clientX: 500,
    clientY: 300,
  });
  fireEvent.pointerMove(svg, { pointerId: 1, clientX: 560, clientY: 330 });
  fireEvent.pointerUp(svg, { pointerId: 1 });
  expect(svg.getAttribute("viewBox")).not.toBe(before);
  expect(onMove).not.toHaveBeenCalled();
});

it.each(["union", "confederate"] as const)(
  "marks %s retreat and advance choices in read-only history",
  (side) => {
    const unitId = `fixture-${side}-1`;
    const combatId = "22222222-2222-4222-8222-222222222222";
    const recorded: GameState = {
      ...state,
      phase: "combat",
      combats: {
        [combatId]: {
          id: combatId,
          attackers: ["fixture-confederate-1"],
          defenders: ["fixture-union-1"],
          attacker_loss_allocated: true,
          defender_loss_allocated: true,
          attacker_retreated: false,
          defender_retreated: false,
          confirmation: null,
          rolls: { attacker: 6, defender: 3 },
          status: "pending_choice",
          pending_choice: { kind: "retreat", side, unit_ids: [unitId] },
        },
      },
    };
    const onRetreat = vi.fn();
    const onAdvance = vi.fn();
    const { container, rerender } = render(
      <Board
        readOnly
        seat="union"
        state={recorded}
        onMove={vi.fn()}
        onRetreat={onRetreat}
        onAdvance={onAdvance}
      />,
    );
    expect(container.querySelector(`[data-unit-id="${unitId}"]`)).toHaveClass(
      "retreat-required",
    );
    const advance: GameState = {
      ...recorded,
      combats: {
        [combatId]: {
          ...recorded.combats[combatId]!,
          pending_choice: {
            kind: "advance",
            side,
            eligible_unit_ids: [unitId],
            destination_hexes: ["G5"],
          },
        },
      },
    };
    rerender(
      <Board
        readOnly
        seat="union"
        state={advance}
        onMove={vi.fn()}
        onRetreat={onRetreat}
        onAdvance={onAdvance}
      />,
    );
    expect(container.querySelector(`[data-unit-id="${unitId}"]`)).toHaveClass(
      "advance-eligible",
    );
    fireEvent.click(container.querySelector(`[data-unit-id="${unitId}"]`)!);
    fireEvent.click(container.querySelector('[data-coordinate="G5"]')!);
    expect(onRetreat).not.toHaveBeenCalled();
    expect(onAdvance).not.toHaveBeenCalled();
    expect(
      container.querySelector(".advance-decline-target"),
    ).not.toBeInTheDocument();
  },
);

function prepareBoardPoint(
  container: HTMLElement,
  target: { readonly x: number; readonly y: number },
) {
  const svg = container.querySelector(".board-svg")!;
  Object.defineProperty(svg, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      bottom: BOARD_VIEW_BOX.height,
      height: BOARD_VIEW_BOX.height,
      left: 0,
      right: BOARD_VIEW_BOX.width,
      top: 0,
      width: BOARD_VIEW_BOX.width,
      x: 0,
      y: 0,
    }),
  });
  const zoom = 1.15;
  const viewWidth = BOARD_VIEW_BOX.width / zoom;
  const viewHeight = BOARD_VIEW_BOX.height / zoom;
  const viewX = (BOARD_VIEW_BOX.width - viewWidth) / 2;
  const viewY = (BOARD_VIEW_BOX.height - viewHeight) / 2;
  return {
    clientX: ((target.x - viewX) / viewWidth) * BOARD_VIEW_BOX.width,
    clientY: ((target.y - viewY) / viewHeight) * BOARD_VIEW_BOX.height,
    svg,
  };
}

describe("Board", () => {
  it("continues the active pair without picking up a stationary friendly counter", () => {
    const onMove = vi.fn();
    const infantry = state.units["fixture-confederate-1"]!;
    const ids = [infantry.id, "general"];
    const mandatory: GameState = {
      ...state,
      ruleset_version: MANDATORY_RULESET_VERSION,
      terrain: {},
      movement_edges: { roads: [], railroads: [], streams: [] },
      normal_movement: {
        active_unit_ids: ids,
        closed_unit_ids: [],
        bonus_unit_ids: [infantry.id],
      },
      units: {
        ...state.units,
        general: {
          ...infantry,
          id: "general",
          label: "General",
          kind: "general",
          combat: null,
        },
        friend: { ...infantry, id: "friend", label: "Stationary friend" },
      },
    };
    const { container } = render(
      <Board onMove={onMove} seat="confederate" state={mandatory} />,
    );
    fireEvent.keyDown(
      screen.getByRole("button", {
        name: /Confederate fixture counter, F5, selectable/,
      }),
      { key: "Enter" },
    );
    fireEvent.click(container.querySelector('[data-coordinate="G5"]')!);
    expect(onMove).toHaveBeenCalledWith(ids, "G5");
  });

  it("does not submit a drag that became disabled before release", () => {
    const onMove = vi.fn();
    const { container, rerender } = render(
      <Board onMove={onMove} seat="confederate" state={state} />,
    );
    const point = prepareBoardPointer(container, "G5");
    fireEvent.pointerDown(
      screen.getByRole("button", {
        name: /Confederate fixture counter, F5, selectable/,
      }),
      { button: 0, pointerId: 1 },
    );
    fireEvent.pointerMove(point.svg, {
      pointerId: 1,
      clientX: point.clientX,
      clientY: point.clientY,
    });
    rerender(
      <Board disabled onMove={onMove} seat="confederate" state={state} />,
    );
    fireEvent.pointerUp(point.svg, { pointerId: 1 });
    expect(onMove).not.toHaveBeenCalled();
    expect(
      screen.getByText("Waiting for the authoritative server."),
    ).toBeInTheDocument();
  });

  it("uses half-point road costs for mandatory click movement", async () => {
    const onMove = vi.fn();
    const mandatory: GameState = {
      ...state,
      ruleset_version: MANDATORY_RULESET_VERSION,
      terrain: {},
      movement_edges: {
        roads: [
          ["F5", "F4"],
          ["F4", "F3"],
        ],
        railroads: [],
        streams: [],
      },
      units: {
        ...state.units,
        "fixture-confederate-1": {
          ...state.units["fixture-confederate-1"]!,
          movement_spent: 4,
        },
      },
    };
    const { container } = render(
      <Board onMove={onMove} seat="confederate" state={mandatory} />,
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: /Confederate fixture counter, F5, selectable/,
      }),
    );
    fireEvent.click(container.querySelector('[data-coordinate="F3"]')!);
    expect(onMove).toHaveBeenCalledWith(["fixture-confederate-1"], "F3");
    expect(
      screen.getByText("Submitting 1 movement point to F3."),
    ).toBeInTheDocument();
  });

  it("rejects mandatory clicks whose terrain cost exceeds the remaining budget", async () => {
    const onMove = vi.fn();
    const mandatory: GameState = {
      ...state,
      ruleset_version: MANDATORY_RULESET_VERSION,
      terrain: {
        F4: {
          kind: "woods",
          woods: true,
          defense: 2,
          hill_defense: 0,
          forest_region: null,
          hill_region: null,
        },
      },
      movement_edges: { roads: [], railroads: [], streams: [] },
      units: {
        ...state.units,
        "fixture-confederate-1": {
          ...state.units["fixture-confederate-1"]!,
          movement_spent: 4,
        },
      },
    };
    const { container } = render(
      <Board onMove={onMove} seat="confederate" state={mandatory} />,
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: /Confederate fixture counter, F5, selectable/,
      }),
    );
    fireEvent.click(container.querySelector('[data-coordinate="F4"]')!);
    expect(onMove).not.toHaveBeenCalled();
    expect(
      screen.getByText(/F4 requires 2 movement; this group has 1 remaining/),
    ).toBeInTheDocument();
  });

  it("does not let keyboard movement reopen a finished mandatory activation", () => {
    const onMove = vi.fn();
    const mandatory: GameState = {
      ...state,
      ruleset_version: MANDATORY_RULESET_VERSION,
      terrain: {},
      movement_edges: { roads: [], railroads: [], streams: [] },
      normal_movement: {
        active_unit_ids: [],
        closed_unit_ids: ["fixture-confederate-1"],
        bonus_unit_ids: [],
      },
    };
    const { container } = render(
      <Board onMove={onMove} seat="confederate" state={mandatory} />,
    );
    fireEvent.keyDown(
      screen.getByRole("button", {
        name: /Confederate fixture counter, F5, selectable/,
      }),
      { key: "Enter" },
    );
    fireEvent.keyDown(container.querySelector('[data-coordinate="F4"]')!, {
      key: "Enter",
    });
    expect(onMove).not.toHaveBeenCalled();
    expect(
      screen.getByText(/That unit\/stack move has ended/),
    ).toBeInTheDocument();
  });

  it("selects only the acting seat and sends pointer move intent", async () => {
    const onMove = vi.fn();
    const { container } = render(
      <Board onMove={onMove} seat="confederate" state={state} />,
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: /Confederate fixture counter, F5, selectable/,
      }),
    );
    fireEvent.click(container.querySelector('[data-coordinate="G5"]')!);

    expect(onMove).toHaveBeenCalledWith(["fixture-confederate-1"], "G5");
    expect(
      screen.getByRole("button", { name: /Union fixture counter, P7/ }),
    ).toHaveAttribute("tabindex", "-1");
  });

  it("allows a daytime move into an enemy zone of control to attack", async () => {
    const onMove = vi.fn();
    const attackState: GameState = {
      ...state,
      units: {
        ...state.units,
        "fixture-union-1": {
          ...state.units["fixture-union-1"]!,
          location: "G6",
        },
      },
    };
    const { container } = render(
      <Board onMove={onMove} seat="confederate" state={attackState} />,
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: /Confederate fixture counter, F5, selectable/,
      }),
    );
    fireEvent.click(container.querySelector('[data-coordinate="G5"]')!);

    expect(onMove).toHaveBeenCalledWith(["fixture-confederate-1"], "G5");
  });

  it("supports keyboard counter selection and a board-hex destination", async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    render(
      <Board
        onMove={onMove}
        seat="union"
        state={{ ...state, active_side: "union" }}
      />,
    );
    const counter = screen.getByRole("button", {
      name: /Union fixture counter, P7, selectable/,
    });
    counter.focus();
    await user.keyboard("{Enter}");
    const destination = screen.getByRole("button", {
      name: "Move selected counters to Q7",
    });
    destination.focus();
    await user.keyboard("{Enter}");

    expect(onMove).toHaveBeenCalledWith(["fixture-union-1"], "Q7");
    expect(screen.queryByLabelText("Destination coordinate")).toBeNull();
  });

  it("renders the OOB combat-movement counter face and inspector details", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Board onMove={vi.fn()} seat="union" state={state} />,
    );
    const counter = container.querySelector('[data-unit-id="fixture-union-1"]');

    expect(counter).toHaveAttribute("data-combat", "3");
    expect(counter).toHaveAttribute("data-movement", "5");
    expect(counter).toHaveTextContent("INF");
    expect(counter).toHaveTextContent("3-5");

    await user.click(
      screen.getByRole("button", {
        name: /Union fixture counter, P7, selectable/,
      }),
    );
    expect(screen.getByText(/Combat 3 · Movement 5/)).toBeVisible();
    expect(screen.getByText(/full strength · 2 steps/)).toBeVisible();
  });

  it("shows the reduced combat value consistently on the counter and inspector", async () => {
    const reducedState: GameState = {
      ...state,
      active_side: "union",
      ruleset_version: "phase-2-tabletop-v2",
      units: {
        ...state.units,
        "fixture-union-1": {
          ...state.units["fixture-union-1"]!,
          reduced_combat: 2,
          steps_remaining: 1,
          strength: "reduced",
        },
      },
    };
    const { container } = render(
      <Board onMove={vi.fn()} seat="union" state={reducedState} />,
    );
    const counter = container.querySelector('[data-unit-id="fixture-union-1"]');
    expect(counter).toHaveAttribute("data-combat", "2");

    await userEvent.click(
      screen.getByRole("button", {
        name: /Union fixture counter, P7, selectable/,
      }),
    );
    expect(screen.getByText(/Combat 2 · Movement 5/)).toBeVisible();
  });

  it("rejects a board destination beyond the selected movement allowance", async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    const { container } = render(
      <Board
        onMove={onMove}
        seat="union"
        state={{ ...state, active_side: "union" }}
      />,
    );
    await user.click(
      screen.getByRole("button", {
        name: /Union fixture counter, P7, selectable/,
      }),
    );
    fireEvent.click(container.querySelector('[data-coordinate="A1"]')!);

    expect(onMove).not.toHaveBeenCalled();
    expect(screen.getByText(/movement remaining/)).toBeVisible();
  });

  it("stops a night drag before entering an enemy zone of control", () => {
    const onMove = vi.fn();
    const { container } = render(
      <Board
        onMove={onMove}
        seat="confederate"
        state={{
          ...state,
          night: true,
          turn: 8,
          units: {
            ...state.units,
            "fixture-union-1": {
              ...state.units["fixture-union-1"]!,
              location: "H5",
            },
          },
        }}
      />,
    );
    const counter = container.querySelector(
      '[data-unit-id="fixture-confederate-1"]',
    )!;
    const pointer = prepareBoardPointer(container, "G5");

    fireEvent.pointerDown(counter, { button: 0, pointerId: 9 });
    fireEvent.pointerMove(pointer.svg, {
      clientX: pointer.clientX,
      clientY: pointer.clientY,
      pointerId: 9,
    });

    expect(
      screen.getByText(
        "Night movement stops before an enemy zone of control. Withdraw away from enemy counters.",
      ),
    ).toBeVisible();
    fireEvent.pointerUp(pointer.svg, { pointerId: 9 });
    expect(onMove).not.toHaveBeenCalled();
  });

  it("zooms and returns to its calibrated fit", async () => {
    const user = userEvent.setup();
    render(<Board onMove={vi.fn()} seat="union" state={state} />);
    expect(screen.getByLabelText("Current zoom")).toHaveTextContent("115%");
    await user.click(screen.getByRole("button", { name: "Fit" }));
    await user.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(screen.getByLabelText("Current zoom")).toHaveTextContent("65%");
    await user.click(screen.getByRole("button", { name: "Fit" }));
    expect(screen.getByLabelText("Current zoom")).toHaveTextContent("100%");
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByLabelText("Current zoom")).toHaveTextContent("135%");
    await user.click(screen.getByRole("button", { name: "Fit" }));
    expect(screen.getByLabelText("Current zoom")).toHaveTextContent("100%");
  });

  it("drags along a snapped route capped by remaining movement", () => {
    const onMove = vi.fn();
    const { container } = render(
      <Board onMove={onMove} seat="confederate" state={state} />,
    );
    const svg = container.querySelector(".board-svg")!;
    const counter = container.querySelector(
      '[data-unit-id="fixture-confederate-1"]',
    )!;
    Object.defineProperty(svg, "getBoundingClientRect", {
      value: () => ({
        bottom: BOARD_VIEW_BOX.height,
        height: BOARD_VIEW_BOX.height,
        left: 0,
        right: BOARD_VIEW_BOX.width,
        top: 0,
        width: BOARD_VIEW_BOX.width,
        x: 0,
        y: 0,
      }),
    });
    const zoom = 1.15;
    const viewWidth = BOARD_VIEW_BOX.width / zoom;
    const viewHeight = BOARD_VIEW_BOX.height / zoom;
    const viewX = (BOARD_VIEW_BOX.width - viewWidth) / 2;
    const viewY = (BOARD_VIEW_BOX.height - viewHeight) / 2;
    const target = coordinateToPoint("F11");
    const clientX = ((target.x - viewX) / viewWidth) * BOARD_VIEW_BOX.width;
    const clientY = ((target.y - viewY) / viewHeight) * BOARD_VIEW_BOX.height;

    fireEvent.pointerDown(counter, { button: 0, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX, clientY, pointerId: 1 });

    expect(container.querySelectorAll(".movement-route-step")).toHaveLength(6);
    expect(container.querySelector(".movement-route")).toHaveTextContent(
      "5 / 5",
    );
    expect(counter).toHaveAttribute(
      "transform",
      expect.stringContaining(String(coordinateToPoint("F10").y)),
    );

    fireEvent.pointerUp(svg, { clientX, clientY, pointerId: 1 });
    expect(onMove).toHaveBeenCalledWith(["fixture-confederate-1"], "F10");
  });

  it("moves a whole friendly stack by default and Ctrl-drags one counter", () => {
    const stackedState: GameState = {
      ...state,
      units: {
        ...state.units,
        "fixture-general": {
          ...state.units["fixture-confederate-1"]!,
          combat: null,
          id: "fixture-general",
          kind: "general",
          label: "A. P. Hill",
          movement: 10,
        },
      },
    };
    const stackMove = vi.fn();
    const first = render(
      <Board onMove={stackMove} seat="confederate" state={stackedState} />,
    );
    const firstCounter = first.container.querySelector(
      '[data-unit-id="fixture-confederate-1"]',
    )!;
    const firstPointer = prepareBoardPointer(first.container, "G5");
    fireEvent.pointerDown(firstCounter, { button: 0, pointerId: 2 });
    fireEvent.pointerMove(firstPointer.svg, {
      clientX: firstPointer.clientX,
      clientY: firstPointer.clientY,
      pointerId: 2,
    });
    fireEvent.pointerUp(firstPointer.svg, { pointerId: 2 });
    expect(stackMove).toHaveBeenCalledWith(
      ["fixture-confederate-1", "fixture-general"],
      "G5",
    );
    first.unmount();

    const singleMove = vi.fn();
    const second = render(
      <Board onMove={singleMove} seat="confederate" state={stackedState} />,
    );
    const secondCounter = second.container.querySelector(
      '[data-unit-id="fixture-confederate-1"]',
    )!;
    const secondPointer = prepareBoardPointer(second.container, "G5");
    fireEvent.pointerDown(secondCounter, {
      button: 0,
      ctrlKey: true,
      pointerId: 3,
    });
    fireEvent.pointerMove(secondPointer.svg, {
      clientX: secondPointer.clientX,
      clientY: secondPointer.clientY,
      pointerId: 3,
    });
    fireEvent.pointerUp(secondPointer.svg, { pointerId: 3 });
    expect(singleMove).toHaveBeenCalledWith(["fixture-confederate-1"], "G5");
  });

  it("offers a touch-operable one-counter selection mode", async () => {
    const stackedState: GameState = {
      ...state,
      units: {
        ...state.units,
        "fixture-general": {
          ...state.units["fixture-confederate-1"]!,
          combat: null,
          id: "fixture-general",
          kind: "general",
          label: "A. P. Hill",
          movement: 10,
        },
      },
    };
    const onMove = vi.fn();
    const { container } = render(
      <Board onMove={onMove} seat="confederate" state={stackedState} />,
    );
    const mode = screen.getByRole("button", { name: "One counter" });
    await userEvent.click(mode);
    expect(mode).toHaveAttribute("aria-pressed", "true");

    const counter = container.querySelector(
      '[data-unit-id="fixture-confederate-1"]',
    )!;
    const pointer = prepareBoardPointer(container, "G5");
    fireEvent.pointerDown(counter, {
      button: 0,
      pointerId: 4,
      pointerType: "touch",
    });
    fireEvent.pointerMove(pointer.svg, {
      clientX: pointer.clientX,
      clientY: pointer.clientY,
      pointerId: 4,
      pointerType: "touch",
    });
    fireEvent.pointerUp(pointer.svg, {
      pointerId: 4,
      pointerType: "touch",
    });

    expect(onMove).toHaveBeenCalledWith(["fixture-confederate-1"], "G5");
  });

  it("keeps a Ctrl-selected general detached for a later drag", () => {
    const stackedState: GameState = {
      ...state,
      units: {
        ...state.units,
        "fixture-general": {
          ...state.units["fixture-confederate-1"]!,
          combat: null,
          id: "fixture-general",
          kind: "general",
          label: "A. P. Hill",
          movement: 10,
        },
      },
    };
    const onMove = vi.fn();
    const view = render(
      <Board onMove={onMove} seat="confederate" state={stackedState} />,
    );
    const { container } = view;
    const general = container.querySelector(
      '[data-unit-id="fixture-general"]',
    )!;
    const combatUnit = container.querySelector(
      '[data-unit-id="fixture-confederate-1"]',
    )!;

    fireEvent.click(general, { ctrlKey: true });
    expect(general).toHaveAttribute("aria-pressed", "true");
    expect(combatUnit).toHaveAttribute("aria-pressed", "false");
    expect(container.querySelectorAll(".counter").item(2)).toBe(general);

    const pointer = prepareBoardPointer(container, "G5");
    fireEvent.pointerDown(general, { button: 0, pointerId: 8 });
    fireEvent.pointerMove(pointer.svg, {
      clientX: pointer.clientX,
      clientY: pointer.clientY,
      pointerId: 8,
    });
    fireEvent.pointerUp(pointer.svg, { pointerId: 8 });

    expect(onMove).toHaveBeenCalledWith(["fixture-general"], "G5");

    view.rerender(
      <Board
        onMove={onMove}
        seat="confederate"
        state={{
          ...stackedState,
          units: {
            ...stackedState.units,
            "fixture-general": {
              ...stackedState.units["fixture-general"]!,
              location: "G5",
            },
          },
        }}
      />,
    );
    const originalHex = coordinateToPoint("F5");
    expect(
      container.querySelector('[data-unit-id="fixture-confederate-1"]'),
    ).toHaveAttribute(
      "transform",
      `translate(${originalHex.x} ${originalHex.y})`,
    );
  });

  it("drag-retreats every losing counter from the same stack together", () => {
    const combatId = "22222222-2222-4222-8222-222222222222";
    const retreatTarget = adjacentHexes("M9")[0]!;
    const unionCounter = state.units["fixture-union-1"]!;
    const retreatState: GameState = {
      ...state,
      phase: "combat",
      units: {
        ...state.units,
        devin: { ...unionCounter, id: "devin", label: "Devin", location: "M9" },
        gamble: {
          ...unionCounter,
          id: "gamble",
          label: "Gamble",
          location: "M9",
        },
        buford: {
          ...unionCounter,
          combat: null,
          id: "buford",
          kind: "general",
          label: "Buford",
          location: "M9",
          movement: 10,
        },
      },
      combats: {
        [combatId]: {
          attacker_loss_allocated: false,
          attacker_retreated: false,
          attackers: ["fixture-confederate-1"],
          confirmation: {
            advance_offered: true,
            attacker_losses: 0,
            attacker_modifier: 3,
            attacker_retreat: false,
            defender_losses: 0,
            defender_modifier: 6,
            defender_retreat: true,
            result: "attacker_win",
          },
          defender_loss_allocated: false,
          defender_retreated: false,
          defenders: ["devin", "gamble"],
          id: combatId,
          pending_choice: {
            kind: "retreat",
            side: "union",
            unit_ids: ["devin", "gamble", "buford"],
          },
          rolls: { attacker: 8, defender: 1 },
          status: "pending_choice",
        },
      },
    };
    const onRetreat = vi.fn();
    const { container } = render(
      <Board
        onMove={vi.fn()}
        onRetreat={onRetreat}
        seat="union"
        state={retreatState}
      />,
    );
    const counter = container.querySelector('[data-unit-id="devin"]')!;
    const pointer = prepareBoardPointer(container, retreatTarget);
    fireEvent.pointerDown(counter, { button: 0, pointerId: 4 });
    fireEvent.pointerMove(pointer.svg, {
      clientX: pointer.clientX,
      clientY: pointer.clientY,
      pointerId: 4,
    });
    expect(container.querySelector(".movement-route")).toHaveTextContent(
      "Retreat 3 together",
    );
    fireEvent.pointerUp(pointer.svg, { pointerId: 4 });
    expect(onRetreat).toHaveBeenCalledWith(
      combatId,
      ["devin", "gamble", "buford"],
      ["M9", retreatTarget],
    );
    onRetreat.mockClear();
    fireEvent.keyDown(counter, { key: "Enter" });
    fireEvent.keyDown(
      container.querySelector(`[data-coordinate="${retreatTarget}"]`)!,
      { key: "Enter" },
    );
    expect(onRetreat).toHaveBeenCalledWith(
      combatId,
      ["devin", "gamble", "buford"],
      ["M9", retreatTarget],
    );
  });

  it("finds an alternate retreat route around an enemy-occupied hex", () => {
    const combatId = "22222222-2222-4222-8222-222222222222";
    const unionCounter = state.units["fixture-union-1"]!;
    const retreatState: GameState = {
      ...state,
      phase: "combat",
      units: {
        enemy: {
          ...state.units["fixture-confederate-1"]!,
          id: "enemy",
          location: "C2",
        },
        friendly: {
          ...unionCounter,
          id: "friendly",
          location: "C3",
        },
        retreating: {
          ...unionCounter,
          id: "retreating",
          location: "B2",
        },
      },
      combats: {
        [combatId]: {
          attacker_loss_allocated: false,
          attacker_retreated: false,
          attackers: ["enemy"],
          confirmation: {
            advance_offered: true,
            attacker_losses: 0,
            attacker_modifier: 3,
            attacker_retreat: false,
            defender_losses: 0,
            defender_modifier: 3,
            defender_retreat: true,
            result: "attacker_win",
          },
          defender_loss_allocated: false,
          defender_retreated: false,
          defenders: ["retreating"],
          id: combatId,
          pending_choice: {
            kind: "retreat",
            side: "union",
            unit_ids: ["retreating"],
          },
          rolls: { attacker: 8, defender: 1 },
          status: "pending_choice",
        },
      },
    };
    const onRetreat = vi.fn();
    const { container } = render(
      <Board
        onMove={vi.fn()}
        onRetreat={onRetreat}
        seat="union"
        state={retreatState}
      />,
    );
    const counter = container.querySelector('[data-unit-id="retreating"]')!;
    const pointer = prepareBoardPointer(container, "D2");
    fireEvent.pointerDown(counter, { button: 0, pointerId: 41 });
    fireEvent.pointerMove(pointer.svg, {
      clientX: pointer.clientX,
      clientY: pointer.clientY,
      pointerId: 41,
    });
    fireEvent.pointerUp(pointer.svg, { pointerId: 41 });
    expect(onRetreat).toHaveBeenCalledWith(
      combatId,
      ["retreating"],
      ["B2", "C3", "D2"],
    );
  });

  it("drag-advances a stack, Ctrl-advances one, and declines by drag or pointer click", async () => {
    const combatId = "33333333-3333-4333-8333-333333333333";
    const advanceState: GameState = {
      ...state,
      phase: "combat",
      units: {
        ...state.units,
        "fixture-general": {
          ...state.units["fixture-confederate-1"]!,
          combat: null,
          id: "fixture-general",
          kind: "general",
          label: "A. P. Hill",
          movement: 10,
        },
      },
      combats: {
        [combatId]: {
          attacker_loss_allocated: false,
          attacker_retreated: false,
          attackers: ["fixture-confederate-1"],
          confirmation: {
            advance_offered: true,
            attacker_losses: 0,
            attacker_modifier: 3,
            attacker_retreat: false,
            defender_losses: 0,
            defender_modifier: 3,
            defender_retreat: true,
            result: "attacker_win",
          },
          defender_hexes: ["G5"],
          defender_loss_allocated: false,
          defender_retreated: true,
          defenders: ["fixture-union-1"],
          id: combatId,
          pending_choice: {
            destination_hexes: ["G5"],
            eligible_unit_ids: ["fixture-confederate-1", "fixture-general"],
            kind: "advance",
            side: "confederate",
          },
          rolls: { attacker: 8, defender: 1 },
          status: "pending_choice",
        },
      },
    };

    const stackAdvance = vi.fn();
    const first = render(
      <Board
        onAdvance={stackAdvance}
        onMove={vi.fn()}
        seat="confederate"
        state={advanceState}
      />,
    );
    expect(
      first.container.querySelector('[data-advance-coordinate="G5"]'),
    ).toHaveClass("advance-target");
    const firstCounter = first.container.querySelector(
      '[data-unit-id="fixture-confederate-1"]',
    )!;
    const firstPointer = prepareBoardPointer(first.container, "G5");
    fireEvent.pointerDown(firstCounter, { button: 0, pointerId: 5 });
    fireEvent.pointerMove(firstPointer.svg, {
      clientX: firstPointer.clientX,
      clientY: firstPointer.clientY,
      pointerId: 5,
    });
    fireEvent.pointerUp(firstPointer.svg, { pointerId: 5 });
    expect(stackAdvance).toHaveBeenCalledWith(
      combatId,
      ["fixture-confederate-1", "fixture-general"],
      "G5",
    );
    first.unmount();

    const singleAdvance = vi.fn();
    const second = render(
      <Board
        onAdvance={singleAdvance}
        onMove={vi.fn()}
        seat="confederate"
        state={advanceState}
      />,
    );
    const secondCounter = second.container.querySelector(
      '[data-unit-id="fixture-confederate-1"]',
    )!;
    const secondPointer = prepareBoardPointer(second.container, "G5");
    fireEvent.pointerDown(secondCounter, {
      button: 0,
      ctrlKey: true,
      pointerId: 6,
    });
    fireEvent.pointerMove(secondPointer.svg, {
      clientX: secondPointer.clientX,
      clientY: secondPointer.clientY,
      pointerId: 6,
    });
    fireEvent.pointerUp(secondPointer.svg, { pointerId: 6 });
    expect(singleAdvance).toHaveBeenCalledWith(
      combatId,
      ["fixture-confederate-1"],
      "G5",
    );
    second.unmount();

    const declineAdvance = vi.fn();
    const third = render(
      <Board
        onAdvance={declineAdvance}
        onMove={vi.fn()}
        seat="confederate"
        state={advanceState}
      />,
    );
    const thirdCounter = third.container.querySelector(
      '[data-unit-id="fixture-confederate-1"]',
    )!;
    const tray = third.container.querySelector(
      ".advance-decline-target",
    ) as SVGGElement;
    const board = third.container.querySelector(".board-svg") as SVGSVGElement;
    const setPointerCapture = vi.fn();
    Object.defineProperty(board, "setPointerCapture", {
      configurable: true,
      value: setPointerCapture,
    });
    const trayPoint = prepareBoardPoint(third.container, {
      x: Number(tray.dataset.declineX) + Number(tray.dataset.declineWidth) / 2,
      y: Number(tray.dataset.declineY) + Number(tray.dataset.declineHeight) / 2,
    });
    fireEvent.pointerDown(thirdCounter, { button: 0, pointerId: 7 });
    fireEvent.pointerMove(trayPoint.svg, {
      clientX: trayPoint.clientX,
      clientY: trayPoint.clientY,
      pointerId: 7,
    });
    expect(tray).toHaveClass("active");
    fireEvent.pointerUp(trayPoint.svg, { pointerId: 7 });
    expect(declineAdvance).toHaveBeenCalledWith(
      combatId,
      ["fixture-confederate-1", "fixture-general"],
      null,
    );
    declineAdvance.mockClear();
    fireEvent.keyDown(thirdCounter, { key: "Enter" });
    fireEvent.keyDown(
      third.container.querySelector('[data-coordinate="G5"]')!,
      { key: "Enter" },
    );
    expect(declineAdvance).toHaveBeenCalledWith(
      combatId,
      ["fixture-confederate-1", "fixture-general"],
      "G5",
    );
    declineAdvance.mockClear();
    fireEvent.keyDown(tray, { key: "Enter" });
    expect(declineAdvance).toHaveBeenCalledWith(
      combatId,
      ["fixture-confederate-1", "fixture-general"],
      null,
    );
    declineAdvance.mockClear();
    const user = userEvent.setup();
    await user.pointer({ keys: "[MouseLeft]", target: thirdCounter });
    setPointerCapture.mockClear();
    await user.pointer({ keys: "[MouseLeft]", target: tray });
    expect(setPointerCapture).not.toHaveBeenCalled();
    expect(declineAdvance).toHaveBeenCalledWith(
      combatId,
      ["fixture-confederate-1", "fixture-general"],
      null,
    );
  });

  it("renders the approved clean-room battlefield artwork", () => {
    const { container } = render(
      <Board onMove={vi.fn()} seat="union" state={state} />,
    );

    expect(container.querySelector('[data-coordinate="A5"]')).toHaveClass(
      "terrain-woods",
    );
    expect(container.querySelector('[data-coordinate="F6"]')).toHaveClass(
      "terrain-rough-hill",
    );
    for (const coordinate of ["I5", "J5", "M9"]) {
      expect(
        container.querySelector(`[data-coordinate="${coordinate}"]`),
      ).toHaveClass("terrain-clear");
    }
    expect(container.querySelector('[data-coordinate="O7"]')).toHaveClass(
      "terrain-town",
    );
    expect(container.querySelector('[data-coordinate="J6"]')).toHaveClass(
      "terrain-hill",
    );
    expect(container.querySelector('[data-coordinate="W11"]')).toHaveClass(
      "terrain-woods",
    );
    expect(container.querySelectorAll(".hex")).toHaveLength(253);
    expect(container.querySelector(".deluxe-board-art")).toHaveAttribute(
      "data-art-finish",
      "deluxe-raster",
    );
    const artwork = container.querySelector(".board-artwork-image");
    expect(artwork).toHaveAttribute(
      "href",
      expect.stringContaining("gettysburg-board-deluxe.png"),
    );
    expect(artwork).toHaveAttribute("x", String(BOARD_ARTWORK_BOUNDS.x));
    expect(artwork).toHaveAttribute("y", String(BOARD_ARTWORK_BOUNDS.y));
    expect(artwork).toHaveAttribute(
      "width",
      String(BOARD_ARTWORK_BOUNDS.width),
    );
    expect(artwork).toHaveAttribute(
      "height",
      String(BOARD_ARTWORK_BOUNDS.height),
    );
    expect(artwork).toHaveAttribute("preserveAspectRatio", "none");
    expect(container.querySelector("[data-grid-presentation]")).toHaveAttribute(
      "data-grid-presentation",
      "interaction-only",
    );
    expect(container).not.toHaveTextContent(/TIME RECORD TRACK/i);
  });

  it("draws a combat link between adjacent hostile counters", () => {
    const { container } = render(
      <Board
        onMove={vi.fn()}
        seat="confederate"
        state={{
          ...state,
          phase: "combat",
          units: {
            ...state.units,
            "fixture-confederate-1": {
              ...state.units["fixture-confederate-1"]!,
              location: "L8",
            },
            "fixture-confederate-2": {
              ...state.units["fixture-confederate-1"]!,
              id: "fixture-confederate-2",
              label: "Second Confederate fixture counter",
              location: "N8",
            },
            "fixture-union-1": {
              ...state.units["fixture-union-1"]!,
              location: "M9",
            },
          },
        }}
      />,
    );

    expect(container.querySelectorAll(".combat-links line")).toHaveLength(2);
    expect(
      screen.getByLabelText("Combat contact L8 to M9"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Combat contact N8 to M9"),
    ).toBeInTheDocument();
  });

  it("keeps a rejected counter at the confirmed authoritative location", () => {
    render(
      <Board
        error="That fixture hex is occupied."
        onMove={vi.fn()}
        seat="confederate"
        state={state}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: /Confederate fixture counter, F5, selectable/,
      }),
    ).toHaveAttribute(
      "transform",
      expect.stringContaining(String(coordinateToPoint("F5").x)),
    );
    expect(screen.getByText("That fixture hex is occupied.")).toBeVisible();
  });
});
