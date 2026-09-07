import { randomBytes, randomUUID } from "node:crypto";
import { COMMAND_SCHEMA_VERSION } from "@gettysburg/game";
import { describe, expect, it } from "vitest";
import { InMemoryGameService } from "./game-service.js";
import { credentialVerifier } from "./credentials.js";
import { SPECTATOR_INVITATION_LIFETIME_MS } from "./spectator-policy.js";

function fixture() {
  const pepper = randomBytes(32);
  const clock = { now: 1_000 };
  const service = new InMemoryGameService({ pepper, now: () => clock.now });
  const host = service.createGame("union");
  const guest = service.claimInvitation({
    lookupId: host.invitation.lookup_id,
    secret: host.invitation.secret,
  });
  const command = (command_name: string, payload = {}) => ({
    command_id: randomUUID(),
    command_name,
    payload,
    schema: COMMAND_SCHEMA_VERSION,
    expected_version: service.getGameState(host.gameId).version,
    game_id: host.gameId,
  });
  const execute = (input: unknown) =>
    service.executeHostCommand(
      service.authenticateHost(host.credential, host.gameId),
      input,
    );
  const issue = () => {
    const input = command("issueSpectatorInvitation");
    const result = execute(input);
    if (!result.ok || !result.invitation) throw new Error("Missing invitation");
    return { input, invitation: result.invitation };
  };
  return { pepper, clock, service, host, guest, command, execute, issue };
}

describe("host-managed spectator invitations", () => {
  it("issues independently of seats, restores safe retries, and replays revocation", () => {
    const f = fixture();
    const issued = f.issue();
    expect(f.service.getGameState(f.host.gameId)).toMatchObject({
      version: 0,
      event_sequence: 1,
    });
    const snapshot = f.service.exportSnapshot();
    const stored = snapshot.spectatorInvitations![0]![1];
    expect(stored).toMatchObject({
      claimedAt: null,
      activeAfterSequence: 1,
      issuedAt: 1000,
    });
    expect(stored.tokenHash).toBe(
      credentialVerifier(
        f.pepper,
        "spectator-invitation",
        issued.invitation.secret,
      ),
    );
    expect(stored.tokenHash).not.toBe(
      credentialVerifier(f.pepper, "invitation", issued.invitation.secret),
    );
    expect(JSON.stringify(snapshot)).not.toContain(issued.invitation.secret);
    const restored = new InMemoryGameService({
      pepper: f.pepper,
      snapshot,
      now: () => f.clock.now,
    });
    expect(
      restored.executeHostCommand(
        restored.authenticateHost(f.host.credential, f.host.gameId),
        issued.input,
      ),
    ).toMatchObject({ invitation: issued.invitation });
    expect(restored.getActions(f.host.gameId)).toHaveLength(1);
    expect(
      f.execute(
        f.command("revokeSpectatorInvitation", {
          lookup_id: issued.invitation.lookup_id,
        }),
      ).ok,
    ).toBe(true);
    expect(f.execute(issued.input)).not.toHaveProperty("invitation");
    expect(
      f.service.exportSnapshot().spectatorInvitations![0]![1],
    ).toMatchObject({ revokedAtSequence: 2, revokedAt: 1000 });
    const replay = f.service.getReplay(f.host.credential, f.host.gameId);
    expect(replay.state).toEqual(f.service.getGameState(f.host.gameId));
    expect(JSON.stringify(replay)).not.toContain("tokenHash");
    expect(JSON.stringify(replay)).not.toContain(issued.invitation.lookup_id);
  });

  it("bounds outstanding grants, expires invitations, and verifies the historical cap", () => {
    const f = fixture();
    const issued = Array.from({ length: 8 }, () => f.issue());
    expect(() => f.issue()).toThrow(/Revoke an existing spectator invitation/);
    expect(f.service.getActions(f.host.gameId)).toHaveLength(8);
    f.clock.now += SPECTATOR_INVITATION_LIFETIME_MS;
    expect(() =>
      f.execute(
        f.command("revokeSpectatorInvitation", {
          lookup_id: issued[0]!.invitation.lookup_id,
        }),
      ),
    ).toThrow(/cannot be revoked/);
    f.service.purgeDeletedGames();
    expect(f.execute(issued[0]!.input)).not.toHaveProperty("invitation");
    const next = f.issue();
    expect(f.service.getReplay(f.host.credential, f.host.gameId).sequence).toBe(
      9,
    );
    const snapshot = f.service.exportSnapshot();
    const corrupt = new InMemoryGameService({
      pepper: f.pepper,
      now: () => f.clock.now,
      snapshot: {
        ...snapshot,
        spectatorInvitations: snapshot.spectatorInvitations!.map(
          ([id, value]) => [
            id,
            id === next.invitation.lookup_id
              ? {
                  ...value,
                  issuedAt: 1000,
                  expiresAt: 1000 + SPECTATOR_INVITATION_LIFETIME_MS,
                }
              : value,
          ],
        ),
      },
    });
    expect(() => corrupt.getReplay(f.host.credential, f.host.gameId)).toThrow(
      /Replay is unavailable/,
    );
  });

  it("rejects guest, cross-game, malformed, conflicting, and player-claim attempts", () => {
    const f = fixture();
    expect(() =>
      f.service.executeHostCommand(
        f.service.authenticate(f.guest.credential, f.host.gameId),
        f.command("issueSpectatorInvitation"),
      ),
    ).toThrow(/Host binding/);
    expect(
      f.execute({
        ...f.command("issueSpectatorInvitation"),
        game_id: randomUUID(),
      }),
    ).toMatchObject({ ok: false, error: "unauthorized" });
    expect(
      f.execute(f.command("issueSpectatorInvitation", { seat: "union" })),
    ).toMatchObject({ ok: false, error: "invalid_payload" });
    const issued = f.issue();
    expect(
      f.execute({
        ...f.command("revokeSpectatorInvitation", {
          lookup_id: issued.invitation.lookup_id,
        }),
        command_id: issued.input.command_id,
      }),
    ).toMatchObject({ ok: false, error: "command_id_conflict" });
    expect(() =>
      f.service.claimInvitation({
        lookupId: issued.invitation.lookup_id,
        secret: issued.invitation.secret,
      }),
    ).toThrow(/Invitation/);
    expect(f.service.getActions(f.host.gameId)).toHaveLength(1);
  });

  it("removes spectator invitations during deletion and external-ledger restore", () => {
    const f = fixture();
    f.issue();
    const before = f.service.exportSnapshot();
    expect(f.execute(f.command("deleteGame", { confirm: true })).ok).toBe(true);
    expect(f.service.exportSnapshot().spectatorInvitations).toEqual([]);
    const restored = new InMemoryGameService({
      pepper: f.pepper,
      snapshot: before,
      now: () => f.clock.now,
    });
    restored.synchronizeDeletionLedger(f.service.getDeletionLedger());
    expect(restored.exportSnapshot().spectatorInvitations).toEqual([]);
    expect(JSON.stringify(restored.exportSnapshot())).not.toContain(
      "sealedInvitationSecret",
    );
  });

  it("fails replay closed for missing, altered lifetime, or invalid revocation evidence", () => {
    const f = fixture();
    const issued = f.issue();
    f.execute(
      f.command("revokeSpectatorInvitation", {
        lookup_id: issued.invitation.lookup_id,
      }),
    );
    const snapshot = f.service.exportSnapshot();
    for (const patch of [
      { expiresAt: 0 },
      { activeAfterSequence: 2 },
      { revokedAtSequence: 1 },
      { claimedAt: 1 },
    ]) {
      const restored = new InMemoryGameService({
        pepper: f.pepper,
        now: () => f.clock.now,
        snapshot: {
          ...snapshot,
          spectatorInvitations: snapshot.spectatorInvitations!.map(
            ([id, value]) => [id, { ...value, ...patch }],
          ),
        },
      });
      expect(() =>
        restored.getReplay(f.host.credential, f.host.gameId),
      ).toThrow(/Replay is unavailable/);
    }
    const restored = new InMemoryGameService({
      pepper: f.pepper,
      now: () => f.clock.now,
      snapshot: { ...snapshot, spectatorInvitations: [] },
    });
    expect(() => restored.getReplay(f.host.credential, f.host.gameId)).toThrow(
      /Replay is unavailable/,
    );
  });
});
