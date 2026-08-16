import { type AddressInfo } from "node:net";
import { randomBytes, randomUUID } from "node:crypto";

import { COMMAND_SCHEMA_VERSION } from "@gettysburg/game";
import { describe, expect, it, vi } from "vitest";

import { createHttpApplication } from "./http.js";
import {
  type GameServiceSnapshot,
  InMemoryGameService,
} from "./game-service.js";
import { InMemoryAsyncGameService } from "./postgres-store.js";

async function withServer(
  isReady: boolean | (() => boolean),
  assertion: (origin: string) => Promise<void>,
  gameService?: InMemoryAsyncGameService,
) {
  const app = createHttpApplication(
    {
      isReady: () => (typeof isReady === "function" ? isReady() : isReady),
    },
    gameService,
  );
  const server = app.listen(0, "127.0.0.1");

  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  const address = server.address() as AddressInfo;

  try {
    await assertion(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) =>
        error === undefined ? resolve() : reject(error),
      );
    });
  }
}

describe("service health", () => {
  it("reports process liveness without internal detail", async () => {
    await withServer(true, async (origin) => {
      const response = await fetch(`${origin}/healthz`);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "ok" });
    });
  });

  it("describes the Phase 2 restart-safe readiness boundary", async () => {
    await withServer(true, async (origin) => {
      const response = await fetch(`${origin}/readyz`);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        durability: "restart-safe",
        mode: "postgresql",
        status: "ready",
      });
    });
  });

  it("fails readiness when an application dependency is unavailable", async () => {
    await withServer(false, async (origin) => {
      const response = await fetch(`${origin}/readyz`);

      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ status: "unavailable" });
    });
  });

  it("blocks gameplay APIs when readiness is unavailable", async () => {
    await withServer(false, async (origin) => {
      const response = await fetch(`${origin}/api/games`, {
        body: JSON.stringify({ seat: "union" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: "service_unavailable",
      });
    });
  });

  it("falls back to 503 when recovery export fails while readiness is closed", async () => {
    const service = new InMemoryAsyncGameService();
    vi.spyOn(service, "getRecoveryExport").mockRejectedValue(
      new Error("database unavailable"),
    );
    await withServer(
      false,
      async (origin) => {
        const response = await fetch(
          `${origin}/api/games/11111111-1111-4111-8111-111111111111/export`,
        );
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({
          error: "service_unavailable",
        });
      },
      service,
    );
  });
});

describe("HTTP game lifecycle", () => {
  it("rate-limits distinct anonymous creations while allowing retries", async () => {
    await withServer(true, async (origin) => {
      const requests = Array.from({ length: 10 }, () => ({
        creationCredential: randomBytes(32).toString("base64url"),
        creationId: randomUUID(),
      }));
      const create = (request: (typeof requests)[number]) =>
        fetch(`${origin}/api/games`, {
          body: JSON.stringify({
            creation_credential: request.creationCredential,
            creation_id: request.creationId,
            seat: "union",
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        });

      for (const request of requests) {
        expect((await create(request)).status).toBe(201);
      }
      expect((await create(requests[9]!)).status).toBe(201);
      const limited = await create({
        creationCredential: randomBytes(32).toString("base64url"),
        creationId: randomUUID(),
      });
      expect(limited.status).toBe(429);
      expect(limited.headers.get("retry-after")).toBe("900");
      expect(await limited.json()).toEqual({
        error: "creation_rate_limited",
      });
    });
  });

  it("rate-limits bearer claims across invitation and recovery endpoints", async () => {
    await withServer(true, async (origin) => {
      const paths = ["/api/invitations", "/api/recovery", "/api/host-recovery"];
      const claim = (attempt: number) =>
        fetch(
          `${origin}${paths[attempt % paths.length]}/${randomUUID()}/claim`,
          {
            body: JSON.stringify({
              claim_id: randomUUID(),
              secret: "A".repeat(43),
            }),
            headers: { "content-type": "application/json" },
            method: "POST",
          },
        );

      for (let attempt = 0; attempt < 20; attempt += 1) {
        expect((await claim(attempt)).status).toBe(409);
      }
      const limited = await claim(20);
      expect(limited.status).toBe(429);
      expect(limited.headers.get("retry-after")).toBe("900");
      expect(await limited.json()).toEqual({ error: "claim_rate_limited" });
    });
  });

  it("rejects a malformed creation id distinctly from the seat", async () => {
    await withServer(true, async (origin) => {
      const response = await fetch(`${origin}/api/games`, {
        body: JSON.stringify({ creation_id: "bad", seat: "union" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_creation_id" });
    });
  });

  it("replays game creation after a lost response", async () => {
    const service = new InMemoryAsyncGameService();
    await withServer(
      true,
      async (origin) => {
        const creationId = "11111111-1111-4111-8111-111111111111";
        const create = () =>
          fetch(`${origin}/api/games`, {
            body: JSON.stringify({
              creation_credential: "A".repeat(43),
              creation_id: creationId,
              seat: "union",
            }),
            headers: { "content-type": "application/json" },
            method: "POST",
          });
        const first = await create();
        const firstBody = await first.json();
        const replay = await create();

        expect(replay.status).toBe(201);
        expect(await replay.json()).toEqual(firstBody);
        expect(replay.headers.get("set-cookie")).toBe(
          first.headers.get("set-cookie"),
        );
        expect(service.service.exportSnapshot().games).toHaveLength(1);
      },
      service,
    );
  });

  it("creates a game with a hardened browser-session cookie", async () => {
    await withServer(true, async (origin) => {
      const response = await fetch(`${origin}/api/games`, {
        body: JSON.stringify({ seat: "confederate" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      expect(response.status).toBe(201);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      const setCookie = response.headers.get("set-cookie") ?? "";
      expect(setCookie).toContain("__Host-gettysburg-session=");
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("Secure");
      expect(setCookie).toContain("SameSite=Strict");
      expect(setCookie).toContain("Path=/");
      expect(setCookie).toContain("Max-Age=");
      expect(setCookie).not.toContain("Domain=");

      const body = (await response.json()) as {
        game_id: string;
        invitation: { lookup_id: string; secret: string };
      };
      expect(body.game_id).toBeTypeOf("string");
      expect(body.invitation.secret).toHaveLength(43);
    });
  });

  it("claims an invitation once and authorizes game resume with the cookie", async () => {
    await withServer(true, async (origin) => {
      const createResponse = await fetch(`${origin}/api/games`, {
        body: JSON.stringify({ seat: "union" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const created = (await createResponse.json()) as {
        game_id: string;
        invitation: { lookup_id: string; secret: string };
      };
      const claimResponse = await fetch(
        `${origin}/api/invitations/${created.invitation.lookup_id}/claim`,
        {
          body: JSON.stringify({
            claim_id: "22222222-2222-4222-8222-222222222222",
            secret: created.invitation.secret,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      );

      expect(claimResponse.status).toBe(200);
      const guestCookie = (claimResponse.headers.get("set-cookie") ?? "").split(
        ";",
        1,
      )[0];
      const resumeResponse = await fetch(
        `${origin}/api/games/${created.game_id}`,
        { headers: { cookie: guestCookie ?? "" } },
      );
      expect(resumeResponse.status).toBe(200);
      expect(await resumeResponse.json()).toMatchObject({
        game_id: created.game_id,
        seat: "confederate",
      });

      const replayResponse = await fetch(
        `${origin}/api/invitations/${created.invitation.lookup_id}/claim`,
        {
          body: JSON.stringify({
            claim_id: "33333333-3333-4333-8333-333333333333",
            secret: created.invitation.secret,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      );
      expect(replayResponse.status).toBe(409);
      expect(await replayResponse.json()).toMatchObject({
        error: "invitation_unavailable",
      });
    });
  });

  it("authorizes host invitation management and deletion with the session cookie", async () => {
    await withServer(true, async (origin) => {
      const createResponse = await fetch(`${origin}/api/games`, {
        body: JSON.stringify({ seat: "union" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const created = (await createResponse.json()) as {
        game_id: string;
        invitation: { lookup_id: string; secret: string };
        is_host: boolean;
      };
      expect(created.is_host).toBe(true);
      const hostCookie = (createResponse.headers.get("set-cookie") ?? "").split(
        ";",
        1,
      )[0]!;
      const command = (
        commandName: "deleteGame" | "issueInvitation" | "revokeInvitation",
        payload: Record<string, unknown>,
      ) => ({
        command_id: randomUUID(),
        command_name: commandName,
        expected_version: 0,
        game_id: created.game_id,
        payload,
        schema: COMMAND_SCHEMA_VERSION,
      });

      const revokeResponse = await fetch(
        `${origin}/api/games/${created.game_id}/host-commands`,
        {
          body: JSON.stringify(
            command("revokeInvitation", {
              lookup_id: created.invitation.lookup_id,
            }),
          ),
          headers: {
            "content-type": "application/json",
            cookie: hostCookie,
          },
          method: "POST",
        },
      );
      expect(revokeResponse.status).toBe(200);

      const issueResponse = await fetch(
        `${origin}/api/games/${created.game_id}/host-commands`,
        {
          body: JSON.stringify(
            command("issueInvitation", { seat: "confederate" }),
          ),
          headers: {
            "content-type": "application/json",
            cookie: hostCookie,
          },
          method: "POST",
        },
      );
      expect(issueResponse.status).toBe(200);
      expect(await issueResponse.json()).toMatchObject({
        invitation: { secret: expect.any(String) },
        ok: true,
      });

      const resumedHost = await fetch(
        `${origin}/api/games/${created.game_id}`,
        { headers: { cookie: hostCookie } },
      );
      expect(await resumedHost.json()).toMatchObject({
        action_log: [
          { command_name: "revokeInvitation", kind: "host_management" },
          { command_name: "issueInvitation", kind: "host_management" },
        ],
        active_invitations: [
          { lookup_id: expect.any(String), seat: "confederate" },
        ],
        is_host: true,
      });

      const deleteResponse = await fetch(
        `${origin}/api/games/${created.game_id}/host-commands`,
        {
          body: JSON.stringify(command("deleteGame", { confirm: true })),
          headers: {
            "content-type": "application/json",
            cookie: hostCookie,
          },
          method: "POST",
        },
      );
      expect(deleteResponse.status).toBe(200);
      expect(await deleteResponse.json()).toMatchObject({
        event: { command_name: "deleteGame", state_version: 0 },
        ok: true,
      });
    });
  });

  it("allows only a stored terminal-delete retry while readiness is unavailable", async () => {
    let ready = true;
    await withServer(
      () => ready,
      async (origin) => {
        const createResponse = await fetch(`${origin}/api/games`, {
          body: JSON.stringify({ seat: "union" }),
          headers: { "content-type": "application/json" },
          method: "POST",
        });
        const created = (await createResponse.json()) as { game_id: string };
        const hostCookie = (
          createResponse.headers.get("set-cookie") ?? ""
        ).split(";", 1)[0]!;
        const deletion = {
          command_id: randomUUID(),
          command_name: "deleteGame",
          expected_version: 0,
          game_id: created.game_id,
          payload: { confirm: true },
          schema: COMMAND_SCHEMA_VERSION,
        } as const;
        const request = (command: typeof deletion) =>
          fetch(`${origin}/api/games/${created.game_id}/host-commands`, {
            body: JSON.stringify(command),
            headers: {
              "content-type": "application/json",
              cookie: hostCookie,
            },
            method: "POST",
          });

        const accepted = await request(deletion);
        expect(accepted.status).toBe(200);
        const acceptedBody = await accepted.json();
        ready = false;
        const retry = await request(deletion);
        expect(retry.status).toBe(200);
        expect(await retry.json()).toEqual(acceptedBody);
        const differentDelete = await request({
          ...deletion,
          command_id: randomUUID(),
        });
        expect(differentDelete.status).toBe(503);
      },
    );
  });

  it("allows authenticated recovery export while version readiness is closed", async () => {
    const pepper = new Uint8Array(32).fill(7);
    const original = new InMemoryGameService({ pepper });
    const created = original.createGame("union");
    const snapshot = original.exportSnapshot();
    const unavailableSnapshot: GameServiceSnapshot = {
      ...snapshot,
      games: snapshot.games.map(([gameId, game]) => [
        gameId,
        {
          ...game,
          state: {
            ...game.state,
            ruleset_version: "unavailable-ruleset",
          },
        },
      ]),
    };
    const service = new InMemoryAsyncGameService(
      new InMemoryGameService({ pepper, snapshot: unavailableSnapshot }),
    );
    await withServer(
      false,
      async (origin) => {
        const response = await fetch(
          `${origin}/api/games/${created.gameId}/export`,
          {
            headers: {
              cookie: `__Host-gettysburg-session=${created.credential}`,
            },
          },
        );
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
          action_log: [],
          snapshot_metadata: {
            content_revision: expect.any(String),
            game_id: created.gameId,
            ruleset_version: "unavailable-ruleset",
            state_version: 0,
          },
        });

        const unauthorized = await fetch(
          `${origin}/api/games/${created.gameId}/export`,
        );
        expect(unauthorized.status).toBe(401);
      },
      service,
    );
  });
});
