import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  adjacentHexes,
  automaticCombatResolution,
  combatOpportunities,
  defenderCombatModifier,
  RULESET_VERSION,
  MANDATORY_RULESET_VERSION,
  terrainDefenseModifier,
  type CombatState,
  type GameState,
  type HexCoordinate,
  type UnitState,
} from "@gettysburg/game";
import { BOARD_TERRAIN, FOREST_LINKS, HILL_LINKS } from "./terrain";
import { ROAD_LINKS, RAIL_LINKS, STREAM_CROSSINGS } from "./terrain-edges";
import { SCENARIO_UNITS } from "./scenario";
import { coordinateToPoint, pointToCoordinate } from "./board";

function counter(
  id: string,
  location: HexCoordinate,
  side: UnitState["side"],
): UnitState {
  return {
    id,
    location,
    side,
    combat: 3,
    entry_hexes: [],
    entry_turn: null,
    kind: "infantry",
    label: id,
    movement: 5,
    organization: "test",
    reduced_combat: 2,
    status: "deployed",
    steps_remaining: 2,
    strength: "full",
  };
}

function battle(
  attacker: HexCoordinate,
  defenders: HexCoordinate[],
  rulesetVersion: string = RULESET_VERSION,
): GameState {
  return {
    active_side: "confederate",
    combats: {},
    content_revision: "test",
    event_sequence: 0,
    game_id: "test",
    night: false,
    objectives: {},
    phase: "combat",
    ruleset_version: rulesetVersion,
    terrain: BOARD_TERRAIN,
    turn: 1,
    version: 0,
    victory: { confederate: 0, union: 0, status: "in-progress" },
    units: Object.fromEntries(
      [
        counter("a", attacker, "confederate"),
        ...defenders.map((c, i) => counter(`d${i}`, c, "union")),
      ].map((u) => [u.id, u]),
    ),
  };
}

describe("owner-approved terrain content", () => {
  it("matches all 253 approved worksheet values and round-trips every coordinate", () => {
    const source = readFileSync(
      new URL(
        "../../../docs/references/TERRAIN_ADJUSTMENTS.md",
        import.meta.url,
      ),
      "utf8",
    );
    const rows = source
      .split("## Coordinate review table")[1]!
      .split("\n")
      .filter((l) => /^\| `[A-W]-/.test(l));
    expect(rows).toHaveLength(253);
    expect(Object.keys(BOARD_TERRAIN)).toHaveLength(253);
    for (const line of rows) {
      const fields = line
        .split("|")
        .slice(1, -1)
        .map((s) => s.trim());
      const coordinate = fields[0]!
        .replaceAll("`", "")
        .replace("-", "") as HexCoordinate;
      expect(fields[5]).toMatch(/^\[x\s*\]$/);
      expect(BOARD_TERRAIN[coordinate].defense).toBe(Number(fields[3]));
      expect(BOARD_TERRAIN[coordinate].woods).toBe(fields[2]!.includes("wood"));
      expect(pointToCoordinate(coordinateToPoint(coordinate))).toBe(coordinate);
    }
  });

  it.each(
    [FOREST_LINKS, HILL_LINKS, ROAD_LINKS, RAIL_LINKS, STREAM_CROSSINGS].map(
      (links) => ({ links }),
    ),
  )("has only unique valid adjacent edge pairs", ({ links }) => {
    const seen = new Set<string>();
    for (const [a, b] of links) {
      expect(adjacentHexes(a)).toContain(b);
      const key = [a, b].sort().join(":");
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("does not connect isolated adjacent woods and does connect explicit paths", () => {
    expect(BOARD_TERRAIN.B1.forest_region).not.toBe(
      BOARD_TERRAIN.B2.forest_region,
    );
    expect(BOARD_TERRAIN.A1.forest_region).toBe(BOARD_TERRAIN.C1.forest_region);
    for (const [a, b] of FOREST_LINKS) {
      expect(BOARD_TERRAIN[a].woods && BOARD_TERRAIN[b].woods).toBe(true);
      expect(BOARD_TERRAIN[a].forest_region).toBe(
        BOARD_TERRAIN[b].forest_region,
      );
    }
  });

  it("keeps every reinforcement entry on the new board edge", () => {
    for (const unit of SCENARIO_UNITS)
      for (const entry of unit.entry_hexes) {
        expect(adjacentHexes(entry).length).toBeLessThan(6);
      }
  });
});

describe.each([RULESET_VERSION, MANDATORY_RULESET_VERSION])(
  "terrain defense per skirmish: %s",
  (rulesetVersion) => {
    it.each([
      ["A2", ["A4"], 2],
      ["A1", ["C1"], 0],
      ["B1", ["B2"], 2],
      ["A2", ["A4", "A5"], 2],
      ["A4", ["A5", "B2"], 2],
      ["D5", ["F5"], 2],
      ["G6", ["F5"], 2],
      ["F6", ["F5"], 0],
      ["A2", ["G6"], 4],
      ["A2", ["A1"], 2],
      ["B1", ["A1"], 2],
      ["K6", ["L6"], 0],
      ["A2", ["O7"], 1],
      ["A2", ["A4", "G6"], 4],
    ] as const)(
      "attack from %s against %j gives terrain %i",
      (a, ds, expected) => {
        const state = battle(a, [...ds], rulesetVersion);
        expect(
          terrainDefenseModifier(
            state,
            ["a"],
            ds.map((_, i) => `d${i}`),
          ),
        ).toBe(expected);
      },
    );

    it("only participating attackers cancel terrain; only participating defenders contribute", () => {
      const state = battle("A2", ["A4", "G6"], rulesetVersion);
      const extra = {
        ...state,
        units: { ...state.units, extra: counter("extra", "A5", "confederate") },
      };
      expect(terrainDefenseModifier(extra, ["a"], ["d0"])).toBe(2);
      expect(terrainDefenseModifier(extra, ["a", "extra"], ["d0"])).toBe(0);
      expect(terrainDefenseModifier(extra, ["a"], ["d1"])).toBe(4);
    });

    it("caps unit and terrain modifiers together and ignores duplicate defending IDs for terrain", () => {
      const state = battle("A2", ["A4", "A5", "A6"], rulesetVersion);
      expect(defenderCombatModifier(state, ["a"], ["d0", "d1", "d2"])).toBe(10);
      expect(terrainDefenseModifier(state, ["a"], ["d0", "d0"])).toBe(2);
    });

    it("uses the same total for discovery, preview, and automatic resolution", () => {
      const state = battle("B1", ["B2"], rulesetVersion);
      expect(
        combatOpportunities(state, "confederate")[0]?.defender_modifier,
      ).toBe(5);
      const combat: CombatState = {
        id: "test",
        attackers: ["a"],
        defenders: ["d0"],
        attacker_loss_allocated: false,
        attacker_retreated: false,
        defender_loss_allocated: false,
        defender_retreated: false,
        confirmation: null,
        pending_choice: null,
        rolls: { attacker: 5, defender: 5 },
        status: "awaiting_result_confirmation",
      };
      const resolution = automaticCombatResolution(state, combat)!;
      expect(resolution).toMatchObject({
        attacker_total: 8,
        defender_total: 10,
        margin: 2,
        confirmation: { defender_modifier: 5, result: "defender_win" },
      });
      const afterRetreat = {
        ...state,
        units: {
          ...state.units,
          d0: {
            ...state.units.d0!,
            location: "A2" as const,
            strength: "reduced" as const,
          },
        },
      };
      expect(
        automaticCombatResolution(afterRetreat, {
          ...combat,
          confirmation: resolution.confirmation,
        }),
      ).toEqual(resolution);
    });
  },
);
