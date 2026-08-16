import { readFile } from "node:fs/promises";

import type { DeletionReceipt } from "./game-service.js";
import { PostgresGameService } from "./postgres-store.js";
import { loadCredentialPepper } from "./runtime-config.js";

const arguments_ = process.argv.slice(2);
const [command, gameId, target, ...identityParts] = arguments_;
const operatorIdentity = [target, ...identityParts].join(" ").trim();

const valid =
  ((command === "purge-deleted" || command === "export-deletion-ledger") &&
    arguments_.length === 1) ||
  (command === "sync-deletion-ledger" && arguments_.length === 2) ||
  (command === "issue-host-recovery" &&
    gameId !== undefined &&
    operatorIdentity !== "") ||
  (command === "issue-seat-recovery" &&
    gameId !== undefined &&
    target !== undefined &&
    identityParts.join(" ").trim() !== "");
if (!valid) {
  throw new Error(
    "Usage: operator.js purge-deleted | export-deletion-ledger | sync-deletion-ledger JSON_PATH | issue-host-recovery GAME_ID OPERATOR_IDENTITY | issue-seat-recovery GAME_ID SIDE OPERATOR_IDENTITY",
  );
}

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined) throw new Error("DATABASE_URL is required");
const pepper = await loadCredentialPepper({
  ...(process.env.GETTYSBURG_CREDENTIAL_PEPPER === undefined
    ? {}
    : { encoded: process.env.GETTYSBURG_CREDENTIAL_PEPPER }),
  ...(process.env.GETTYSBURG_CREDENTIAL_PEPPER_FILE === undefined
    ? {}
    : { file: process.env.GETTYSBURG_CREDENTIAL_PEPPER_FILE }),
});
const service = new PostgresGameService({
  connectionString: databaseUrl,
  pepper,
});

try {
  if (!(await service.isReady())) throw new Error("Service is not ready");
  if (command === "purge-deleted") {
    const receipts = await service.purgeDeletedGames();
    process.stdout.write(`${JSON.stringify({ purged: receipts })}\n`);
  } else if (command === "export-deletion-ledger") {
    process.stdout.write(
      `${JSON.stringify({ receipts: await service.getDeletionLedger() })}\n`,
    );
  } else if (command === "sync-deletion-ledger") {
    if (gameId === undefined) throw new Error("Ledger path is required");
    const parsed = JSON.parse(await readFile(gameId, "utf8")) as {
      receipts?: unknown;
    };
    if (!Array.isArray(parsed.receipts)) {
      throw new Error("Deletion ledger must contain a receipts array");
    }
    const applied = await service.synchronizeDeletionLedger(
      parsed.receipts as DeletionReceipt[],
    );
    process.stdout.write(`${JSON.stringify({ applied })}\n`);
  } else if (command === "issue-host-recovery") {
    if (gameId === undefined) throw new Error("Game ID is required");
    const grant = await service.issueHostRecovery(
      gameId,
      [target, ...identityParts].join(" "),
    );
    process.stdout.write(`${JSON.stringify({ ...grant, target: "host" })}\n`);
  } else {
    if (gameId === undefined) throw new Error("Game ID is required");
    if (target !== "confederate" && target !== "union") {
      throw new Error("Seat recovery SIDE must be confederate or union");
    }
    const seatIdentity = identityParts.join(" ").trim();
    if (seatIdentity === "") throw new Error("Operator identity is required");
    const grant = await service.issueSeatRecovery(gameId, target, seatIdentity);
    process.stdout.write(`${JSON.stringify({ ...grant, target })}\n`);
  }
} finally {
  await service.close();
}
