import { type AddressInfo } from "node:net";

import { describe, expect, it } from "vitest";

import { createHttpApplication } from "./http.js";

async function withServer(
  isReady: boolean,
  assertion: (origin: string) => Promise<void>,
) {
  const app = createHttpApplication({ isReady: () => isReady });
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
});

describe("HTTP game lifecycle", () => {
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
          body: JSON.stringify({ secret: created.invitation.secret }),
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
          body: JSON.stringify({ secret: created.invitation.secret }),
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
});
