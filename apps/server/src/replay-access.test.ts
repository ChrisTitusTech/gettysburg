import { randomBytes, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { COMMAND_SCHEMA_VERSION, RULESET_VERSION } from "@gettysburg/game";
import { SCENARIO_CONTENT_REVISION } from "@gettysburg/content";
import { describe, expect, it, vi } from "vitest";
import {
  InMemoryGameService,
  type GameServiceSnapshot,
} from "./game-service.js";
import { InMemoryAsyncGameService } from "./postgres-store.js";
import { createHttpApplication, SESSION_COOKIE_NAME } from "./http.js";

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
  const act = (command_name: string, payload = {}) => {
    const result = service.executeCommand(
      service.authenticate(host.credential, host.gameId),
      command(command_name, payload),
    );
    expect(result.ok).toBe(true);
    return result;
  };
  const restore = (
    change: (
      record: GameServiceSnapshot["games"][number][1],
    ) => GameServiceSnapshot["games"][number][1],
  ) => {
    const snapshot = service.exportSnapshot();
    return new InMemoryGameService({
      pepper,
      snapshot: {
        ...snapshot,
        games: snapshot.games.map(([id, record]) => [id, change(record)]),
      },
    });
  };
  return { service, host, guest, command, act, restore };
}

describe("authorized replay snapshots", () => {
  it("replays invitation management and host recovery from the same restored snapshot", () => {
    const f = fixture();
    expect(
      f.service.executeCommand(
        f.service.authenticate(f.guest.credential, f.host.gameId),
        f.command("surrenderSeat"),
      ).ok,
    ).toBe(true);
    const invitation = f.service.executeHostCommand(
      f.service.authenticateHost(f.host.credential, f.host.gameId),
      f.command("issueInvitation", { seat: "confederate" }),
    );
    if (!invitation.ok || !invitation.invitation)
      throw new Error("Missing invitation");
    const grant = f.service.issueHostRecovery(f.host.gameId, "test operator");
    const replacement = f.service.claimHostRecovery({
      lookupId: grant.lookup_id,
      secret: grant.secret,
    });
    expect(
      f.service.executeHostCommand(
        f.service.authenticateHost(replacement.credential, f.host.gameId),
        f.command("revokeInvitation", {
          lookup_id: invitation.invitation.lookup_id,
        }),
      ).ok,
    ).toBe(true);
    f.service.createGame("union");
    const restored = f.restore((record) => record);
    const result = restored.getReplay(replacement.credential, f.host.gameId);
    expect(result).toEqual({
      state: f.service.getGameState(f.host.gameId),
      sequence: 4,
      latest_sequence: 4,
    });
    expect(JSON.stringify(result)).not.toContain("authorizingId");
    expect(JSON.stringify(result)).not.toContain(invitation.invitation.secret);
  });

  it("returns isolated historical prefixes to both seats without changing the game", () => {
    const f = fixture();
    const opening = f.host.state;
    f.act("moveStack", {
      unit_ids: ["u-reynolds", "u-wadsworth"],
      destination: "E4",
    });
    const before = f.service.exportSnapshot();
    expect(f.service.getReplay(f.guest.credential, f.host.gameId, 0)).toEqual({
      state: opening,
      sequence: 0,
      latest_sequence: 1,
    });
    const latest = f.service.getReplay(f.host.credential, f.host.gameId);
    expect(latest.state).toEqual(f.service.getGameState(f.host.gameId));
    Object.assign(latest.state.units["u-wadsworth"]!, { location: "W11" });
    expect(f.service.exportSnapshot()).toEqual(before);
  });

  it("allows a current host after surrender but rejects the surrendered guest", () => {
    const f = fixture();
    f.act("surrenderSeat");
    expect(f.service.getReplay(f.host.credential, f.host.gameId).sequence).toBe(
      1,
    );
    expect(
      f.service.executeCommand(
        f.service.authenticate(f.guest.credential, f.host.gameId),
        f.command("surrenderSeat"),
      ).ok,
    ).toBe(true);
    expect(() =>
      f.service.getReplay(f.guest.credential, f.host.gameId),
    ).toThrow(/Current game access/);
  });

  it("uses historical bindings for evidence but only current bindings for access", () => {
    const f = fixture();
    const grant = f.service.issueSeatRecovery(
      f.host.gameId,
      "confederate",
      "private operator identity",
    );
    const recovered = f.service.claimSeatRecovery({
      lookupId: grant.lookup_id,
      secret: grant.secret,
    });
    expect(() =>
      f.service.getReplay(f.guest.credential, f.host.gameId),
    ).toThrow(/Current game access/);
    const result = f.service.getReplay(recovered.credential, f.host.gameId);
    expect(result).toMatchObject({
      sequence: 1,
      state: { version: 0, event_sequence: 1 },
    });
    expect(Object.keys(result).sort()).toEqual([
      "latest_sequence",
      "sequence",
      "state",
    ]);
    for (const secret of [
      grant.secret,
      grant.lookup_id,
      recovered.credential,
      "private operator identity",
    ])
      expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("rejects anonymous, unrelated, expired, and deleted access", () => {
    const f = fixture();
    const other = f.service.createGame("union");
    for (const credential of [undefined, other.credential])
      expect(() => f.service.getReplay(credential, f.host.gameId)).toThrow(
        /Current game access/,
      );
    const pepper = randomBytes(32);
    const expired = new InMemoryGameService({
      pepper,
      now: () => 0,
    });
    const old = expired.createGame("union");
    const oldSnapshot = expired.exportSnapshot();
    const restarted = new InMemoryGameService({
      pepper,
      snapshot: oldSnapshot,
      now: () => 31 * 24 * 60 * 60 * 1000,
    });
    expect(() => restarted.getReplay(old.credential, old.gameId)).toThrow(
      /Current game access/,
    );
    expect(
      f.service.executeHostCommand(
        f.service.authenticateHost(f.host.credential, f.host.gameId),
        f.command("deleteGame", { confirm: true }),
      ).ok,
    ).toBe(true);
    expect(() => f.service.getReplay(f.host.credential, f.host.gameId)).toThrow(
      /Current game access/,
    );
  });

  it.each([-1, 0.5, NaN, Infinity, 1, Number.MAX_SAFE_INTEGER + 1])(
    "rejects cursor %s",
    (cursor) => {
      const f = fixture();
      expect(() =>
        f.service.getReplay(f.host.credential, f.host.gameId, cursor),
      ).toThrow(/Invalid replay sequence/);
    },
  );

  it("fails closed on corrupt history without exposing verifier details", () => {
    const f = fixture();
    f.act("moveUnit", { unit_id: "u-devin", destination: "P7" });
    const corrupt = f.restore((record) => {
      const actions = structuredClone(record.actions);
      const result = actions[0]!.result;
      if (!result?.ok) throw new Error("Missing accepted result");
      Object.assign(result.event, { summary: "private data" });
      return { ...record, actions };
    });
    expect(() => corrupt.getReplay(f.host.credential, f.host.gameId)).toThrow(
      /^Replay is unavailable\.$/,
    );
    const gap = f.restore((record) => ({ ...record, actions: [] }));
    expect(() => gap.getReplay(f.host.credential, f.host.gameId, 0)).toThrow(
      /^Replay is unavailable\.$/,
    );
  });

  it("never interprets a retained saved version using mandatory defaults", () => {
    const f = fixture();
    const retained = f.restore((record) => ({
      ...record,
      state: {
        ...record.state,
        ruleset_version: RULESET_VERSION,
        content_revision: SCENARIO_CONTENT_REVISION,
      },
    }));
    expect(retained.getGameState(f.host.gameId).ruleset_version).toBe(
      RULESET_VERSION,
    );
    expect(() => retained.getReplay(f.host.credential, f.host.gameId)).toThrow(
      /unavailable for this saved version/,
    );
  });
});

describe("replay work bounds", () => {
  it("bounds the requested prefix before running synchronous verification", () => {
    const f = fixture();
    f.act("moveUnit", { unit_id: "u-devin", destination: "P7" });
    const large = f.restore((record) => ({
      ...record,
      state: { ...record.state, event_sequence: 10_001 },
      actions: Array.from({ length: 10_001 }, () => record.actions[0]!),
    }));
    expect(() => large.getReplay(f.host.credential, f.host.gameId)).toThrow(
      /^Replay is unavailable\.$/,
    );
  });
});

describe("replay HTTP boundary", () => {
  it.each(["session", "source", "global"] as const)(
    "limits %s attempts before readiness/reconstruction and expires the window",
    async (scope) => {
      const f = fixture();
      const service = new InMemoryAsyncGameService(f.service);
      const replay = vi.spyOn(service, "getReplay").mockResolvedValue({
        state: f.host.state,
        sequence: 0,
        latest_sequence: 0,
      });
      let now = Date.now();
      const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
      const isReady = vi.fn(() => true);
      const app = createHttpApplication({ isReady }, service);
      const server = app.listen(0, "127.0.0.1");
      await new Promise<void>((resolve) => server.once("listening", resolve));
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/games/${f.host.gameId}/replay`;
      const request = (index: number) =>
        fetch(url, {
          headers: {
            cookie: `${SESSION_COOKIE_NAME}=${scope === "session" ? f.host.credential : String(index)}`,
            "x-forwarded-for":
              scope === "source"
                ? "192.0.2.1"
                : `198.51.${Math.floor(index / 250)}.${(index % 250) + 1}`,
          },
        });
      const limit = scope === "session" ? 30 : scope === "source" ? 60 : 300;
      try {
        for (let attempt = 0; attempt < limit; attempt++)
          expect((await request(attempt)).status).toBe(200);
        const denied = await request(limit);
        expect(denied.status).toBe(429);
        expect(denied.headers.get("retry-after")).toBe("60");
        expect(denied.headers.get("cache-control")).toBe("no-store");
        expect(await denied.json()).toEqual({ error: "replay_rate_limited" });
        expect(replay).toHaveBeenCalledTimes(limit);
        expect(isReady).toHaveBeenCalledTimes(limit);
        now += 60_001;
        expect((await request(limit)).status).toBe(200);
        expect(replay).toHaveBeenCalledTimes(limit + 1);
        expect(isReady).toHaveBeenCalledTimes(limit + 1);
      } finally {
        clock.mockRestore();
        replay.mockRestore();
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    },
  );

  it("bounds anonymous readiness reads when the service is unavailable", async () => {
    const f = fixture();
    const service = new InMemoryAsyncGameService(f.service);
    const replay = vi.spyOn(service, "getReplay");
    const isReady = vi.fn(() => false);
    const app = createHttpApplication({ isReady }, service);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/games/${f.host.gameId}/replay`;
    try {
      for (let attempt = 0; attempt < 30; attempt++)
        expect((await fetch(url)).status).toBe(503);
      const denied = await fetch(url);
      expect(denied.status).toBe(429);
      expect(denied.headers.get("cache-control")).toBe("no-store");
      expect(denied.headers.get("retry-after")).toBe("60");
      expect(isReady).toHaveBeenCalledTimes(30);
      expect(replay).not.toHaveBeenCalled();
    } finally {
      replay.mockRestore();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("checks access, strict cursors, no-store responses, and readiness", async () => {
    const f = fixture();
    let ready = true;
    const app = createHttpApplication(
      { isReady: () => ready },
      new InMemoryAsyncGameService(f.service),
    );
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const url = `${origin}/api/games/${f.host.gameId}/replay`;
    const headers = { cookie: `${SESSION_COOKIE_NAME}=${f.guest.credential}` };
    try {
      expect((await fetch(url)).status).toBe(401);
      const response = await fetch(`${url}?sequence=0`, { headers });
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({
        state: f.host.state,
        sequence: 0,
        latest_sequence: 0,
      });
      for (const query of [
        "sequence=-1",
        "sequence=0.5",
        "sequence=1",
        "sequence=01",
        "sequence=",
        "sequence=1e2",
        "sequence=0&sequence=0",
        "sequence[x]=0",
      ])
        expect(
          (await fetch(`${url}?${query}`, { headers })).status,
          query,
        ).toBe(400);
      ready = false;
      expect((await fetch(url, { headers })).status).toBe(503);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
