import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";

import { configureHttpApplication } from "./http.js";

const host = process.env.GETTYSBURG_SERVER_HOST ?? "127.0.0.1";
const port = Number(process.env.GETTYSBURG_SERVER_PORT ?? "2567");

if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new Error("GETTYSBURG_SERVER_PORT must be a valid TCP port");
}

const readiness = {
  isReady: () => process.env.GETTYSBURG_REQUIRED_DEPENDENCY !== "unavailable",
};

const gameServer = new Server({
  express: (application) => {
    configureHttpApplication(application, readiness);
  },
  gracefullyShutdown: false,
  greet: false,
  transport: new WebSocketTransport(),
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
