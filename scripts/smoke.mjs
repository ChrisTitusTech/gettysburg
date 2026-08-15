import { spawn } from "node:child_process";

const timeoutMs = 25_000;
const serverPort = 32_000 + (process.pid % 1_000);
const webPort = 42_000 + (process.pid % 1_000);
const children = [];
let isStopping = false;

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

  const runningChild = { child, name, output };
  children.push(runningChild);
  return runningChild;
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
  const { child } = runningChild;
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  if (process.platform === "win32") {
    child.kill("SIGTERM");
  } else {
    process.kill(-child.pid, "SIGTERM");
  }

  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 4_000)),
  ]);

  if (child.exitCode === null && child.signalCode === null) {
    if (process.platform === "win32") {
      child.kill("SIGKILL");
    } else {
      process.kill(-child.pid, "SIGKILL");
    }
  }
}

try {
  await run("pnpm", ["--filter", "@gettysburg/game", "build"]);
  await run("pnpm", ["--filter", "@gettysburg/content", "build"]);

  const server = start("server", ["--filter", "@gettysburg/server", "start"], {
    GETTYSBURG_SERVER_HOST: "127.0.0.1",
    GETTYSBURG_SERVER_PORT: String(serverPort),
  });
  const web = start("web", ["--filter", "@gettysburg/web", "dev"], {
    GETTYSBURG_SERVER_ORIGIN: `http://127.0.0.1:${serverPort}`,
    GETTYSBURG_WEB_HOST: "127.0.0.1",
    GETTYSBURG_WEB_PORT: String(webPort),
  });

  for (const runningChild of [server, web]) {
    runningChild.child.once("exit", (code, signal) => {
      if (!isStopping && code !== null && code !== 0) {
        process.exitCode = 1;
        console.error(
          `${runningChild.name} exited early with ${signal ?? `code ${String(code)}`}`,
        );
      }
    });
  }

  const deadline = Date.now() + timeoutMs;
  const readyResponse = await waitFor(
    `http://127.0.0.1:${serverPort}/readyz`,
    200,
    deadline,
  );
  const readyBody = await readyResponse.json();

  if (
    readyBody.mode !== "in-memory" ||
    readyBody.durability !== "process-lifetime"
  ) {
    throw new Error(
      "Readiness did not report the Phase 1 persistence boundary",
    );
  }

  await waitFor(`http://127.0.0.1:${webPort}/`, 200, deadline);
  await waitFor(`http://127.0.0.1:${webPort}/healthz`, 200, deadline);
  console.log(
    "Smoke check passed: web and server are ready through the dev proxy",
  );
} catch (error) {
  for (const runningChild of children) {
    if (runningChild.output.length > 0) {
      console.error(
        `\n${runningChild.name} output:\n${runningChild.output.join("")}`,
      );
    }
  }
  throw error;
} finally {
  isStopping = true;
  await Promise.all(children.map(stop));
}
