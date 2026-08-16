import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { startPostgres } from "./postgres-test-service.mjs";

const postgres = await startPostgres({ database: "gettysburg_dev" });
const runtimeDirectory = await mkdtemp(join(tmpdir(), "gettysburg-dev-"));
const environment = {
  ...process.env,
  DATABASE_URL: postgres.connectionString,
  GETTYSBURG_CREDENTIAL_PEPPER_FILE: join(
    runtimeDirectory,
    "credential-pepper",
  ),
};
const child = spawn(
  "pnpm",
  [
    "exec",
    "concurrently",
    "--kill-others",
    "--names",
    "server,web",
    "--prefix-colors",
    "blue,green",
    "pnpm --filter @gettysburg/server dev",
    "pnpm --filter @gettysburg/web dev",
  ],
  { env: environment, stdio: "inherit" },
);

let stopping = false;
let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  postgres.stop();
  rmSync(runtimeDirectory, { force: true, recursive: true });
}

process.once("exit", cleanup);
function requestStop(signal) {
  if (stopping) return;
  stopping = true;
  child.kill(signal);
}

process.once("SIGINT", () => requestStop("SIGINT"));
process.once("SIGTERM", () => requestStop("SIGTERM"));

const code = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (exitCode) => resolve(exitCode ?? 1));
});
cleanup();
process.exitCode = stopping ? 0 : code;
