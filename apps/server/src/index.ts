import { fileURLToPath } from "node:url";

import { InMemoryGameService } from "./game-service.js";
import { createGettysburgServer } from "./server.js";

const host = process.env.GETTYSBURG_SERVER_HOST ?? "127.0.0.1";
const port = Number(process.env.GETTYSBURG_SERVER_PORT ?? "2567");
const trustedWebSocketOrigin =
  process.env.GETTYSBURG_TRUSTED_ORIGIN ?? "http://127.0.0.1:5173";
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

const readiness = {
  isReady: () => process.env.GETTYSBURG_REQUIRED_DEPENDENCY !== "unavailable",
};
const gameService = new InMemoryGameService();
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
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});
process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

await gameServer.listen(port, host);
console.log(`Gettysburg server listening at http://${host}:${port}`);
