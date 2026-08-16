import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

function decodePepper(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new Error(
      "GETTYSBURG_CREDENTIAL_PEPPER must be canonical 32-byte base64url",
    );
  }
  const bytes = Buffer.from(value, "base64url");
  if (bytes.byteLength !== 32 || bytes.toString("base64url") !== value) {
    throw new Error(
      "GETTYSBURG_CREDENTIAL_PEPPER must decode to exactly 32 bytes",
    );
  }
  return bytes;
}

export async function loadCredentialPepper(options: {
  encoded?: string;
  file?: string;
}): Promise<Uint8Array> {
  if (options.encoded !== undefined) return decodePepper(options.encoded);
  if (options.file === undefined) {
    throw new Error(
      "Set GETTYSBURG_CREDENTIAL_PEPPER or GETTYSBURG_CREDENTIAL_PEPPER_FILE",
    );
  }
  try {
    return decodePepper((await readFile(options.file, "utf8")).trim());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await mkdir(dirname(options.file), { mode: 0o700, recursive: true });
  const encoded = randomBytes(32).toString("base64url");
  try {
    await writeFile(options.file, `${encoded}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    return decodePepper(encoded);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    return decodePepper((await readFile(options.file, "utf8")).trim());
  }
}

export async function loadDeletionLedgerWatermark(
  file: string,
): Promise<number> {
  const value = (await readFile(file, "utf8")).trim();
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error("Deletion-ledger watermark must be a nonnegative integer");
  }
  const watermark = Number(value);
  if (!Number.isSafeInteger(watermark)) {
    throw new Error("Deletion-ledger watermark exceeds the safe integer range");
  }
  return watermark;
}

export async function isDeletionLedgerAcknowledged(
  file: string,
  receipts: readonly { readonly position: number }[],
): Promise<boolean> {
  try {
    return (
      (await loadDeletionLedgerWatermark(file)) ===
      (receipts.at(-1)?.position ?? 0)
    );
  } catch {
    return false;
  }
}
