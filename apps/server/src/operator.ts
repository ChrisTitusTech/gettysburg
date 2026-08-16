import { PostgresGameService } from "./postgres-store.js";
import { loadCredentialPepper } from "./runtime-config.js";

const [command, gameId, target, ...identityParts] = process.argv.slice(2);
const operatorIdentity = [target, ...identityParts].join(" ").trim();

if (
  (command === "purge-deleted" && process.argv.slice(2).length !== 1) ||
  (command !== "purge-deleted" &&
    ((command !== "issue-host-recovery" && command !== "issue-seat-recovery") ||
      gameId === undefined ||
      operatorIdentity === ""))
) {
  throw new Error(
    "Usage: operator.js purge-deleted | issue-host-recovery GAME_ID OPERATOR_IDENTITY | issue-seat-recovery GAME_ID SIDE OPERATOR_IDENTITY",
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
