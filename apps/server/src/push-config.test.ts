import { execFileSync } from "node:child_process";
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPushVapidFile, loadPushVapid } from "./push-config.js";
import express from "express";
import { configureHttpApplication } from "./http.js";
import { InMemoryAsyncGameService } from "./postgres-store.js";

const directories: string[] = [];
async function target() {
  const directory = await mkdtemp(join(tmpdir(), "gettysburg-push-config-"));
  directories.push(directory);
  return join(directory, "push.json");
}
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("persistent optional VAPID configuration", () => {
  it("is disabled by default and generates a protected stable key only on explicit creation", async () => {
    expect(await loadPushVapid(undefined)).toBeUndefined();
    const file = await target();
    await createPushVapidFile(file, "mailto:push@example.com");
    const original = await loadPushVapid(file);
    expect(original?.subject).toBe("mailto:push@example.com");
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    await expect(
      createPushVapidFile(file, "mailto:other@example.com"),
    ).rejects.toThrow(/never overwritten/);
    expect(await loadPushVapid(file)).toEqual(original);
  });

  it("rejects missing, overexposed, symlinked, oversized, and non-regular inputs", async () => {
    const file = await target();
    await expect(loadPushVapid(file)).rejects.toThrow(/owner-only/);
    await createPushVapidFile(file, "mailto:push@example.com");
    await chmod(file, 0o644);
    await expect(loadPushVapid(file)).rejects.toThrow(/owner-only/);
    await chmod(file, 0o600);
    await symlink(file, `${file}.link`);
    await expect(loadPushVapid(`${file}.link`)).rejects.toThrow(/owner-only/);
    await writeFile(file, "x".repeat(8_193));
    await expect(loadPushVapid(file)).rejects.toThrow(/owner-only/);
    const fifo = `${file}.fifo`;
    execFileSync("mkfifo", [fifo]);
    await chmod(fifo, 0o600);
    await expect(loadPushVapid(fifo)).rejects.toThrow(/owner-only/);
  });

  it("rejects malformed or mismatched key material without echoing it", async () => {
    const file = await target();
    const other = await target();
    await createPushVapidFile(file, "mailto:push@example.com");
    await createPushVapidFile(other, "mailto:push@example.com");
    const original = (await loadPushVapid(file))!;
    const otherConfig = (await loadPushVapid(other))!;
    for (const bad of [
      { ...original, privateKey: otherConfig.privateKey },
      { ...original, subject: "http://example.com" },
      { ...original, subject: "mailto:" },
      { ...original, extra: "unexpected" },
      { ...original, privateKey: `${original.privateKey}=` },
      null,
    ]) {
      await writeFile(file, JSON.stringify(bad));
      await expect(loadPushVapid(file)).rejects.toThrow(
        "Push VAPID configuration must be a valid owner-only 0600 file.",
      );
    }
  });

  it("provides a key-generation CLI with no private material on stdout", async () => {
    const file = await target();
    const cli = fileURLToPath(new URL("./push-vapid-cli.ts", import.meta.url));
    const output = execFileSync(
      process.execPath,
      ["--import", "tsx", cli, file, "mailto:push@example.com"],
      { encoding: "utf8" },
    );
    const config = (await loadPushVapid(file))!;
    expect(output).toContain("configuration created");
    expect(output).not.toContain(config.privateKey);
    const before = await readFile(file, "utf8");
    expect(() =>
      execFileSync(
        process.execPath,
        ["--import", "tsx", cli, file, "mailto:push@example.com"],
        { stdio: "pipe" },
      ),
    ).toThrow();
    expect(await readFile(file, "utf8")).toBe(before);
  });

  it.each([false, true])(
    "exposes only public capability metadata (enabled=%s) without a database read",
    async (enabled) => {
      const isReady = vi.fn(async () => false);
      const server = configureHttpApplication(express(), {
        gameService: new InMemoryAsyncGameService(),
        readiness: { isReady },
        ...(enabled ? { pushPublicKey: "public-test-key" } : {}),
      }).listen(0, "127.0.0.1");
      await new Promise<void>((resolve) => server.once("listening", resolve));
      try {
        const response = await fetch(
          `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/push-config`,
        );
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await response.json()).toEqual(
          enabled
            ? { enabled: true, applicationServerKey: "public-test-key" }
            : { enabled: false },
        );
        expect(isReady).not.toHaveBeenCalled();
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    },
  );
});
