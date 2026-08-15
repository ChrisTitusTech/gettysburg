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

  it("describes the Phase 1 in-memory readiness boundary", async () => {
    await withServer(true, async (origin) => {
      const response = await fetch(`${origin}/readyz`);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        durability: "process-lifetime",
        mode: "in-memory",
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
