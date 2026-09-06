import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { startPostgres } from "./postgres-test-service.mjs";

const timeoutMs = 25_000;
const serverPort = 32_000 + (process.pid % 1_000);
const webPort = 42_000 + (process.pid % 1_000);
const children = [];
let isStopping = false;
let postgres;
let runtimeDirectory;
let failure;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(" ")} exited with ${signal ?? `code ${String(code)}`}`,
        ),
      );
    });
  });
}

function start(name, args, environment) {
  const child = spawn("pnpm", args, {
    detached: process.platform !== "win32",
    env: { ...process.env, ...environment },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = [];

  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      output.push(chunk);
      if (output.length > 40) {
        output.shift();
      }
    });
  }

  const exited = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  const closed = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  void closed.catch(() => {});
  const runningChild = { child, closed, exited, name, output };
  children.push(runningChild);
  void exited.then(
    ({ code, signal }) => {
      if (!isStopping) {
        failure ??= new Error(
          `${name} exited early with ${signal ?? `code ${String(code)}`}`,
        );
      }
    },
    (error) => {
      if (!isStopping) {
        failure ??= new Error(`${name} failed to start`, { cause: error });
      }
    },
  );
  return runningChild;
}

async function settlesWithin(promise, timeout) {
  let timeoutHandle;
  try {
    return await Promise.race([
      promise.then(() => true),
      new Promise((resolve) => {
        timeoutHandle = setTimeout(() => resolve(false), timeout);
      }),
    ]);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function waitFor(url, expectedStatus, deadline) {
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.status === expectedStatus) {
        return response;
      }
      lastError = new Error(`received HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error(`Timed out waiting for ${url}: ${String(lastError)}`);
}

async function stop(runningChild) {
  const { child, closed } = runningChild;
  if (child.pid === undefined) {
    await closed;
    return;
  }

  if (process.platform === "win32") {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
    }
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
  }

  if (await settlesWithin(closed, 4_000)) return;

  if (process.platform === "win32") {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
    }
  } else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
  }
  if (!(await settlesWithin(closed, 4_000))) {
    throw new Error(`${runningChild.name} did not close after SIGKILL`);
  }
}

try {
  postgres = await startPostgres();
  runtimeDirectory = await mkdtemp(join(tmpdir(), "gettysburg-smoke-"));
  await run("pnpm", ["--filter", "@gettysburg/game", "build"]);
  await run("pnpm", ["--filter", "@gettysburg/content", "build"]);

  start("server", ["--filter", "@gettysburg/server", "start"], {
    DATABASE_URL: postgres.connectionString,
    GETTYSBURG_CREDENTIAL_PEPPER_FILE: join(
      runtimeDirectory,
      "credential-pepper",
    ),
    GETTYSBURG_SERVER_HOST: "127.0.0.1",
    GETTYSBURG_SERVER_PORT: String(serverPort),
    GETTYSBURG_TRUSTED_ORIGIN: `http://127.0.0.1:${webPort}`,
  });
  start("web", ["--filter", "@gettysburg/web", "dev"], {
    GETTYSBURG_SERVER_ORIGIN: `http://127.0.0.1:${serverPort}`,
    GETTYSBURG_WEB_HOST: "127.0.0.1",
    GETTYSBURG_WEB_PORT: String(webPort),
  });
  start("unavailable-server", ["--filter", "@gettysburg/server", "start"], {
    DATABASE_URL: postgres.connectionString,
    GETTYSBURG_CREDENTIAL_PEPPER_FILE: join(
      runtimeDirectory,
      "unavailable-pepper",
    ),
    GETTYSBURG_REQUIRED_DEPENDENCY: "unavailable",
    GETTYSBURG_SERVER_HOST: "127.0.0.1",
    GETTYSBURG_SERVER_PORT: String(serverPort + 1),
    GETTYSBURG_TRUSTED_ORIGIN: `http://127.0.0.1:${webPort}`,
  });

  const deadline = Date.now() + timeoutMs;
  const readyResponse = await waitFor(
    `http://127.0.0.1:${serverPort}/readyz`,
    200,
    deadline,
  );
  const readyBody = await readyResponse.json();

  if (
    readyBody.mode !== "postgresql" ||
    readyBody.durability !== "restart-safe"
  ) {
    throw new Error(
      "Readiness did not report the Phase 2 persistence boundary",
    );
  }

  await waitFor(`http://127.0.0.1:${webPort}/`, 200, deadline);
  await waitFor(`http://127.0.0.1:${webPort}/healthz`, 200, deadline);
  await waitFor(`http://127.0.0.1:${serverPort + 1}/healthz`, 200, deadline);
  await waitFor(`http://127.0.0.1:${serverPort + 1}/readyz`, 503, deadline);
  console.log(
    "Smoke check passed: web/server ready through proxy and missing dependency fails readiness",
  );
} catch (error) {
  failure ??= error;
} finally {
  const cleanupErrors = [];
  isStopping = true;
  const childResults = await Promise.allSettled(
    children.map(async (runningChild) => {
      await stop(runningChild);
    }),
  );
  for (const result of childResults) {
    if (result.status === "rejected") cleanupErrors.push(result.reason);
  }
  try {
    postgres?.stop();
  } catch (error) {
    cleanupErrors.push(
      new Error("Failed to stop the PostgreSQL smoke service", {
        cause: error,
      }),
    );
  }
  if (runtimeDirectory !== undefined) {
    try {
      await rm(runtimeDirectory, { force: true, recursive: true });
    } catch (error) {
      cleanupErrors.push(
        new Error("Failed to remove the smoke runtime directory", {
          cause: error,
        }),
      );
    }
  }
  if (cleanupErrors.length > 0) {
    const cleanupFailure = new AggregateError(
      cleanupErrors,
      "Smoke cleanup failed",
    );
    failure =
      failure === undefined
        ? cleanupFailure
        : new AggregateError(
            [failure, cleanupFailure],
            "Smoke validation and cleanup failed",
          );
  }
}

if (failure !== undefined) {
  for (const runningChild of children) {
    if (runningChild.output.length > 0) {
      console.error(
        `\n${runningChild.name} output:\n${runningChild.output.join("")}`,
      );
    }
  }
  throw failure;
}
