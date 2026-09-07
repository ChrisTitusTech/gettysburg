import { randomBytes, randomUUID } from "node:crypto";
import { COMMAND_SCHEMA_VERSION } from "@gettysburg/game";
import { describe, expect, it } from "vitest";
import { InMemoryGameService } from "./game-service.js";

function fixture() {
  const pepper = randomBytes(32);
  const service = new InMemoryGameService({ pepper });
  const host = service.createGame("union");
  const guest = service.claimInvitation({
    lookupId: host.invitation.lookup_id,
    secret: host.invitation.secret,
  });
  const command = (command_name: string, payload = {}) => ({
    command_id: randomUUID(),
    command_name,
    payload,
    expected_version: service.getGameState(host.gameId).version,
    game_id: host.gameId,
    schema: COMMAND_SCHEMA_VERSION,
  });
  return { pepper, service, host, guest, command };
}

describe("atomic authorized game views", () => {
  it("preserves host-only/guest fields and returns isolated public events", () => {
    const f = fixture();
    expect(
      f.service.executeCommand(
        f.service.authenticate(f.host.credential, f.host.gameId),
        f.command("surrenderSeat"),
      ).ok,
    ).toBe(true);
    expect(
      f.service.executeHostCommand(
        f.service.authenticateHost(f.host.credential, f.host.gameId),
        f.command("issueInvitation", { seat: "union" }),
      ).ok,
    ).toBe(true);
    const owner = f.service.getGameView(f.host.credential, f.host.gameId);
    expect(Object.keys(owner).sort()).toEqual([
      "action_log",
      "active_invitations",
      "game_id",
      "is_host",
      "seat",
      "state",
    ]);
    expect(owner).toMatchObject({ is_host: true, seat: null });
    expect(owner.active_invitations).toHaveLength(1);
    expect(owner.action_log.map((event) => event.event_sequence)).toEqual([
      1, 2,
    ]);
    const guest = f.service.getGameView(f.guest.credential, f.host.gameId);
    expect(guest).toMatchObject({
      is_host: false,
      seat: "confederate",
      active_invitations: [],
    });
    expect(guest.state).toEqual(owner.state);
    const serialized = JSON.stringify(guest);
    for (const privateField of [
      "authorizingId",
      "canonicalRequestHash",
      "tokenHash",
      f.host.credential,
      f.guest.credential,
    ])
      expect(serialized).not.toContain(privateField);
    Object.assign(guest.state, { version: 999 });
    Object.assign(guest.action_log[0]!, { summary: "tampered" });
    expect(f.service.getGameView(f.guest.credential, f.host.gameId)).toEqual({
      ...owner,
      is_host: false,
      seat: "confederate",
      active_invitations: [],
    });
  });

  it("checks current access after seat and host recovery without caching", () => {
    const f = fixture();
    f.service.getGameView(f.guest.credential, f.host.gameId);
    const seatGrant = f.service.issueSeatRecovery(
      f.host.gameId,
      "confederate",
      "private operator",
    );
    const newSeat = f.service.claimSeatRecovery({
      lookupId: seatGrant.lookup_id,
      secret: seatGrant.secret,
    });
    expect(() =>
      f.service.getGameView(f.guest.credential, f.host.gameId),
    ).toThrow(/No game access/);
    expect(f.service.getGameView(newSeat.credential, f.host.gameId).seat).toBe(
      "confederate",
    );
    const hostGrant = f.service.issueHostRecovery(
      f.host.gameId,
      "private operator",
    );
    const newHost = f.service.claimHostRecovery({
      lookupId: hostGrant.lookup_id,
      secret: hostGrant.secret,
    });
    expect(
      f.service.getGameView(f.host.credential, f.host.gameId),
    ).toMatchObject({ is_host: false, seat: "union", active_invitations: [] });
    const view = f.service.getGameView(newHost.credential, f.host.gameId);
    expect(view).toMatchObject({ is_host: true, seat: null });
    expect(view.action_log.map((event) => event.summary)).toEqual([
      "Operator recovery completed",
      "Operator recovery completed",
    ]);
    expect(JSON.stringify(view)).not.toContain("private operator");
  });

  it("rejects absent, unrelated, expired, and deleted-game access", () => {
    const f = fixture();
    const other = f.service.createGame("union");
    for (const credential of [undefined, "invalid", other.credential])
      expect(() => f.service.getGameView(credential, f.host.gameId)).toThrow(
        /No game access/,
      );
    const expired = new InMemoryGameService({
      pepper: f.pepper,
      snapshot: f.service.exportSnapshot(),
      now: () => Date.now() + 31 * 24 * 60 * 60 * 1000,
    });
    expect(() => expired.getGameView(f.host.credential, f.host.gameId)).toThrow(
      /No game access/,
    );
    expect(
      f.service.executeHostCommand(
        f.service.authenticateHost(f.host.credential, f.host.gameId),
        f.command("deleteGame", { confirm: true }),
      ).ok,
    ).toBe(true);
    expect(() =>
      f.service.getGameView(f.host.credential, f.host.gameId),
    ).toThrow(/deleted/);
  });
});
