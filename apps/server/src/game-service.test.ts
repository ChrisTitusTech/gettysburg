import { randomUUID } from "node:crypto";

import {
  COMMAND_SCHEMA_VERSION,
  type GameplayCommand,
  type HexCoordinate,
  type HostManagementCommand,
  type MoveUnitCommand,
} from "@gettysburg/game";
import { describe, expect, it } from "vitest";

import {
  canonicalMoveCommand,
  canonicalMoveCommandHash,
  FIXED_CANONICAL_COMMAND,
  InMemoryGameService,
  ServiceError,
  type StoredAction,
} from "./game-service.js";

function moveCommand(
  gameId: string,
  expectedVersion: number,
  unitId: string,
  destination: MoveUnitCommand["payload"]["destination"],
  commandId = randomUUID(),
): MoveUnitCommand {
  return {
    command_id: commandId,
    command_name: "moveUnit",
    expected_version: expectedVersion,
    game_id: gameId,
    payload: { destination, unit_id: unitId },
    schema: COMMAND_SCHEMA_VERSION,
  };
}

function endPhaseCommand(
  gameId: string,
  expectedVersion: number,
  commandId = randomUUID(),
): GameplayCommand {
  return {
    command_id: commandId,
    command_name: "endPhase",
    expected_version: expectedVersion,
    game_id: gameId,
    payload: {},
    schema: COMMAND_SCHEMA_VERSION,
  };
}

function surrenderSeatCommand(
  gameId: string,
  expectedVersion: number,
  commandId = randomUUID(),
): GameplayCommand {
  return {
    command_id: commandId,
    command_name: "surrenderSeat",
    expected_version: expectedVersion,
    game_id: gameId,
    payload: {},
    schema: COMMAND_SCHEMA_VERSION,
  };
}

function hostCommand(
  gameId: string,
  expectedVersion: number,
  commandName: HostManagementCommand["command_name"],
  payload: HostManagementCommand["payload"],
  commandId = randomUUID(),
): HostManagementCommand {
  return {
    command_id: commandId,
    command_name: commandName,
    expected_version: expectedVersion,
    game_id: gameId,
    payload,
    schema: COMMAND_SCHEMA_VERSION,
  } as HostManagementCommand;
}

function expectServiceError(action: () => unknown, code: string) {
  expect(action).toThrowError(ServiceError);
  try {
    action();
  } catch (error) {
    expect(error).toMatchObject({ code });
  }
}

describe("canonical command input", () => {
  it("matches the fixed version-1 bytes and digest", () => {
    expect(canonicalMoveCommand(FIXED_CANONICAL_COMMAND)).toBe(
      '{"command_name":"moveUnit","payload":{"destination":"A1","unit_id":"u1"},"schema":"gettysburg-command/v1"}',
    );
    expect(canonicalMoveCommandHash(FIXED_CANONICAL_COMMAND)).toBe(
      "dd5d6dabdba0e9a402f023eb97068bf1785d9ad62e7613d7035fb73d17ca9368",
    );
  });

  it("is independent of input key ordering", () => {
    const reordered = {
      schema: COMMAND_SCHEMA_VERSION,
      payload: { unit_id: "u1", destination: "A1" },
      game_id: FIXED_CANONICAL_COMMAND.game_id,
      expected_version: 0,
      command_name: "moveUnit",
      command_id: FIXED_CANONICAL_COMMAND.command_id,
    } as MoveUnitCommand;

    expect(canonicalMoveCommandHash(reordered)).toBe(
      canonicalMoveCommandHash(FIXED_CANONICAL_COMMAND),
    );
  });
});

describe("in-memory game lifecycle", () => {
  it("fails closed when a saved game references an unavailable version pair", () => {
    const original = new InMemoryGameService();
    const game = original.createGame("union");
    const snapshot = original.exportSnapshot();
    const unavailable = {
      ...snapshot,
      games: snapshot.games.map(
        ([gameId, record]): (typeof snapshot.games)[number] => [
          gameId,
          gameId === game.gameId
            ? {
                ...record,
                state: { ...record.state, ruleset_version: "missing-v99" },
              }
            : record,
        ],
      ),
    };
    const restored = new InMemoryGameService({ snapshot: unavailable });

    expect(restored.isVersionRegistryReady()).toBe(false);
    expectServiceError(
      () => restored.getGameState(game.gameId),
      "version_unavailable",
    );
  });

  it("starts turn 1 with Union because Confederate has no available units", () => {
    const service = new InMemoryGameService();
    const game = service.createGame("confederate");

    expect(service.getGameState(game.gameId)).toMatchObject({
      active_side: "union",
      event_sequence: 0,
      phase: "movement",
      turn: 1,
      version: 0,
    });
  });

  it("upgrades a saved empty Confederate opening to Union movement", () => {
    const original = new InMemoryGameService();
    const game = original.createGame("confederate");
    const snapshot = original.exportSnapshot();
    const legacySnapshot = {
      ...snapshot,
      games: snapshot.games.map(
        ([gameId, record]): (typeof snapshot.games)[number] => [
          gameId,
          gameId === game.gameId
            ? {
                ...record,
                state: {
                  ...record.state,
                  active_side: "confederate",
                  event_sequence: 1,
                  phase: "combat",
                  version: 1,
                },
              }
            : record,
        ],
      ),
    };

    const restored = new InMemoryGameService({ snapshot: legacySnapshot });
    expect(restored.getGameState(game.gameId)).toMatchObject({
      active_side: "union",
      event_sequence: 1,
      phase: "movement",
      version: 1,
    });
  });

  it("upgrades a saved retreat choice to include its whole original stack", () => {
    const original = new InMemoryGameService();
    const game = original.createGame("confederate");
    const snapshot = original.exportSnapshot();
    const combatId = "22222222-2222-4222-8222-222222222222";
    const upgradedSnapshot = {
      ...snapshot,
      games: snapshot.games.map(
        ([gameId, record]): (typeof snapshot.games)[number] => [
          gameId,
          gameId === game.gameId
            ? {
                ...record,
                state: {
                  ...record.state,
                  active_side: "confederate",
                  phase: "combat",
                  turn: 4,
                  combats: {
                    [combatId]: {
                      attacker_loss_allocated: false,
                      attacker_retreated: false,
                      attackers: ["c-heth"],
                      confirmation: {
                        advance_offered: true,
                        attacker_losses: 0,
                        attacker_modifier: 5,
                        attacker_retreat: false,
                        defender_losses: 0,
                        defender_modifier: 2,
                        defender_retreat: true,
                        result: "attacker_win",
                      },
                      defender_loss_allocated: false,
                      defender_retreated: false,
                      defenders: ["u-devin", "u-gamble"],
                      id: combatId,
                      pending_choice: {
                        kind: "retreat",
                        side: "union",
                        unit_ids: ["u-devin", "u-gamble"],
                      },
                      rolls: { attacker: 8, defender: 1 },
                      status: "pending_choice",
                    },
                  },
                  units: {
                    ...record.state.units,
                    "u-buford": {
                      ...record.state.units["u-buford"]!,
                      location: "M9",
                      status: "deployed",
                    },
                    "u-devin": {
                      ...record.state.units["u-devin"]!,
                      location: "M9",
                      status: "deployed",
                    },
                    "u-gamble": {
                      ...record.state.units["u-gamble"]!,
                      location: "M9",
                      status: "deployed",
                    },
                  },
                },
              }
            : record,
        ],
      ),
    };

    const restored = new InMemoryGameService({ snapshot: upgradedSnapshot });
    expect(
      restored.getGameState(game.gameId).combats[combatId]?.pending_choice,
    ).toMatchObject({
      kind: "retreat",
      side: "union",
      unit_ids: ["u-devin", "u-gamble", "u-buford"],
    });
    expect(
      restored.getGameState(game.gameId).combats[combatId]?.defender_hexes,
    ).toEqual(["M9"]);
    expect(restored.getGameState(game.gameId).version).toBe(0);
  });

  it("restores drag-only advance data from a legacy retreat action", () => {
    const original = new InMemoryGameService();
    const game = original.createGame("confederate");
    const snapshot = original.exportSnapshot();
    const combatId = "33333333-3333-4333-8333-333333333333";
    const retreatAction = {
      authorizingId: "legacy-seat",
      authorizingType: "seat",
      authorizingVersion: 1,
      canonicalRequestHash: "legacy-hash",
      canonicalizationVersion: "jcs-v1",
      commandId: "44444444-4444-4444-8444-444444444444",
      commandName: "retreatStack",
      contentRevision: "gettysburg-source-cards-v1",
      expectedVersion: 4,
      kind: "gameplay",
      operatorRequestId: null,
      payload: {
        combat_id: combatId,
        path: ["M9", "M10"],
        unit_ids: ["u-devin", "u-gamble", "u-buford"],
      },
      result: null,
      resultingVersion: 5,
      rulesetVersion: "phase-2-tabletop-v1",
      sequence: 5,
    } satisfies StoredAction;
    const legacySnapshot = {
      ...snapshot,
      games: snapshot.games.map(
        ([gameId, record]): (typeof snapshot.games)[number] => [
          gameId,
          gameId === game.gameId
            ? {
                ...record,
                actions: [...record.actions, retreatAction],
                state: {
                  ...record.state,
                  active_side: "confederate",
                  phase: "combat",
                  turn: 4,
                  combats: {
                    [combatId]: {
                      attacker_loss_allocated: false,
                      attacker_retreated: false,
                      attackers: ["c-heth"],
                      confirmation: {
                        advance_offered: true,
                        attacker_losses: 0,
                        attacker_modifier: 5,
                        attacker_retreat: false,
                        defender_losses: 0,
                        defender_modifier: 2,
                        defender_retreat: true,
                        result: "attacker_win",
                      },
                      defender_loss_allocated: false,
                      defender_retreated: true,
                      defenders: ["u-devin", "u-gamble"],
                      id: combatId,
                      pending_choice: {
                        eligible_unit_ids: ["c-heth"],
                        kind: "advance",
                        side: "confederate",
                      },
                      rolls: { attacker: 8, defender: 1 },
                      status: "pending_choice",
                    },
                  },
                  units: {
                    ...record.state.units,
                    "c-a-p-hill": {
                      ...record.state.units["c-a-p-hill"]!,
                      location: "L8",
                      status: "deployed",
                    },
                    "c-heth": {
                      ...record.state.units["c-heth"]!,
                      location: "L8",
                      status: "deployed",
                    },
                    "u-devin": {
                      ...record.state.units["u-devin"]!,
                      location: "M10",
                      status: "deployed",
                    },
                    "u-gamble": {
                      ...record.state.units["u-gamble"]!,
                      location: "M10",
                      status: "deployed",
                    },
                  },
                },
              }
            : record,
        ],
      ),
    };

    const restored = new InMemoryGameService({ snapshot: legacySnapshot });
    expect(restored.getGameState(game.gameId).combats[combatId]).toMatchObject({
      defender_hexes: ["M9"],
      pending_choice: {
        destination_hexes: ["M9"],
        eligible_unit_ids: ["c-heth", "c-a-p-hill"],
        kind: "advance",
      },
    });
  });

  it("creates opposing bindings and rejects a copied invitation after claim", () => {
    const service = new InMemoryGameService();
    const host = service.createGame("confederate");
    const guest = service.claimInvitation({
      lookupId: host.invitation.lookup_id,
      secret: host.invitation.secret,
    });

    expect(guest.seat).toBe("union");
    expect(service.authenticate(host.credential, host.gameId).side).toBe(
      "confederate",
    );
    expect(service.authenticate(guest.credential, host.gameId).side).toBe(
      "union",
    );
    expectServiceError(
      () =>
        service.claimInvitation({
          lookupId: host.invitation.lookup_id,
          secret: host.invitation.secret,
        }),
      "invitation_unavailable",
    );
  });

  it("rejects a mismatched request without consuming the invitation", () => {
    const service = new InMemoryGameService();
    const host = service.createGame("union");

    expectServiceError(
      () =>
        service.claimInvitation({
          lookupId: host.invitation.lookup_id,
          requestedGameId: randomUUID(),
          requestedSeat: "union",
          secret: host.invitation.secret,
        }),
      "invitation_mismatch",
    );

    expect(
      service.claimInvitation({
        lookupId: host.invitation.lookup_id,
        secret: host.invitation.secret,
      }).seat,
    ).toBe("confederate");
  });

  it("preserves one browser session across multiple games and browser restart", () => {
    const service = new InMemoryGameService();
    const first = service.createGame("union");
    const second = service.createGame("confederate", first.credential);

    expect(second.sessionId).toBe(first.sessionId);
    expect(service.authenticate(first.credential, first.gameId).side).toBe(
      "union",
    );
    expect(service.authenticate(first.credential, second.gameId).side).toBe(
      "confederate",
    );
    expectServiceError(
      () => service.authenticate(undefined, first.gameId),
      "unauthorized",
    );
  });

  it("prevents one browser session from claiming both sides", () => {
    const service = new InMemoryGameService();
    const host = service.createGame("confederate");

    expectServiceError(
      () =>
        service.claimInvitation({
          credential: host.credential,
          lookupId: host.invitation.lookup_id,
          secret: host.invitation.secret,
        }),
      "seat_unavailable",
    );
  });
});

describe("authoritative gameplay commands", () => {
  it("rejects Nelson entering a Union zone of control on a night turn", () => {
    const pepper = new Uint8Array(32).fill(8);
    const original = new InMemoryGameService({ pepper });
    const host = original.createGame("confederate");
    const snapshot = original.exportSnapshot();
    const arrangedSnapshot = {
      ...snapshot,
      games: snapshot.games.map(
        ([gameId, record]): (typeof snapshot.games)[number] => [
          gameId,
          gameId === host.gameId
            ? {
                ...record,
                state: {
                  ...record.state,
                  active_side: "confederate",
                  night: true,
                  phase: "movement",
                  turn: 8,
                  units: Object.fromEntries(
                    Object.entries(record.state.units).map(([id, unit]) => [
                      id,
                      id === "c-nelson"
                        ? { ...unit, location: "L6", status: "deployed" }
                        : id === "u-geary"
                          ? { ...unit, location: "J5", status: "deployed" }
                          : {
                              ...unit,
                              location: null,
                              status: "reinforcement",
                            },
                    ]),
                  ),
                },
              }
            : record,
        ],
      ),
    };
    const service = new InMemoryGameService({
      pepper,
      snapshot: arrangedSnapshot,
    });
    const authorization = service.authenticate(host.credential, host.gameId);

    expect(
      service.executeCommand(
        authorization,
        moveCommand(host.gameId, 0, "c-nelson", "K6"),
      ),
    ).toMatchObject({
      current_version: 0,
      error: "phase_invalid",
      message:
        "Night movement must withdraw from and may not enter an enemy zone of control.",
      ok: false,
    });
    expect(service.getGameState(host.gameId).units["c-nelson"]).toMatchObject({
      location: "L6",
    });
    expect(service.getActions(host.gameId)).toHaveLength(0);
  });

  it("creates and rolls every mandatory skirmish in one authoritative action", () => {
    const pepper = new Uint8Array(32).fill(7);
    const original = new InMemoryGameService({ pepper });
    const host = original.createGame("confederate");
    const snapshot = original.exportSnapshot();
    const arrangedSnapshot = {
      ...snapshot,
      games: snapshot.games.map(
        ([gameId, record]): (typeof snapshot.games)[number] => [
          gameId,
          gameId === host.gameId
            ? {
                ...record,
                state: {
                  ...record.state,
                  active_side: "confederate",
                  phase: "movement",
                  turn: 4,
                  units: Object.fromEntries(
                    Object.entries(record.state.units).map(([id, unit]) => {
                      const locations: Record<string, HexCoordinate> = {
                        "c-heth": "A1",
                        "c-pegram": "D1",
                        "u-devin": "B1",
                        "u-gamble": "E1",
                      };
                      return [
                        id,
                        locations[id] === undefined
                          ? { ...unit, location: null, status: "reinforcement" }
                          : {
                              ...unit,
                              location: locations[id],
                              status: "deployed",
                            },
                      ];
                    }),
                  ),
                },
              }
            : record,
        ],
      ),
    };
    const service = new InMemoryGameService({
      pepper,
      snapshot: arrangedSnapshot,
    });
    const authorization = service.authenticate(host.credential, host.gameId);

    expect(
      service.executeCommand(authorization, endPhaseCommand(host.gameId, 0)),
    ).toMatchObject({ ok: true });
    const combats = Object.values(service.getGameState(host.gameId).combats);
    expect(combats).toHaveLength(2);
    expect(combats.map((combat) => combat.attackers).sort()).toEqual([
      ["c-heth"],
      ["c-pegram"],
    ]);
    expect(combats.map((combat) => combat.defenders).sort()).toEqual([
      ["u-devin"],
      ["u-gamble"],
    ]);
    expect(
      combats.every(
        (combat) =>
          combat.status === "awaiting_result_confirmation" &&
          combat.rolls !== null &&
          combat.rolls.attacker >= 1 &&
          combat.rolls.attacker <= 10 &&
          combat.rolls.defender >= 1 &&
          combat.rolls.defender <= 10,
      ),
    ).toBe(true);
    expect(service.getActions(host.gameId)).toHaveLength(1);
    expect(service.getActions(host.gameId)[0]?.result).toMatchObject({
      ok: true,
      state: { combats: service.getGameState(host.gameId).combats },
    });
  });

  it("completes a gap-free two-seat 24-turn game without server-data edits", () => {
    const service = new InMemoryGameService();
    const host = service.createGame("confederate");
    const guest = service.claimInvitation({
      lookupId: host.invitation.lookup_id,
      secret: host.invitation.secret,
    });
    const authorizations = {
      confederate: service.authenticate(host.credential, host.gameId),
      union: service.authenticate(guest.credential, host.gameId),
    };

    while (service.getGameState(host.gameId).phase !== "completed") {
      const current = service.getGameState(host.gameId);
      const side = current.active_side;
      if (side === null) throw new Error("Active game has no acting seat");
      expect(
        service.executeCommand(
          authorizations[side],
          endPhaseCommand(host.gameId, current.version),
        ),
      ).toMatchObject({ ok: true });
    }

    expect(service.getGameState(host.gameId)).toMatchObject({
      active_side: null,
      event_sequence: 47,
      phase: "completed",
      turn: 24,
      version: 47,
      victory: { confederate: 0, status: "union", union: 16 },
    });
    expect(
      service.getActions(host.gameId).map((action) => action.sequence),
    ).toEqual(Array.from({ length: 47 }, (_, index) => index + 1));
  });

  it("synchronizes accepted commands and rejects wrong-seat, invalid, and stale input", () => {
    const service = new InMemoryGameService();
    const host = service.createGame("union");
    const guest = service.claimInvitation({
      lookupId: host.invitation.lookup_id,
      secret: host.invitation.secret,
    });
    const hostAuth = service.authenticate(host.credential, host.gameId);
    const guestAuth = service.authenticate(guest.credential, host.gameId);

    expect(
      service.executeCommand(hostAuth, endPhaseCommand(host.gameId, 0)),
    ).toMatchObject({
      ok: true,
      state: {
        active_side: "confederate",
        phase: "movement",
        turn: 2,
        version: 1,
      },
    });
    expect(
      service.executeCommand(hostAuth, endPhaseCommand(host.gameId, 1)),
    ).toMatchObject({ error: "wrong_seat", ok: false });
    expect(
      service.executeCommand(guestAuth, {
        ...moveCommand(host.gameId, 1, "u-wadsworth", "Q7"),
        payload: { destination: "Z99", unit_id: "u-wadsworth" },
      }),
    ).toMatchObject({ error: "invalid_payload", ok: false });
    expect(
      service.executeCommand(guestAuth, endPhaseCommand(host.gameId, 0)),
    ).toMatchObject({ current_version: 1, error: "stale_version", ok: false });
    expect(service.getGameState(host.gameId)).toMatchObject({
      active_side: "confederate",
      phase: "movement",
      turn: 2,
      version: 1,
    });
  });

  it("returns an identical duplicate and rejects conflicting command reuse", () => {
    const service = new InMemoryGameService();
    const host = service.createGame("union");
    const authorization = service.authenticate(host.credential, host.gameId);
    const commandId = randomUUID();
    const command = endPhaseCommand(host.gameId, 0, commandId);

    const first = service.executeCommand(authorization, command);
    expect(service.executeCommand(authorization, command)).toEqual(first);
    expect(
      service.executeCommand(
        authorization,
        moveCommand(host.gameId, 0, "u-wadsworth", "E3", commandId),
      ),
    ).toMatchObject({ error: "command_id_conflict", ok: false });
    expect(service.getActions(host.gameId)).toHaveLength(1);
  });

  it("does not disclose a duplicate result to another seat binding", () => {
    const service = new InMemoryGameService();
    const host = service.createGame("union");
    const guest = service.claimInvitation({
      lookupId: host.invitation.lookup_id,
      secret: host.invitation.secret,
    });
    const hostAuthorization = service.authenticate(
      host.credential,
      host.gameId,
    );
    const guestAuthorization = service.authenticate(
      guest.credential,
      host.gameId,
    );
    const command = endPhaseCommand(host.gameId, 0);

    expect(service.executeCommand(hostAuthorization, command)).toMatchObject({
      ok: true,
    });
    expect(service.executeCommand(guestAuthorization, command)).toMatchObject({
      error: "unauthorized",
      ok: false,
    });
    expect(service.getActions(host.gameId)).toHaveLength(1);
  });

  it("survives a crash after commit without reapplying the retry", () => {
    const service = new InMemoryGameService();
    const host = service.createGame("union");
    const authorization = service.authenticate(host.credential, host.gameId);
    const command = endPhaseCommand(host.gameId, 0);

    expect(() =>
      service.executeCommand(authorization, command, {
        afterCommit: () => {
          throw new Error("simulated response crash");
        },
      }),
    ).toThrow("simulated response crash");
    expect(service.executeCommand(authorization, command)).toMatchObject({
      ok: true,
      state: { version: 1 },
    });
    expect(service.getActions(host.gameId)).toHaveLength(1);
  });
});

describe("operator seat recovery", () => {
  it("revokes only the old binding and appends a version-neutral audit action", () => {
    const service = new InMemoryGameService();
    const host = service.createGame("union");
    const otherGame = service.createGame("confederate", host.credential);
    const oldAuthorization = service.authenticate(host.credential, host.gameId);
    const acceptedCommand = endPhaseCommand(host.gameId, 0);
    service.executeCommand(oldAuthorization, acceptedCommand);

    const grant = service.issueSeatRecovery(
      host.gameId,
      "union",
      "local-operator:test",
    );
    const recovered = service.claimSeatRecovery({
      lookupId: grant.lookup_id,
      secret: grant.secret,
    });

    expectServiceError(
      () => service.authenticate(host.credential, host.gameId),
      "unauthorized",
    );
    expect(service.authenticate(host.credential, otherGame.gameId).side).toBe(
      "confederate",
    );
    const recoveredAuthorization = service.authenticate(
      recovered.credential,
      host.gameId,
    );
    expect(recoveredAuthorization).toMatchObject({
      bindingVersion: 2,
      side: "union",
    });
    expect(
      service.executeCommand(recoveredAuthorization, acceptedCommand),
    ).toMatchObject({ error: "unauthorized", ok: false });
    expect(service.getGameState(host.gameId)).toMatchObject({
      event_sequence: 2,
      version: 1,
    });
    expect(service.getActions(host.gameId)).toMatchObject([
      { kind: "gameplay", sequence: 1, resultingVersion: 1 },
      {
        expectedVersion: 1,
        kind: "operator_audit",
        resultingVersion: 1,
        sequence: 2,
      },
    ]);
    expectServiceError(
      () =>
        service.claimSeatRecovery({
          lookupId: grant.lookup_id,
          secret: grant.secret,
        }),
      "recovery_unavailable",
    );
  });
});

describe("Phase 2 seat and host lifecycle", () => {
  it("surrenders one seat, revokes old invitations, and permits a host replacement", () => {
    const service = new InMemoryGameService();
    const host = service.createGame("union");
    const guest = service.claimInvitation({
      lookupId: host.invitation.lookup_id,
      secret: host.invitation.secret,
    });
    const guestAuthorization = service.authenticate(
      guest.credential,
      host.gameId,
    );
    const surrender = surrenderSeatCommand(host.gameId, 0);

    const surrendered = service.executeCommand(guestAuthorization, surrender);
    expect(surrendered).toMatchObject({
      event: { command_name: "surrenderSeat", event_sequence: 1 },
      ok: true,
      state: { version: 1 },
    });
    expect(service.executeCommand(guestAuthorization, surrender)).toEqual(
      surrendered,
    );
    expectServiceError(
      () => service.authenticate(guest.credential, host.gameId),
      "unauthorized",
    );

    const hostAuthorization = service.authenticateHost(
      host.credential,
      host.gameId,
    );
    const issueCommand = hostCommand(host.gameId, 1, "issueInvitation", {
      seat: "confederate",
    });
    const issued = service.executeHostCommand(hostAuthorization, issueCommand);
    expect(issued).toMatchObject({
      event: { event_sequence: 2, state_version: 1 },
      invitation: { secret: expect.any(String) },
      ok: true,
    });
    if (!issued.ok || issued.invitation === undefined)
      throw new Error("Replacement invitation was not returned");
    expect(service.executeHostCommand(hostAuthorization, issueCommand)).toEqual(
      issued,
    );
    expect(
      service.claimInvitation({
        lookupId: issued.invitation.lookup_id,
        secret: issued.invitation.secret,
      }).seat,
    ).toBe("confederate");
  });

  it("revokes an invitation and soft-deletes every game binding", () => {
    const service = new InMemoryGameService();
    const host = service.createGame("union");
    const authorization = service.authenticateHost(
      host.credential,
      host.gameId,
    );
    const publishedEvents: number[] = [];
    const revocation = hostCommand(
      host.gameId,
      0,
      "revokeInvitation",
      { lookup_id: host.invitation.lookup_id },
      "88888888-8888-4888-8888-888888888888",
    );
    expect(
      service.executeHostCommand(authorization, revocation, {
        afterCommit: (event) => publishedEvents.push(event.event_sequence),
      }),
    ).toMatchObject({ event: { event_sequence: 1 }, ok: true });
    expect(
      service.executeHostCommand(authorization, revocation, {
        afterCommit: (event) => publishedEvents.push(event.event_sequence),
      }),
    ).toMatchObject({ event: { event_sequence: 1 }, ok: true });
    expect(publishedEvents).toEqual([1]);
    expectServiceError(
      () =>
        service.claimInvitation({
          lookupId: host.invitation.lookup_id,
          secret: host.invitation.secret,
        }),
      "invitation_unavailable",
    );
    const deletion = hostCommand(host.gameId, 0, "deleteGame", {
      confirm: true,
    });
    const deleted = service.executeHostCommand(authorization, deletion);
    expect(deleted).toMatchObject({
      event: { event_sequence: 2, state_version: 0 },
      ok: true,
    });
    const retryAuthorization = service.authenticateHost(
      host.credential,
      host.gameId,
      { terminalCommandId: deletion.command_id },
    );
    expect(service.executeHostCommand(retryAuthorization, deletion)).toEqual(
      deleted,
    );
    expectServiceError(() => service.getGameState(host.gameId), "game_deleted");
    expectServiceError(
      () => service.authenticate(host.credential, host.gameId),
      "game_deleted",
    );
    expect(service.getActions(host.gameId)).toHaveLength(2);
  });

  it("hard-purges expired deletions and retains only a stable receipt", () => {
    let now = Date.UTC(2026, 7, 15);
    const service = new InMemoryGameService({ now: () => now });
    const deletedGame = service.createGame("union");
    const retainedGame = service.createGame(
      "confederate",
      deletedGame.credential,
    );
    const authorization = service.authenticateHost(
      deletedGame.credential,
      deletedGame.gameId,
    );
    service.executeHostCommand(
      authorization,
      hostCommand(deletedGame.gameId, 0, "deleteGame", { confirm: true }),
    );

    expect(service.purgeDeletedGames()).toEqual([]);
    now += 30 * 24 * 60 * 60 * 1_000;
    expect(service.purgeDeletedGames()).toEqual([
      {
        actor: authorization.bindingId,
        deletedAt: Date.UTC(2026, 7, 15),
        gameId: deletedGame.gameId,
        position: 1,
        purgedAt: now,
      },
    ]);
    expect(service.purgeDeletedGames()).toEqual([]);
    expect(service.getDeletionLedger()).toHaveLength(1);
    expectServiceError(
      () => service.getActions(deletedGame.gameId),
      "game_purged",
    );
    expectServiceError(
      () =>
        service.authenticateHost(deletedGame.credential, deletedGame.gameId),
      "game_purged",
    );
    expect(service.getGameState(retainedGame.gameId).game_id).toBe(
      retainedGame.gameId,
    );
    expect(
      service
        .exportSnapshot()
        .hostBindings.some((binding) => binding.gameId === retainedGame.gameId),
    ).toBe(true);
  });

  it("rotates only one host binding through operator recovery", () => {
    const service = new InMemoryGameService();
    const first = service.createGame("union");
    const second = service.createGame("confederate", first.credential);
    const grant = service.issueHostRecovery(
      first.gameId,
      "local-operator:test",
    );
    const recovered = service.claimHostRecovery({
      lookupId: grant.lookup_id,
      secret: grant.secret,
    });

    expectServiceError(
      () => service.authenticateHost(first.credential, first.gameId),
      "unauthorized",
    );
    expect(
      service.authenticateHost(first.credential, second.gameId),
    ).toMatchObject({ bindingVersion: 1 });
    expect(
      service.authenticateHost(recovered.credential, first.gameId),
    ).toMatchObject({ bindingVersion: 2 });
    expect(service.authenticate(first.credential, first.gameId).side).toBe(
      "union",
    );
    expect(service.getGameState(first.gameId)).toMatchObject({
      event_sequence: 1,
      version: 0,
    });
  });
});
