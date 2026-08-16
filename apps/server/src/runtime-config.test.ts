import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  isDeletionLedgerAcknowledged,
  loadDeletionLedgerWatermark,
} from "./runtime-config.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function watermarkFile(contents: string) {
  const directory = await mkdtemp(join(tmpdir(), "gettysburg-watermark-"));
  temporaryDirectories.push(directory);
  const file = join(directory, "watermark");
  await writeFile(file, contents);
  return file;
}

describe("loadDeletionLedgerWatermark", () => {
  it("accepts a canonical nonnegative integer", async () => {
    await expect(
      loadDeletionLedgerWatermark(await watermarkFile("12\n")),
    ).resolves.toBe(12);
  });

  it.each(["", "-1", "01", "1.5", "9007199254740992"])(
    "rejects invalid watermark %j",
    async (contents) => {
      await expect(
        loadDeletionLedgerWatermark(await watermarkFile(contents)),
      ).rejects.toThrow(/watermark/i);
    },
  );
});

describe("isDeletionLedgerAcknowledged", () => {
  it("requires the mounted watermark to equal the final receipt", async () => {
    const file = await watermarkFile("2\n");
    await expect(
      isDeletionLedgerAcknowledged(file, [{ position: 1 }, { position: 2 }]),
    ).resolves.toBe(true);
    await expect(
      isDeletionLedgerAcknowledged(file, [{ position: 1 }]),
    ).resolves.toBe(false);
  });

  it("fails closed when the watermark cannot be verified", async () => {
    await expect(
      isDeletionLedgerAcknowledged("/missing/gettysburg-watermark", []),
    ).resolves.toBe(false);
  });
});
