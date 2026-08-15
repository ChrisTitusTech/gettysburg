import { randomUUID } from "node:crypto";

import { COMMAND_SCHEMA_VERSION, type MoveUnitCommand } from "@gettysburg/game";
import { describe, expect, it } from "vitest";

import {
  canonicalMoveCommand,
  canonicalMoveCommandHash,
  FIXED_CANONICAL_COMMAND,
  InMemoryGameService,
  ServiceError,
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

describe("authoritative move commands", () => {
  it("synchronizes accepted moves and rejects wrong-seat, invalid, and stale input", () => {
    const service = new InMemoryGameService();
    const host = service.createGame("confederate");
    const guest = service.claimInvitation({
      lookupId: host.invitation.lookup_id,
      secret: host.invitation.secret,
    });
    const hostAuth = service.authenticate(host.credential, host.gameId);
    const guestAuth = service.authenticate(guest.credential, host.gameId);

    expect(
      service.executeMove(
        hostAuth,
        moveCommand(host.gameId, 0, "fixture-confederate-1", "G5"),
      ),
    ).toMatchObject({ ok: true, state: { version: 1 } });
    expect(
      service.executeMove(
        guestAuth,
        moveCommand(host.gameId, 1, "fixture-confederate-1", "H5"),
      ),
    ).toMatchObject({ error: "wrong_seat", ok: false });
    expect(
      service.executeMove(guestAuth, {
        ...moveCommand(host.gameId, 1, "fixture-union-1", "Q7"),
        payload: { destination: "Z99", unit_id: "fixture-union-1" },
      }),
    ).toMatchObject({ error: "invalid_payload", ok: false });
    expect(
      service.executeMove(
        guestAuth,
        moveCommand(host.gameId, 0, "fixture-union-1", "Q7"),
      ),
    ).toMatchObject({ current_version: 1, error: "stale_version", ok: false });
    expect(service.getGameState(host.gameId)).toMatchObject({
      units: { "fixture-confederate-1": { location: "G5" } },
      version: 1,
    });
  });

  it("returns an identical duplicate and rejects conflicting command reuse", () => {
    const service = new InMemoryGameService();
    const host = service.createGame("confederate");
    const authorization = service.authenticate(host.credential, host.gameId);
    const commandId = randomUUID();
    const command = moveCommand(
      host.gameId,
      0,
      "fixture-confederate-1",
      "G5",
      commandId,
    );

    const first = service.executeMove(authorization, command);
    expect(service.executeMove(authorization, command)).toEqual(first);
    expect(
      service.executeMove(
        authorization,
        moveCommand(host.gameId, 0, "fixture-confederate-1", "H5", commandId),
      ),
    ).toMatchObject({ error: "command_id_conflict", ok: false });
    expect(service.getActions(host.gameId)).toHaveLength(1);
  });

  it("does not disclose a duplicate result to another seat binding", () => {
    const service = new InMemoryGameService();
    const host = service.createGame("confederate");
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
    const command = moveCommand(host.gameId, 0, "fixture-confederate-1", "G5");

    expect(service.executeMove(hostAuthorization, command)).toMatchObject({
      ok: true,
    });
    expect(service.executeMove(guestAuthorization, command)).toMatchObject({
      error: "unauthorized",
      ok: false,
    });
    expect(service.getActions(host.gameId)).toHaveLength(1);
  });

  it("survives a crash after commit without reapplying the retry", () => {
    const service = new InMemoryGameService();
    const host = service.createGame("confederate");
    const authorization = service.authenticate(host.credential, host.gameId);
    const command = moveCommand(host.gameId, 0, "fixture-confederate-1", "G5");

    expect(() =>
      service.executeMove(authorization, command, {
        afterCommit: () => {
          throw new Error("simulated response crash");
        },
      }),
    ).toThrow("simulated response crash");
    expect(service.executeMove(authorization, command)).toMatchObject({
      ok: true,
      state: { version: 1 },
    });
    expect(service.getActions(host.gameId)).toHaveLength(1);
  });
});

describe("operator seat recovery", () => {
  it("revokes only the old binding and appends a version-neutral audit action", () => {
    const service = new InMemoryGameService();
    const host = service.createGame("confederate");
    const otherGame = service.createGame("union", host.credential);
    const oldAuthorization = service.authenticate(host.credential, host.gameId);
    const acceptedCommand = moveCommand(
      host.gameId,
      0,
      "fixture-confederate-1",
      "G5",
    );
    service.executeMove(oldAuthorization, acceptedCommand);

    const grant = service.issueSeatRecovery(
      host.gameId,
      "confederate",
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
      "union",
    );
    const recoveredAuthorization = service.authenticate(
      recovered.credential,
      host.gameId,
    );
    expect(recoveredAuthorization).toMatchObject({
      bindingVersion: 2,
      side: "confederate",
    });
    expect(
      service.executeMove(recoveredAuthorization, acceptedCommand),
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
