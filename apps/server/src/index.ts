import { fileURLToPath } from "node:url";

import { PostgresGameService } from "./postgres-store.js";
import { loadCredentialPepper } from "./runtime-config.js";
import { createGettysburgServer } from "./server.js";

const host = process.env.GETTYSBURG_SERVER_HOST ?? "127.0.0.1";
const port = Number(process.env.GETTYSBURG_SERVER_PORT ?? "2567");
const trustedWebSocketOrigin =
  process.env.GETTYSBURG_TRUSTED_ORIGIN ?? "http://127.0.0.1:5173";
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://gettysburg@127.0.0.1:5432/gettysburg";
const staticDirectory = fileURLToPath(
  new URL("../../web/dist", import.meta.url),
);

if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new Error("GETTYSBURG_SERVER_PORT must be a valid TCP port");
}

try {
  const trustedOriginUrl = new URL(trustedWebSocketOrigin);
  if (trustedOriginUrl.origin !== trustedWebSocketOrigin) {
    throw new Error("origin contains a path");
  }
} catch {
  throw new Error("GETTYSBURG_TRUSTED_ORIGIN must be an exact URL origin");
}

const pepper = await loadCredentialPepper({
  ...(process.env.GETTYSBURG_CREDENTIAL_PEPPER === undefined
    ? {}
    : { encoded: process.env.GETTYSBURG_CREDENTIAL_PEPPER }),
  ...(process.env.GETTYSBURG_CREDENTIAL_PEPPER_FILE === undefined
    ? {}
    : { file: process.env.GETTYSBURG_CREDENTIAL_PEPPER_FILE }),
});
const gameService = new PostgresGameService({
  connectionString: databaseUrl,
  pepper,
});
await gameService.migrate();
const readiness = {
  isReady: async () =>
    process.env.GETTYSBURG_REQUIRED_DEPENDENCY !== "unavailable" &&
    (await gameService.isReady()),
};
const gameServer = createGettysburgServer({
  gameService,
  readiness,
  staticDirectory,
  trustedWebSocketOrigin,
});

let isShuttingDown = false;

async function shutdown(signal: NodeJS.Signals) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`Received ${signal}; stopping Gettysburg server`);
  await gameServer.gracefullyShutdown(false);
  await gameService.close();
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});
process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

await gameServer.listen(port, host);
console.log(`Gettysburg server listening at http://${host}:${port}`);
