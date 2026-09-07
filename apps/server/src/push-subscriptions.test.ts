import { createECDH, randomBytes, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { COMMAND_SCHEMA_VERSION } from "@gettysburg/game";
import { describe, expect, it, vi } from "vitest";
import {
  InMemoryGameService,
  type GameServiceSnapshot,
} from "./game-service.js";
import { InMemoryAsyncGameService } from "./postgres-store.js";
import { createHttpApplication, SESSION_COOKIE_NAME } from "./http.js";

function fixture() {
  let now = 1_000;
  const pepper = randomBytes(32);
  const service = new InMemoryGameService({ pepper, now: () => now });
  const host = service.createGame("union");
  const guest = service.claimInvitation({
    lookupId: host.invitation.lookup_id,
    secret: host.invitation.secret,
  });
  const key = createECDH("prime256v1");
  key.generateKeys();
  const subscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/test-private-endpoint",
    expirationTime: null,
    keys: {
      auth: randomBytes(16).toString("base64url"),
      p256dh: key.getPublicKey().toString("base64url"),
    },
  };
  const command = (command_name: string, payload = {}) => ({
    command_id: randomUUID(),
    command_name,
    payload,
    game_id: host.gameId,
    expected_version: service.getGameState(host.gameId).version,
    schema: COMMAND_SCHEMA_VERSION,
  });
  const restore = (snapshot = service.exportSnapshot()) =>
    new InMemoryGameService({ pepper, now: () => now, snapshot });
  return {
    service,
    host,
    guest,
    subscription,
    command,
    restore,
    clock: (value: number) => {
      now = value;
    },
  };
}

describe("seat-bound push consent", () => {
  it("rejects observer consent and ignores malformed optional collections on restore", () => {
    const f = fixture();
    const issued = f.service.executeHostCommand(
      f.service.authenticateHost(f.host.credential, f.host.gameId),
      f.command("issueSpectatorInvitation"),
    );
    if (!issued.ok || !issued.invitation) throw new Error("Missing invitation");
    const observer = f.service.claimSpectatorInvitation({
      claimId: randomUUID(),
      lookupId: issued.invitation.lookup_id,
      secret: issued.invitation.secret,
    });
    expect(() =>
      f.service.setPushSubscription(
        observer.credential,
        f.host.gameId,
        f.subscription,
      ),
    ).toThrow(/seat/i);
    for (const value of [null, {}, "invalid", [null, {}]]) {
      const restored = f.restore({
        ...f.service.exportSnapshot(),
        pushSubscriptions: value,
      } as unknown as GameServiceSnapshot);
      expect(restored.exportSnapshot().pushSubscriptions).toBeUndefined();
      expect(restored.getGameState(f.host.gameId)).toEqual(
        f.service.getGameState(f.host.gameId),
      );
    }
  });

  it("stores one encrypted subscription per seat without changing gameplay or exposing credentials", () => {
    const f = fixture();
    const before = f.service.getGameState(f.host.gameId);
    expect(
      f.service.getPushSubscriptionStatus(f.host.credential, f.host.gameId),
    ).toEqual({ enabled: false });
    const status = f.service.setPushSubscription(
      f.host.credential,
      f.host.gameId,
      f.subscription,
    );
    expect(status).toEqual({
      enabled: true,
      expires_at: 1_000 + 30 * 24 * 60 * 60 * 1_000,
    });
    f.service.setPushSubscription(
      f.host.credential,
      f.host.gameId,
      f.subscription,
    );
    const snapshot = f.service.exportSnapshot();
    expect(snapshot.pushSubscriptions).toHaveLength(1);
    for (const secret of [
      f.subscription.endpoint,
      f.subscription.keys.auth,
      f.subscription.keys.p256dh,
    ]) {
      expect(JSON.stringify(snapshot)).not.toContain(secret);
      expect(
        JSON.stringify(
          f.service.getRecoveryExport(f.host.credential, f.host.gameId),
        ),
      ).not.toContain(secret);
    }
    expect(
      f.restore().getPushSubscriptionStatus(f.host.credential, f.host.gameId),
    ).toEqual(status);
    expect(f.service.getGameState(f.host.gameId)).toEqual(before);
    expect(f.service.getActions(f.host.gameId)).toEqual([]);
    f.service.removePushSubscription(f.guest.credential, f.host.gameId);
    expect(
      f.service.getPushSubscriptionStatus(f.host.credential, f.host.gameId),
    ).toEqual(status);
    expect(
      f.service.removePushSubscription(f.host.credential, f.host.gameId),
    ).toEqual({ enabled: false });
    expect(f.service.exportSnapshot().pushSubscriptions).toBeUndefined();
  });

  it("requires a current seat, rejects unsupported input, and permits same-browser opt-out after surrender", () => {
    const f = fixture();
    for (const credential of [
      undefined,
      f.service.createGame("union").credential,
    ]) {
      expect(() =>
        f.service.setPushSubscription(
          credential,
          f.host.gameId,
          f.subscription,
        ),
      ).toThrow(/seat|session/i);
    }
    expect(() =>
      f.service.setPushSubscription(f.host.credential, f.host.gameId, {}),
    ).toThrow(/Invalid/);
    expect(() =>
      f.service.setPushSubscription(f.host.credential, f.host.gameId, {
        ...f.subscription,
        expirationTime: 999,
      }),
    ).toThrow(/expired/);
    f.service.setPushSubscription(
      f.host.credential,
      f.host.gameId,
      f.subscription,
    );
    expect(
      f.service.executeCommand(
        f.service.authenticate(f.host.credential, f.host.gameId),
        f.command("surrenderSeat"),
      ).ok,
    ).toBe(true);
    expect(() =>
      f.service.setPushSubscription(
        f.host.credential,
        f.host.gameId,
        f.subscription,
      ),
    ).toThrow(/seat/i);
    expect(
      f.service.removePushSubscription(f.host.credential, f.host.gameId),
    ).toEqual({ enabled: false });
    expect(f.service.exportSnapshot().pushSubscriptions).toBeUndefined();
  });

  it("expires consent and drops damaged or rebound credentials without blocking game resume", () => {
    const f = fixture();
    f.service.setPushSubscription(f.host.credential, f.host.gameId, {
      ...f.subscription,
      expirationTime: 2_000,
    });
    const saved = f.service.exportSnapshot();
    const record = saved.pushSubscriptions![0]!;
    for (const modified of [
      { ...record, sealed: "bad" },
      {
        ...record,
        bindingId: f.service.authenticate(f.guest.credential, f.host.gameId)
          .bindingId,
      },
    ]) {
      const restored = f.restore({ ...saved, pushSubscriptions: [modified] });
      expect(
        restored.getPushSubscriptionStatus(f.host.credential, f.host.gameId),
      ).toEqual({ enabled: false });
      expect(restored.getGameState(f.host.gameId)).toEqual(f.host.state);
    }
    f.clock(2_001);
    expect(
      f.restore().getPushSubscriptionStatus(f.host.credential, f.host.gameId),
    ).toEqual({ enabled: false });
    expect(f.service.exportSnapshot().pushSubscriptions).toBeUndefined();
  });

  it("removes consent on seat recovery and game deletion without transferring it", () => {
    const f = fixture();
    f.service.setPushSubscription(
      f.guest.credential,
      f.host.gameId,
      f.subscription,
    );
    const grant = f.service.issueSeatRecovery(
      f.host.gameId,
      "confederate",
      "test operator",
    );
    const replacement = f.service.claimSeatRecovery({
      lookupId: grant.lookup_id,
      secret: grant.secret,
    });
    expect(
      f.service.getPushSubscriptionStatus(
        replacement.credential,
        f.host.gameId,
      ),
    ).toEqual({ enabled: false });
    expect(f.service.exportSnapshot().pushSubscriptions).toBeUndefined();
    f.service.setPushSubscription(
      f.host.credential,
      f.host.gameId,
      f.subscription,
    );
    expect(
      f.service.executeHostCommand(
        f.service.authenticateHost(f.host.credential, f.host.gameId),
        f.command("deleteGame", { confirm: true }),
      ).ok,
    ).toBe(true);
    expect(f.service.exportSnapshot().pushSubscriptions).toBeUndefined();
  });

  it("enforces origin and session ownership at HTTP routes without returning subscription secrets", async () => {
    const f = fixture();
    const application = createHttpApplication(
      { isReady: () => true },
      new InMemoryAsyncGameService(f.service),
    );
    const server = application.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const path = `${origin}/api/games/${f.host.gameId}/push-subscription`;
    const headers = {
      origin,
      cookie: `${SESSION_COOKIE_NAME}=${f.host.credential}`,
      "content-type": "application/json",
    };
    try {
      expect(
        (
          await fetch(path, {
            method: "PUT",
            headers: { ...headers, origin: "https://attacker.example" },
            body: JSON.stringify(f.subscription),
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await fetch(path, {
            method: "PUT",
            headers: { origin, "content-type": "application/json" },
            body: JSON.stringify(f.subscription),
          })
        ).status,
      ).toBe(401);
      const enabled = await fetch(path, {
        method: "PUT",
        headers,
        body: JSON.stringify(f.subscription),
      });
      expect(enabled.status).toBe(200);
      expect(enabled.headers.get("cache-control")).toBe("no-store");
      expect(await enabled.json()).toEqual({
        enabled: true,
        expires_at: 1_000 + 30 * 24 * 60 * 60 * 1_000,
      });
      expect(await (await fetch(path, { headers })).json()).toMatchObject({
        enabled: true,
      });
      expect(
        (
          await fetch(path, {
            method: "DELETE",
            headers: { ...headers, origin: "https://attacker.example" },
          })
        ).status,
      ).toBe(403);
      expect(
        await (await fetch(path, { method: "DELETE", headers })).json(),
      ).toEqual({ enabled: false });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("rate limits before readiness or database reads", async () => {
    const f = fixture();
    const readiness = { isReady: vi.fn().mockReturnValue(true) };
    const server = createHttpApplication(
      readiness,
      new InMemoryAsyncGameService(f.service),
    ).listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      for (let index = 0; index < 31; index++) {
        const response = await fetch(
          `${origin}/api/games/${f.host.gameId}/push-subscription`,
          {
            headers: { cookie: `${SESSION_COOKIE_NAME}=${f.host.credential}` },
          },
        );
        expect(response.status).toBe(index < 30 ? 200 : 429);
      }
      expect(readiness.isReady).toHaveBeenCalledTimes(30);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
