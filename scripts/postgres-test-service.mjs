import { execFileSync } from "node:child_process";

function run(engine, args, options = {}) {
  const output = execFileSync(engine, args, {
    encoding: "utf8",
    timeout: 240_000,
    ...options,
  });
  return typeof output === "string" ? output.trim() : "";
}

export function containerEngine() {
  const configured = process.env.GETTYSBURG_CONTAINER_ENGINE;
  if (configured !== undefined) return configured;
  for (const candidate of ["podman", "docker"]) {
    try {
      run(candidate, ["--version"], { stdio: "ignore" });
      return candidate;
    } catch {
      // Try the next supported engine.
    }
  }
  throw new Error("Podman or Docker is required for PostgreSQL validation");
}

export async function startPostgres(options = {}) {
  const engine = options.engine ?? containerEngine();
  const suffix = `${process.pid}-${Date.now()}`;
  const name = `gettysburg-postgres-${suffix}`;
  const database = options.database ?? "gettysburg_test";
  const user = "gettysburg";
  const args = [
    "run",
    "--detach",
    "--name",
    name,
    "--env",
    `POSTGRES_DB=${database}`,
    "--env",
    `POSTGRES_USER=${user}`,
    "--env",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "--publish",
    "127.0.0.1::5432",
  ];
  if (options.network !== undefined) args.push("--network", options.network);
  args.push("docker.io/library/postgres:18.1-alpine");
  run(engine, args);

  const remove = () => {
    run(engine, ["rm", "--force", name]);
  };
  const removeBestEffort = () => {
    try {
      remove();
    } catch {
      // Preserve the original validation error.
    }
  };

  const deadline = Date.now() + 30_000;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      run(engine, [
        "exec",
        name,
        "pg_isready",
        "-h",
        "127.0.0.1",
        "-U",
        user,
        "-d",
        database,
      ]);
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  if (!ready) {
    removeBestEffort();
    throw new Error("PostgreSQL test service did not become ready");
  }

  let mapping;
  try {
    mapping = run(engine, ["port", name, "5432/tcp"]);
  } catch (error) {
    removeBestEffort();
    throw error;
  }
  const port = /:(\d+)\s*$/.exec(mapping)?.[1];
  if (port === undefined) {
    removeBestEffort();
    throw new Error(`Could not parse PostgreSQL port: ${mapping}`);
  }
  return {
    connectionString: `postgresql://${user}@127.0.0.1:${port}/${database}`,
    containerConnectionString: `postgresql://${user}@${name}:5432/${database}`,
    engine,
    name,
    stop: remove,
  };
}
