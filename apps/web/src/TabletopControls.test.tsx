import { fireEvent, render, screen } from "@testing-library/react";
import type { GameState, UnitState } from "@gettysburg/game";
import { describe, expect, it, vi } from "vitest";

import { TabletopControls } from "./TabletopControls";

function gameState(patch: Partial<GameState> = {}): GameState {
  return {
    active_side: "union",
    combats: {},
    content_revision: "test-content-v1",
    event_sequence: 0,
    game_id: "11111111-1111-4111-8111-111111111111",
    night: false,
    objectives: {},
    phase: "movement",
    ruleset_version: "phase-2-tabletop-v2",
    turn: 1,
    units: {},
    version: 0,
    victory: { confederate: 0, status: "in-progress", union: 0 },
    ...patch,
  };
}

describe("TabletopControls phase action", () => {
  it("names the active opposing seat instead of showing a misleading action", () => {
    render(
      <TabletopControls
        disabled={false}
        onCommand={vi.fn()}
        seat="confederate"
        state={gameState()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Waiting for Union player" }),
    ).toBeDisabled();
  });

  it("allows the active seat to end movement", () => {
    render(
      <TabletopControls
        disabled={false}
        onCommand={vi.fn()}
        seat="union"
        state={gameState()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "End movement phase" }),
    ).toBeEnabled();
  });

  it("explains mandatory withdrawal during a night movement phase", () => {
    render(
      <TabletopControls
        disabled={false}
        onCommand={vi.fn()}
        seat="confederate"
        state={gameState({
          active_side: "confederate",
          night: true,
          turn: 8,
        })}
      />,
    );

    expect(
      screen.getByText(
        /Night movement: withdraw every counter from enemy zones of control/i,
      ),
    ).toBeVisible();
  });

  it("names the opposing combat choice that blocks ending the phase", () => {
    const combatId = "22222222-2222-4222-8222-222222222222";
    render(
      <TabletopControls
        disabled={false}
        onCommand={vi.fn()}
        seat="confederate"
        state={gameState({
          active_side: "confederate",
          phase: "combat",
          combats: {
            [combatId]: {
              attacker_loss_allocated: false,
              attacker_retreated: false,
              attackers: ["attacker"],
              confirmation: {
                advance_offered: true,
                attacker_losses: 0,
                attacker_modifier: 10,
                attacker_retreat: false,
                defender_losses: 0,
                defender_modifier: 2,
                defender_retreat: true,
                result: "attacker_win",
              },
              defender_loss_allocated: false,
              defender_retreated: false,
              defenders: ["defender"],
              id: combatId,
              pending_choice: {
                kind: "retreat",
                side: "union",
                unit_ids: ["defender", "general"],
              },
              rolls: { attacker: 1, defender: 8 },
              status: "pending_choice",
            },
          },
        })}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Waiting for Union retreat" }),
    ).toBeDisabled();
  });

  it("opens scheduled reinforcements and explains same-hex entry", () => {
    const reinforcement = (id: string, label: string): UnitState => ({
      combat: 3,
      entry_hexes: ["S1"],
      entry_turn: 2,
      id,
      kind: "infantry",
      label,
      location: null,
      movement: 5,
      organization: "III Corps",
      side: "confederate",
      status: "reinforcement",
      steps_remaining: 2,
      strength: "full",
    });
    render(
      <TabletopControls
        disabled={false}
        onCommand={vi.fn()}
        seat="confederate"
        state={gameState({
          active_side: "confederate",
          turn: 2,
          units: {
            heth: reinforcement("heth", "Heth"),
            pegram: reinforcement("pegram", "Pegram"),
          },
        })}
      />,
    );

    expect(
      screen.getByText("Reinforcements ready (2)").closest("details"),
    ).toHaveAttribute("open");
    expect(
      screen.getByText(/move it clear before entering another counter/i),
    ).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Enter S1" })).toHaveLength(2);
  });

  it("shows detected adjacent stacks with verified combat-factor totals", () => {
    const combatId = "33333333-3333-4333-8333-333333333333";
    const combatUnit = (
      id: string,
      label: string,
      side: UnitState["side"],
      location: NonNullable<UnitState["location"]>,
      combat: number,
    ): UnitState => ({
      combat,
      entry_hexes: [],
      entry_turn: null,
      id,
      kind: "infantry",
      label,
      location,
      movement: 5,
      organization: "test",
      side,
      status: "deployed",
      steps_remaining: 2,
      strength: "full",
    });
    render(
      <TabletopControls
        disabled={false}
        onCommand={vi.fn()}
        seat="confederate"
        state={gameState({
          active_side: "confederate",
          combats: {
            [combatId]: {
              attacker_loss_allocated: false,
              attacker_retreated: false,
              attackers: ["heth", "pegram", "mcintosh", "pender"],
              confirmation: null,
              defender_loss_allocated: false,
              defender_retreated: false,
              defenders: ["devin", "gamble"],
              id: combatId,
              pending_choice: null,
              rolls: { attacker: 5, defender: 5 },
              status: "awaiting_result_confirmation",
            },
          },
          phase: "combat",
          turn: 4,
          units: {
            heth: combatUnit("heth", "Heth", "confederate", "L8", 5),
            pegram: combatUnit("pegram", "Pegram", "confederate", "L8", 2),
            mcintosh: combatUnit(
              "mcintosh",
              "McIntosh",
              "confederate",
              "N8",
              2,
            ),
            pender: combatUnit("pender", "Pender", "confederate", "N8", 4),
            devin: combatUnit("devin", "Devin", "union", "M9", 1),
            gamble: combatUnit("gamble", "Gamble", "union", "M9", 1),
          },
        })}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Automatic skirmishes" }),
    ).toBeVisible();
    expect(
      screen.getByText(
        /Heth \(L8\) \+ Pegram \(L8\) \+ McIntosh \(N8\) \+ Pender \(N8\)/,
      ),
    ).toBeVisible();
    expect(screen.getByText(/Devin \(M9\) \+ Gamble \(M9\)/)).toBeVisible();
    expect(screen.getByText(/Attacker: die 5 \+ units \+10 =/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Confirm skirmish result" }),
    ).toBeEnabled();
  });

  it("shows and confirms the automatic result from both server dice", () => {
    const combatId = "22222222-2222-4222-8222-222222222222";
    const combatUnit = (
      id: string,
      side: UnitState["side"],
      location: NonNullable<UnitState["location"]>,
      combat: number,
    ): UnitState => ({
      combat,
      entry_hexes: [],
      entry_turn: null,
      id,
      kind: "infantry",
      label: id,
      location,
      movement: 5,
      organization: "test",
      side,
      status: "deployed",
      steps_remaining: 2,
      strength: "full",
    });
    const onCommand = vi.fn();
    const combat = {
      attacker_loss_allocated: false,
      attacker_retreated: false,
      attackers: ["heth", "pegram", "mcintosh", "pender"],
      confirmation: null,
      defender_loss_allocated: false,
      defender_retreated: false,
      defenders: ["devin", "gamble"],
      id: combatId,
      pending_choice: null,
      rolls: { attacker: 1, defender: 8 },
      status: "awaiting_result_confirmation" as const,
    };
    const state = gameState({
      active_side: "confederate",
      combats: { [combatId]: combat },
      phase: "combat",
      units: {
        heth: combatUnit("heth", "confederate", "L8", 5),
        pegram: combatUnit("pegram", "confederate", "L8", 2),
        mcintosh: combatUnit("mcintosh", "confederate", "N8", 2),
        pender: combatUnit("pender", "confederate", "N8", 4),
        devin: combatUnit("devin", "union", "M9", 1),
        gamble: combatUnit("gamble", "union", "M9", 1),
      },
    });
    const view = render(
      <TabletopControls
        disabled={false}
        onCommand={onCommand}
        seat="confederate"
        state={state}
      />,
    );

    expect(screen.getByText("Server dice: 1 - 8")).toBeVisible();
    expect(
      screen.getByText(/Attacker: die 1 \+ units \+10 =/),
    ).toHaveTextContent("11");
    expect(
      screen.getByText(/Defender: die 8 \+ units \+2 =/),
    ).toHaveTextContent("10");
    expect(
      screen.getByText(
        "Attacker wins by 1. Defender retreats and takes 0 step losses.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Result" })).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Confirm skirmish result" }),
    );
    expect(onCommand).toHaveBeenCalledWith("confirmCombatResult", {
      combat_id: combatId,
    });

    view.rerender(
      <TabletopControls
        disabled={false}
        onCommand={onCommand}
        seat="union"
        state={{
          ...state,
          combats: {
            [combatId]: {
              ...combat,
              confirmation: {
                advance_offered: true,
                attacker_losses: 0,
                attacker_modifier: 10,
                attacker_retreat: false,
                defender_losses: 0,
                defender_modifier: 2,
                defender_retreat: true,
                result: "attacker_win",
              },
              pending_choice: {
                kind: "retreat",
                side: "union",
                unit_ids: ["devin", "gamble"],
              },
              status: "pending_choice",
            },
          },
        }}
      />,
    );
    expect(screen.getByText("Confirmed result")).toBeVisible();
    expect(screen.getByText("Retreat 2 counter(s) on board")).toBeVisible();
    expect(screen.queryByLabelText("Retreat destination")).toBeNull();

    view.rerender(
      <TabletopControls
        disabled={false}
        onCommand={onCommand}
        seat="confederate"
        state={{
          ...state,
          combats: {
            [combatId]: {
              ...combat,
              defender_hexes: ["M9"],
              pending_choice: {
                destination_hexes: ["M9"],
                eligible_unit_ids: ["heth", "pegram"],
                kind: "advance",
                side: "confederate",
              },
              status: "pending_choice",
            },
          },
        }}
      />,
    );
    expect(screen.getByText("Advance or decline on the board")).toBeVisible();
    expect(screen.queryByLabelText("Advance destination")).toBeNull();
    expect(screen.queryByRole("button", { name: "Decline" })).toBeNull();
  });
});
