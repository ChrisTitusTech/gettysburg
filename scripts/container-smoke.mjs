import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { containerEngine, startPostgres } from "./postgres-test-service.mjs";

const engine = containerEngine();
const suffix = `${process.pid}`;
const image = `localhost/gettysburg-phase2:${suffix}`;
const readyContainer = `gettysburg-ready-${suffix}`;
const unavailableContainer = `gettysburg-unavailable-${suffix}`;
const network = `gettysburg-smoke-${suffix}`;
const appState = `gettysburg-app-state-${suffix}`;
const readinessHealthCommand = "node apps/server/dist/readiness-healthcheck.js";
const createdContainers = [];
let appStateCreated = false;
let imageCreated = false;
let networkCreated = false;
let postgres;
let failure;

const applicationQuadlet = readFileSync(
  "ops/quadlet/gettysburg-app.container.in",
  "utf8",
);
if (
  !applicationQuadlet
    .split(/\r?\n/u)
    .includes(`HealthCmd=${readinessHealthCommand}`)
) {
  throw new Error(
    "Application Quadlet must use the argument-safe readiness health command",
  );
}

function run(args, options = {}) {
  const output = execFileSync(engine, args, {
    encoding: "utf8",
    timeout: 240_000,
    ...options,
  });
  return typeof output === "string" ? output.trim() : "";
}

function startContainer(name, databaseUrl, extraEnvironment = []) {
  const id = run([
    "run",
    "--detach",
    "--name",
    name,
    "--network",
    network,
    "--read-only",
    "--tmpfs",
    "/tmp",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--health-cmd",
    readinessHealthCommand,
    "--health-interval",
    "1s",
    "--health-retries",
    "3",
    "--health-start-period",
    "1s",
    "--health-timeout",
    "2s",
    "--publish",
    "127.0.0.1::3000",
    "--volume",
    `${appState}:/var/lib/gettysburg`,
    "--env",
    `DATABASE_URL=${databaseUrl}`,
    "--env",
    "GETTYSBURG_CREDENTIAL_PEPPER_FILE=/var/lib/gettysburg/credential-pepper",
    ...extraEnvironment.flatMap((value) => ["--env", value]),
    image,
  ]);
  createdContainers.push(name);
  return id;
}

function containerOrigin(name) {
  const mapping = run(["port", name, "3000/tcp"]);
  const port = /:(\d+)\s*$/.exec(mapping)?.[1];
  if (port === undefined)
    throw new Error(
      `Could not determine published port for ${name}: ${mapping}`,
    );
  return `http://127.0.0.1:${port}`;
}

async function waitFor(url, expectedStatus) {
  const deadline = Date.now() + 30_000;
  let lastStatus = "no response";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      lastStatus = `HTTP ${response.status}`;
      if (response.status === expectedStatus) return response;
    } catch (error) {
      lastStatus = String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastStatus}`);
}

async function waitForContainerHealth(name, expectedStatus) {
  const deadline = Date.now() + 75_000;
  let lastStatus = "unavailable";
  while (Date.now() < deadline) {
    const remaining = Math.max(1, deadline - Date.now());
    lastStatus = run(
      [
        "inspect",
        "--format",
        "{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}",
        name,
      ],
      { timeout: remaining },
    );
    if (lastStatus === expectedStatus) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `${name} health remained ${lastStatus}; expected ${expectedStatus}`,
  );
}

function stopCleanly(name) {
  run(["stop", "--time", "10", name]);
  const exitCode = run(["inspect", "--format", "{{.State.ExitCode}}", name]);
  if (exitCode !== "0") throw new Error(`${name} exited with code ${exitCode}`);
}

try {
  run(["build", "--tag", image, "--file", "Containerfile", "."], {
    stdio: "inherit",
  });
  imageCreated = true;
  run(["network", "create", network]);
  networkCreated = true;
  run(["volume", "create", appState]);
  appStateCreated = true;
  postgres = await startPostgres({ engine, network });

  startContainer(readyContainer, postgres.containerConnectionString);
  let readyOrigin = containerOrigin(readyContainer);
  const readiness = await waitFor(`${readyOrigin}/readyz`, 200);
  const readinessBody = await readiness.json();
  if (
    readinessBody.mode !== "postgresql" ||
    readinessBody.durability !== "restart-safe"
  ) {
    throw new Error("Container readiness did not report PostgreSQL durability");
  }
  await waitForContainerHealth(readyContainer, "healthy");
  await waitFor(`${readyOrigin}/`, 200);
  const uid = run([
    "exec",
    readyContainer,
    "node",
    "-e",
    "process.stdout.write(String(process.getuid()))",
  ]);
  const gid = run([
    "exec",
    readyContainer,
    "node",
    "-e",
    "process.stdout.write(String(process.getgid()))",
  ]);
  if (uid === "0" || gid === "0")
    throw new Error(
      `Application container is running as uid:gid ${uid}:${gid}`,
    );

  const createResponse = await fetch(`${readyOrigin}/api/games`, {
    body: JSON.stringify({ seat: "confederate" }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (createResponse.status !== 201)
    throw new Error(`Game creation failed with HTTP ${createResponse.status}`);
  const created = await createResponse.json();
  const cookie = createResponse.headers.get("set-cookie")?.split(";", 1)[0];
  if (cookie === undefined)
    throw new Error("Game creation did not set a cookie");

  stopCleanly(readyContainer);
  run(["rm", readyContainer]);
  startContainer(readyContainer, postgres.containerConnectionString);
  readyOrigin = containerOrigin(readyContainer);
  await waitFor(`${readyOrigin}/readyz`, 200);
  await waitForContainerHealth(readyContainer, "healthy");
  const resumed = await fetch(`${readyOrigin}/api/games/${created.game_id}`, {
    headers: { cookie },
  });
  if (resumed.status !== 200)
    throw new Error(`Restart resume failed with HTTP ${resumed.status}`);
  const resumedBody = await resumed.json();
  if (
    resumedBody.state.version !== 0 ||
    resumedBody.game_id !== created.game_id
  )
    throw new Error("Restart resume returned inconsistent authoritative state");
  stopCleanly(readyContainer);

  startContainer(unavailableContainer, postgres.containerConnectionString, [
    "GETTYSBURG_REQUIRED_DEPENDENCY=unavailable",
  ]);
  const unavailableOrigin = containerOrigin(unavailableContainer);
  await waitFor(`${unavailableOrigin}/healthz`, 200);
  const unavailable = await waitFor(`${unavailableOrigin}/readyz`, 503);
  if ((await unavailable.json()).status !== "unavailable")
    throw new Error("Unavailable dependency did not fail readiness safely");
  await waitForContainerHealth(unavailableContainer, "unhealthy");
  stopCleanly(unavailableContainer);

  console.log(
    `Container smoke passed with ${engine}: non-root ${uid}:${gid}, PostgreSQL restart resume, fail-closed readiness, clean shutdown`,
  );
} catch (error) {
  failure = error;
} finally {
  const cleanupErrors = [];
  for (const name of new Set(createdContainers)) {
    try {
      run(["rm", "--force", name]);
    } catch (error) {
      cleanupErrors.push(
        new Error(`Failed to remove container ${name}`, { cause: error }),
      );
    }
  }
  try {
    postgres?.stop();
  } catch (error) {
    cleanupErrors.push(
      new Error("Failed to stop the PostgreSQL container", { cause: error }),
    );
  }
  const createdResources = [];
  if (appStateCreated)
    createdResources.push(["volume", "rm", "--force", appState]);
  if (networkCreated) createdResources.push(["network", "rm", network]);
  if (imageCreated) createdResources.push(["image", "rm", "--force", image]);
  for (const args of createdResources) {
    try {
      run(args);
    } catch (error) {
      cleanupErrors.push(
        new Error(`Failed to clean up ${args.join(" ")}`, { cause: error }),
      );
    }
  }
  if (cleanupErrors.length > 0) {
    const cleanupFailure = new AggregateError(
      cleanupErrors,
      "Container smoke cleanup failed",
    );
    failure =
      failure === undefined
        ? cleanupFailure
        : new AggregateError(
            [failure, cleanupFailure],
            "Container smoke validation and cleanup failed",
          );
  }
}

if (failure !== undefined) throw failure;
