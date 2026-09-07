import { createECDH, randomBytes, randomUUID } from "node:crypto";
import { COMMAND_SCHEMA_VERSION } from "@gettysburg/game";
import { describe, expect, it } from "vitest";
import { InMemoryGameService } from "./game-service.js";

function fixture() {
  const pepper = randomBytes(32);
  const service = new InMemoryGameService({ pepper, now: () => 1_000 });
  const host = service.createGame("union");
  const guest = service.claimInvitation({
    lookupId: host.invitation.lookup_id,
    secret: host.invitation.secret,
  });
  const key = createECDH("prime256v1");
  key.generateKeys();
  const subscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/outbox-test",
    expirationTime: null,
    keys: {
      auth: randomBytes(16).toString("base64url"),
      p256dh: key.getPublicKey().toString("base64url"),
    },
  };
  const command = {
    command_id: randomUUID(),
    command_name: "endPhase",
    payload: {},
    expected_version: 0,
    game_id: host.gameId,
    schema: COMMAND_SCHEMA_VERSION,
  };
  const move = () =>
    service.executeCommand(
      service.authenticate(host.credential, host.gameId),
      command,
    );
  const restore = () =>
    new InMemoryGameService({
      pepper,
      now: () => 1_000,
      snapshot: service.exportSnapshot(),
    });
  return { service, host, guest, subscription, command, move, restore, pepper };
}

describe("transaction-owned notification work", () => {
  it("retires matching gone consent after its decision was pruned and the service restarted", () => {
    const f = fixture();
    f.service.setPushSubscription(
      f.guest.credential,
      f.host.gameId,
      f.subscription,
    );
    expect(f.move().ok).toBe(true);
    const claim = f.service.claimPushDelivery()!;
    expect(
      f.service.executeCommand(
        f.service.authenticate(f.guest.credential, f.host.gameId),
        { ...f.command, command_id: randomUUID(), expected_version: 1 },
      ).ok,
    ).toBe(true);
    const snapshot = f.service.exportSnapshot();
    expect(snapshot.pushOutbox).toBeUndefined();
    expect(snapshot.pushDeliveryReceipts).toHaveLength(1);
    const restarted = f.restore();
    restarted.finishPushDelivery(claim.intent.id, randomUUID(), "gone");
    expect(
      restarted.getPushSubscriptionStatus(f.guest.credential, f.host.gameId)
        .enabled,
    ).toBe(true);
    restarted.finishPushDelivery(
      claim.intent.id,
      claim.intent.leaseToken!,
      "gone",
    );
    expect(
      restarted.getPushSubscriptionStatus(f.guest.credential, f.host.gameId)
        .enabled,
    ).toBe(false);
    expect(restarted.exportSnapshot().pushDeliveryReceipts).toBeUndefined();
  });

  it("enqueues only consented recipients once and resumes a private claim without changing replay", () => {
    const f = fixture();
    f.service.setPushSubscription(
      f.guest.credential,
      f.host.gameId,
      f.subscription,
    );
    const result = f.move();
    expect(result.ok).toBe(true);
    expect(f.service.exportSnapshot().pushOutbox).toHaveLength(1);
    expect(f.move()).toEqual(result);
    expect(f.service.exportSnapshot().pushOutbox).toHaveLength(1);
    const restarted = f.restore();
    const claimed = restarted.claimPushDelivery()!;
    expect(claimed.subscription).toEqual(f.subscription);
    expect(claimed.intent).toMatchObject({
      gameId: f.host.gameId,
      eventSequence: 1,
      attempts: 1,
    });
    expect(restarted.claimPushDelivery()).toBeUndefined();
    expect(restarted.getGameState(f.host.gameId)).toEqual(
      f.service.getGameState(f.host.gameId),
    );
    expect(
      JSON.stringify(
        restarted.getRecoveryExport(f.guest.credential, f.host.gameId),
      ),
    ).not.toContain("pushOutbox");
    restarted.finishPushDelivery(
      claimed.intent.id,
      claimed.intent.leaseToken!,
      "sent",
    );
    expect(restarted.exportSnapshot().pushOutbox).toBeUndefined();
  });

  it("does not queue without consent or after the required decision has moved on", () => {
    const f = fixture();
    expect(f.move().ok).toBe(true);
    expect(f.service.claimPushDelivery()).toBeUndefined();
    const withConsent = fixture();
    withConsent.service.setPushSubscription(
      withConsent.guest.credential,
      withConsent.host.gameId,
      withConsent.subscription,
    );
    expect(withConsent.move().ok).toBe(true);
    expect(
      withConsent.service.executeCommand(
        withConsent.service.authenticate(
          withConsent.guest.credential,
          withConsent.host.gameId,
        ),
        {
          ...withConsent.command,
          command_id: randomUUID(),
          expected_version: 1,
        },
      ).ok,
    ).toBe(true);
    expect(withConsent.service.claimPushDelivery()).toBeUndefined();
  });

  it("drops a restored reminder when the same seat now has a different decision", () => {
    const f = fixture();
    f.service.setPushSubscription(
      f.guest.credential,
      f.host.gameId,
      f.subscription,
    );
    expect(f.move().ok).toBe(true);
    const snapshot = f.service.exportSnapshot();
    expect(snapshot.pushOutbox).toHaveLength(1);
    const changed = new InMemoryGameService({
      pepper: f.pepper,
      now: () => 1_000,
      snapshot: {
        ...snapshot,
        games: snapshot.games.map(([id, game]) => [
          id,
          {
            ...game,
            state: { ...game.state, phase: "combat" },
          },
        ]),
      },
    });
    expect(changed.getGameState(f.host.gameId).active_side).toBe("confederate");
    expect(changed.claimPushDelivery()).toBeUndefined();
    expect(changed.exportSnapshot().pushOutbox).toBeUndefined();
  });

  it.each(["opt-out", "replacement", "recovery"])(
    "discards queued and claimed work after %s",
    (cause) => {
      const f = fixture();
      f.service.setPushSubscription(
        f.guest.credential,
        f.host.gameId,
        f.subscription,
      );
      f.move();
      const claim = f.service.claimPushDelivery()!;
      if (cause === "opt-out")
        f.service.removePushSubscription(f.guest.credential, f.host.gameId);
      else if (cause === "replacement")
        f.service.setPushSubscription(
          f.guest.credential,
          f.host.gameId,
          f.subscription,
        );
      else
        f.service.issueSeatRecovery(
          f.host.gameId,
          "confederate",
          "test operator",
        );
      f.service.finishPushDelivery(
        claim.intent.id,
        claim.intent.leaseToken!,
        "gone",
      );
      expect(f.service.exportSnapshot().pushOutbox).toBeUndefined();
      if (cause === "replacement")
        expect(
          f.service.getPushSubscriptionStatus(
            f.guest.credential,
            f.host.gameId,
          ),
        ).toMatchObject({ enabled: true });
    },
  );
});
