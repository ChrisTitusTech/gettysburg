import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { describe, expect, it, vi } from "vitest";
import { configureHttpApplication } from "./http.js";
import { InMemoryAsyncGameService } from "./postgres-store.js";

async function withServer(
  check: (origin: string, ready: ReturnType<typeof vi.fn>) => Promise<void>,
) {
  const directory = await mkdtemp(join(tmpdir(), "gettysburg-limit-"));
  await writeFile(join(directory, "index.html"), "<!doctype html><p>game</p>");
  const ready = vi.fn(() => true);
  const app = configureHttpApplication(express(), {
    gameService: new InMemoryAsyncGameService(),
    readiness: { isReady: ready },
    staticDirectory: directory,
  });
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise<void>((resolve) => server.once("listening", resolve));
    await check(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      ready,
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await rm(directory, { recursive: true, force: true });
  }
}

async function exhaust(origin: string, source: string, count: number) {
  for (let index = 0; index < count; index += 1) {
    const response = await fetch(`${origin}/api/push-config`, {
      headers: { "x-forwarded-for": source },
    });
    expect(response.status).toBe(200);
    await response.arrayBuffer();
  }
}

describe("public HTTP request budgets", () => {
  it("blocks host commands, readiness, and static fallback before expensive work", async () => {
    await withServer(async (origin, ready) => {
      const source = "192.0.2.1";
      await exhaust(origin, source, 600);
      for (const [path, method] of [
        ["/api/games/invalid/host-commands", "POST"],
        ["/readyz", "GET"],
        ["/game", "GET"],
        ["/index.html", "GET"],
      ] as const) {
        const response = await fetch(`${origin}${path}`, {
          method,
          headers: {
            "x-forwarded-for": source,
            "content-type": "application/json",
            // Invalid JSON also proves rejection precedes body parsing.
            cookie: "__Host-gettysburg-session=changed",
          },
          ...(method === "POST" ? { body: "{" } : {}),
        });
        expect(response.status).toBe(429);
        expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
        expect(await response.json()).toEqual({ error: "http_rate_limited" });
      }
      expect(ready).not.toHaveBeenCalled();
      const health = await fetch(`${origin}/healthz`, {
        headers: { "x-forwarded-for": source },
      });
      expect(health.status).toBe(200);
      expect(await health.json()).toEqual({ status: "ok" });
      const other = await fetch(`${origin}/game`, {
        headers: { "x-forwarded-for": "192.0.2.2" },
      });
      expect(other.status).toBe(200);
      expect(await other.text()).toContain("<p>game</p>");
    });
  });

  it("bounds aggregate traffic even when callers change source addresses", async () => {
    await withServer(async (origin, ready) => {
      for (let source = 1; source <= 2; source += 1) {
        await exhaust(origin, `192.0.2.${source}`, 600);
      }
      const response = await fetch(`${origin}/readyz`, {
        headers: { "x-forwarded-for": "192.0.2.6" },
      });
      expect(response.status).toBe(429);
      await response.arrayBuffer();
      expect(ready).not.toHaveBeenCalled();
    });
  });

  it("groups IPv6 addresses within a source subnet", async () => {
    await withServer(async (origin, ready) => {
      await exhaust(origin, "2001:db8:1234:5600::1", 600);
      const response = await fetch(`${origin}/readyz`, {
        headers: { "x-forwarded-for": "2001:db8:1234:56ff::2" },
      });
      expect(response.status).toBe(429);
      await response.arrayBuffer();
      expect(ready).not.toHaveBeenCalled();
    });
  });
});
