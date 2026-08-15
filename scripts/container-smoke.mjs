import { execFileSync } from "node:child_process";

const engine =
  process.env.GETTYSBURG_CONTAINER_ENGINE ??
  ["podman", "docker"].find((candidate) => {
    try {
      execFileSync(candidate, ["--version"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  });

if (engine === undefined) {
  throw new Error("Podman or Docker is required for the container smoke test");
}

const suffix = `${process.pid}`;
const image = `localhost/gettysburg-phase1:${suffix}`;
const readyContainer = `gettysburg-ready-${suffix}`;
const unavailableContainer = `gettysburg-unavailable-${suffix}`;
const createdContainers = [];

function run(args, options = {}) {
  const output = execFileSync(engine, args, {
    encoding: "utf8",
    timeout: 240_000,
    ...options,
  });
  return typeof output === "string" ? output.trim() : "";
}

function startContainer(name, extraEnvironment = []) {
  const id = run([
    "run",
    "--detach",
    "--name",
    name,
    "--read-only",
    "--tmpfs",
    "/tmp",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--publish",
    "127.0.0.1::3000",
    ...extraEnvironment.flatMap((value) => ["--env", value]),
    image,
  ]);
  createdContainers.push(name);
  return id;
}

function containerOrigin(name) {
  const mapping = run(["port", name, "3000/tcp"]);
  const port = /:(\d+)\s*$/.exec(mapping)?.[1];
  if (port === undefined) {
    throw new Error(
      `Could not determine published port for ${name}: ${mapping}`,
    );
  }
  return `http://127.0.0.1:${port}`;
}

async function waitFor(url, expectedStatus) {
  const deadline = Date.now() + 25_000;
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

function stopCleanly(name) {
  run(["stop", "--time", "10", name]);
  const exitCode = run(["inspect", "--format", "{{.State.ExitCode}}", name]);
  if (exitCode !== "0") {
    throw new Error(`${name} exited with code ${exitCode}`);
  }
}

try {
  run(["build", "--tag", image, "--file", "Containerfile", "."], {
    stdio: "inherit",
  });

  startContainer(readyContainer);
  const readyOrigin = containerOrigin(readyContainer);
  const readiness = await waitFor(`${readyOrigin}/readyz`, 200);
  const readinessBody = await readiness.json();
  if (
    readinessBody.mode !== "in-memory" ||
    readinessBody.durability !== "process-lifetime"
  ) {
    throw new Error("Container readiness overstated Phase 1 durability");
  }
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
  if (uid === "0" || gid === "0") {
    throw new Error(
      `Application container is running as uid:gid ${uid}:${gid}`,
    );
  }
  stopCleanly(readyContainer);

  startContainer(unavailableContainer, [
    "GETTYSBURG_REQUIRED_DEPENDENCY=unavailable",
  ]);
  const unavailableOrigin = containerOrigin(unavailableContainer);
  await waitFor(`${unavailableOrigin}/healthz`, 200);
  const unavailable = await waitFor(`${unavailableOrigin}/readyz`, 503);
  if ((await unavailable.json()).status !== "unavailable") {
    throw new Error("Unavailable dependency did not fail readiness safely");
  }
  stopCleanly(unavailableContainer);

  console.log(
    `Container smoke passed with ${engine}: non-root ${uid}:${gid}, ready and fail-closed modes, clean shutdown`,
  );
} finally {
  for (const name of createdContainers) {
    try {
      run(["rm", "--force", name], { stdio: "ignore" });
    } catch {
      // Best-effort cleanup keeps the original validation error visible.
    }
  }
  try {
    run(["image", "rm", "--force", image], { stdio: "ignore" });
  } catch {
    // Best-effort cleanup keeps the original validation error visible.
  }
}
