import { randomBytes, randomUUID } from "node:crypto";
import { COMMAND_SCHEMA_VERSION } from "@gettysburg/game";
import { describe, expect, it } from "vitest";
import {
  InMemoryGameService,
  type GameServiceSnapshot,
} from "./game-service.js";

function fixture() {
  const pepper = randomBytes(32);
  const clock = { now: 1000 };
  const service = new InMemoryGameService({ pepper, now: () => clock.now });
  const host = service.createGame("union");
  const execute = (command_name: string, payload = {}, gameId = host.gameId) =>
    service.executeHostCommand(
      service.authenticateHost(host.credential, gameId),
      {
        command_id: randomUUID(),
        command_name,
        payload,
        schema: COMMAND_SCHEMA_VERSION,
        expected_version: service.getGameState(gameId).version,
        game_id: gameId,
      },
    );
  const issue = (gameId = host.gameId) => {
    const result = execute("issueSpectatorInvitation", {}, gameId);
    if (!result.ok || !result.invitation) throw new Error("Missing invitation");
    return {
      claimId: randomUUID(),
      lookupId: result.invitation.lookup_id,
      secret: result.invitation.secret,
    };
  };
  return { pepper, clock, service, host, execute, issue };
}

describe("revocable read-only spectator access", () => {
  it("denies orphan or inconsistent grants on ordinary reads, not only replay", () => {
    const f = fixture();
    const observer = f.service.claimSpectatorInvitation(f.issue());
    const other = f.service.createGame("union");
    const snapshot = f.service.exportSnapshot();
    const binding = snapshot.spectatorBindings![0]!;
    const corruptions: GameServiceSnapshot[] = [
      { ...snapshot, spectatorInvitations: [] },
      { ...snapshot, spectatorBindings: [binding, binding] },
      { ...snapshot, spectatorBindings: [{ ...binding, version: 2 }] },
      {
        ...snapshot,
        spectatorBindings: [{ ...binding, invitationLookupId: randomUUID() }],
      },
    ];
    for (const patch of [
      { claimedAt: null },
      { revokedAt: f.clock.now },
      { bindingId: randomUUID() },
      { claimedSessionId: randomUUID() },
      { claimedAfterSequence: 99 },
      { expiresAt: 0 },
    ])
      corruptions.push({
        ...snapshot,
        spectatorInvitations: snapshot.spectatorInvitations!.map(
          ([id, invitation]) => [id, { ...invitation, ...patch }],
        ),
      });
    for (const corrupted of corruptions) {
      const restored = new InMemoryGameService({
        pepper: f.pepper,
        snapshot: corrupted,
        now: () => f.clock.now,
      });
      expect(() =>
        restored.authenticateSpectator(observer.credential, f.host.gameId),
      ).toThrow(/Current spectator access/);
      expect(() =>
        restored.getSpectatorView(observer.credential, f.host.gameId),
      ).toThrow(/Current spectator access/);
      expect(() =>
        restored.getReplay(observer.credential, f.host.gameId),
      ).toThrow(/Current game access/);
      expect(
        restored.getGameView(f.host.credential, f.host.gameId).is_host,
      ).toBe(true);
    }
    const reassigned = new InMemoryGameService({
      pepper: f.pepper,
      now: () => f.clock.now,
      snapshot: {
        ...snapshot,
        spectatorBindings: [{ ...binding, sessionId: other.sessionId }],
      },
    });
    expect(() =>
      reassigned.getSpectatorView(other.credential, f.host.gameId),
    ).toThrow(/Current spectator access/);
    expect(reassigned.getGameView(other.credential, other.gameId).is_host).toBe(
      true,
    );
  });

  it("does not renew the browser session when a duplicate spectator claim is rejected", () => {
    const f = fixture();
    const observer = f.service.claimSpectatorInvitation(f.issue());
    const next = f.issue();
    const before = f.service.exportSnapshot();
    f.clock.now += 1000;
    expect(() =>
      f.service.claimSpectatorInvitation({
        ...next,
        credential: observer.credential,
      }),
    ).toThrow(/already has spectator access/);
    expect(f.service.exportSnapshot()).toEqual(before);
  });
  it("rejects mismatched or duplicate snapshot keys and synthetic unbound claims", () => {
    const f = fixture();
    f.issue();
    const snapshot = f.service.exportSnapshot();
    const [id, invitation] = snapshot.spectatorInvitations![0]!;
    for (const spectatorInvitations of [
      [[randomUUID(), invitation]],
      [
        [id, invitation],
        [id, invitation],
      ],
    ] as const)
      expect(
        () =>
          new InMemoryGameService({
            pepper: f.pepper,
            snapshot: {
              ...snapshot,
              spectatorInvitations: spectatorInvitations.map(([key, value]) => [
                key,
                value,
              ]),
            },
            now: () => f.clock.now,
          }),
      ).toThrow(/Invalid spectator invitation identifier/);
    const synthetic = new InMemoryGameService({
      pepper: f.pepper,
      snapshot: {
        ...snapshot,
        spectatorInvitations: [
          [
            id,
            { ...invitation, claimedAt: f.clock.now, claimedAfterSequence: 1 },
          ],
        ],
      },
      now: () => f.clock.now,
    });
    expect(() => synthetic.getReplay(f.host.credential, f.host.gameId)).toThrow(
      /Replay is unavailable/,
    );
  });
  it("preserves a separate legitimate host/seat binding when spectator access is revoked", () => {
    const f = fixture();
    const input = f.issue();
    const observer = f.service.claimSpectatorInvitation({
      ...input,
      credential: f.host.credential,
    });
    expect(observer.credential).toBe(f.host.credential);
    expect(
      f.execute("revokeSpectatorAccess", { lookup_id: input.lookupId }).ok,
    ).toBe(true);
    expect(() =>
      f.service.getSpectatorView(observer.credential, f.host.gameId),
    ).toThrow(/Current spectator access/);
    expect(
      f.service.getGameView(observer.credential, f.host.gameId),
    ).toMatchObject({ is_host: true, seat: "union" });
    expect(
      f.service.getReplay(observer.credential, f.host.gameId).sequence,
    ).toBe(2);
  });
  it("claims once without a seat or game mutation and exposes public state/replay only", () => {
    const f = fixture();
    const input = f.issue();
    const before = f.service.getGameState(f.host.gameId);
    const observer = f.service.claimSpectatorInvitation(input);
    expect(observer.view).toEqual({
      game_id: f.host.gameId,
      state: before,
      action_log: f.service.getGameView(f.host.credential, f.host.gameId)
        .action_log,
    });
    expect(f.service.getGameState(f.host.gameId)).toEqual(before);
    expect(f.service.exportSnapshot().seatBindings).toHaveLength(1);
    expect(
      f.service.getReplay(observer.credential, f.host.gameId).state,
    ).toEqual(before);
    expect(() =>
      f.service.authenticate(observer.credential, f.host.gameId),
    ).toThrow(/seat binding/);
    expect(() =>
      f.service.authenticateHost(observer.credential, f.host.gameId),
    ).toThrow(/host binding/);
    expect(() =>
      f.service.getGameView(observer.credential, f.host.gameId),
    ).toThrow(/No game access/);
    expect(() =>
      f.service.getRecoveryExport(observer.credential, f.host.gameId),
    ).toThrow(/binding/);
    const authorization = f.service.authenticateSpectator(
      observer.credential,
      f.host.gameId,
    );
    const command = {
      command_id: randomUUID(),
      game_id: f.host.gameId,
      expected_version: before.version,
      schema: COMMAND_SCHEMA_VERSION,
      payload: {},
    };
    expect(() =>
      f.service.executeCommand(
        { ...authorization, side: "union" },
        { ...command, command_name: "endPhase" },
      ),
    ).toThrow(/Seat binding/);
    expect(() =>
      f.service.executeHostCommand(authorization, {
        ...command,
        command_name: "issueSpectatorInvitation",
      }),
    ).toThrow(/Host binding/);
    Object.assign(observer.view.state, { version: 999 });
    expect(
      f.service.getSpectatorView(observer.credential, f.host.gameId).state,
    ).toEqual(before);
  });

  it("restores the exact claim retry and rejects changed claim IDs, targets, or secrets", () => {
    const f = fixture();
    const input = f.issue();
    for (const patch of [
      { secret: "invalid" },
      { claimId: "invalid" },
      { requestedGameId: randomUUID() },
    ])
      expect(() =>
        f.service.claimSpectatorInvitation({ ...input, ...patch }),
      ).toThrow(/Spectator invitation/);
    const observer = f.service.claimSpectatorInvitation(input);
    const restored = new InMemoryGameService({
      pepper: f.pepper,
      snapshot: f.service.exportSnapshot(),
      now: () => f.clock.now,
    });
    expect(restored.claimSpectatorInvitation(input)).toEqual(observer);
    expect(restored.exportSnapshot().spectatorBindings).toHaveLength(1);
    expect(() =>
      restored.claimSpectatorInvitation({ ...input, claimId: randomUUID() }),
    ).toThrow(/Spectator invitation/);
    expect(() =>
      restored.claimSpectatorInvitation({
        ...input,
        requestedGameId: randomUUID(),
      }),
    ).toThrow(/Spectator invitation/);
    expect(() =>
      f.service.claimSpectatorInvitation({
        ...f.issue(),
        credential: observer.credential,
      }),
    ).toThrow(/already has spectator access/);
    f.clock.now += 2 * 24 * 60 * 60 * 1000;
    expect(() => restored.claimSpectatorInvitation(input)).toThrow(
      /Spectator invitation/,
    );
    expect(
      restored.getSpectatorView(observer.credential, f.host.gameId).game_id,
    ).toBe(f.host.gameId);
    f.clock.now += 30 * 24 * 60 * 60 * 1000;
    expect(() =>
      restored.getSpectatorView(observer.credential, f.host.gameId),
    ).toThrow(/Current spectator access/);
  });

  it("revokes expired-but-claimed access immediately and verifies its retirement", () => {
    const f = fixture();
    const input = f.issue();
    const observer = f.service.claimSpectatorInvitation(input);
    f.clock.now += 2 * 24 * 60 * 60 * 1000;
    expect(
      f.execute("revokeSpectatorAccess", { lookup_id: input.lookupId }).ok,
    ).toBe(true);
    expect(() =>
      f.service.getSpectatorView(observer.credential, f.host.gameId),
    ).toThrow(/Current spectator access/);
    expect(() =>
      f.service.getReplay(observer.credential, f.host.gameId),
    ).toThrow(/Current game access/);
    expect(f.service.getReplay(f.host.credential, f.host.gameId)).toMatchObject(
      { sequence: 2, state: { version: 0 } },
    );
    const snapshot = f.service.exportSnapshot();
    expect(snapshot.spectatorInvitations![0]![1]).not.toHaveProperty(
      "sealedClaimCredential",
    );
    expect(snapshot.spectatorBindings![0]).toMatchObject({
      inactiveFromSequence: 2,
      revokedAt: f.clock.now,
    });
    const corrupt = new InMemoryGameService({
      pepper: f.pepper,
      snapshot: {
        ...snapshot,
        spectatorBindings: snapshot.spectatorBindings!.map((binding) => ({
          ...binding,
          inactiveFromSequence: 3,
        })),
      },
      now: () => f.clock.now,
    });
    expect(() => corrupt.getReplay(f.host.credential, f.host.gameId)).toThrow(
      /Replay is unavailable/,
    );
  });

  it("deletes one game's observers without deleting their other-game session", () => {
    const f = fixture();
    const observer = f.service.claimSpectatorInvitation(f.issue());
    const other = f.service.createGame("union", f.host.credential);
    f.service.claimSpectatorInvitation({
      ...f.issue(other.gameId),
      credential: observer.credential,
    });
    const before = f.service.exportSnapshot();
    expect(f.execute("deleteGame", { confirm: true }).ok).toBe(true);
    expect(
      f.service
        .exportSnapshot()
        .spectatorInvitations!.find(
          ([, invitation]) => invitation.gameId === f.host.gameId,
        )![1],
    ).not.toHaveProperty("claimedSessionId");
    expect(f.service.exportSnapshot().spectatorBindings).toHaveLength(1);
    expect(
      f.service.getSpectatorView(observer.credential, other.gameId).game_id,
    ).toBe(other.gameId);
    const restored = new InMemoryGameService({
      pepper: f.pepper,
      snapshot: before,
      now: () => f.clock.now,
    });
    restored.synchronizeDeletionLedger(f.service.getDeletionLedger());
    expect(restored.exportSnapshot().spectatorBindings).toHaveLength(1);
    expect(
      restored.getSpectatorView(observer.credential, other.gameId).game_id,
    ).toBe(other.gameId);
    expect(() =>
      restored.getSpectatorView(observer.credential, f.host.gameId),
    ).toThrow(/deleted/);
  });

  it("rejects orphan, ambiguous, and impossible claim evidence while permitting historical cursors", () => {
    const f = fixture();
    f.service.claimSpectatorInvitation(f.issue());
    const snapshot = f.service.exportSnapshot();
    const binding = snapshot.spectatorBindings![0]!;
    const corruptions: GameServiceSnapshot[] = [
      { ...snapshot, spectatorBindings: [] },
      { ...snapshot, spectatorBindings: [binding, binding] },
      {
        ...snapshot,
        spectatorBindings: [{ ...binding, invitationLookupId: randomUUID() }],
      },
      { ...snapshot, spectatorBindings: [{ ...binding, version: 2 }] },
    ];
    for (const patch of [
      { claimedAt: 0 },
      { claimedAt: 1000 + 24 * 60 * 60 * 1000 },
      { claimedAt: null },
      { claimedAfterSequence: 0 },
      { bindingId: randomUUID() },
    ])
      corruptions.push({
        ...snapshot,
        spectatorInvitations: snapshot.spectatorInvitations!.map(
          ([id, value]) => [id, { ...value, ...patch }],
        ),
      });
    corruptions.push({
      ...snapshot,
      spectatorBindings: [{ ...binding, activeAfterSequence: 2 }],
      spectatorInvitations: snapshot.spectatorInvitations!.map(
        ([id, value]) => [id, { ...value, claimedAfterSequence: 2 }],
      ),
    });
    for (const corrupted of corruptions) {
      const restored = new InMemoryGameService({
        pepper: f.pepper,
        snapshot: corrupted,
        now: () => f.clock.now,
      });
      expect(() =>
        restored.getReplay(f.host.credential, f.host.gameId),
      ).toThrow(/Replay is unavailable/);
    }
    expect(
      f.service.getReplay(f.host.credential, f.host.gameId, 0).sequence,
    ).toBe(0);
    expect(f.service.getReplay(f.host.credential, f.host.gameId).sequence).toBe(
      1,
    );
  });
});
