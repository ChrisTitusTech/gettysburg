import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const script = resolve("scripts/scan-container.sh");
const image = "a".repeat(64);
function fixture(run) {
  const directory = mkdtempSync(join(tmpdir(), "gettysburg-scan-test-"));
  const podman = join(directory, "podman");
  const scanner = join(directory, "scanner with spaces");
  const report = join(directory, "report with spaces.json");
  writeFileSync(
    podman,
    '#!/usr/bin/env bash\nset -eu\n[[ "$1" == save && "$2" == --format && "$3" == docker-archive && "$4" == --output ]]\nprintf archive > "$5"\nprintf "%s" "$6" > "${5}.image-id"\n',
  );
  writeFileSync(
    scanner,
    '#!/usr/bin/env bash\nset -eu\nif [[ "$1" == --version ]]; then printf "Trivy test fixture\\n"; exit; fi\n[[ -z "${TRIVY_SKIP_DB_UPDATE:-}" && "$1" == --config && "$2" == /dev/null && "$3" == image ]]\nreport=""; archive=""\nwhile (( $# )); do case "$1" in --output) report=$2; shift ;; --input) archive=$2; shift ;; esac; shift; done\n[[ -s "$archive" ]]\nprintf "{\\"image\\":\\"%s\\"}" "$(<"${archive}.image-id")" > "$report"\n',
  );
  chmodSync(podman, 0o700);
  chmodSync(scanner, 0o700);
  const env = {
    ...process.env,
    PATH: `${directory}:${process.env.PATH}`,
    TMPDIR: directory,
    GETTYSBURG_TRIVY_BIN: scanner,
    GETTYSBURG_TRIVY_SHA256: createHash("sha256")
      .update(readFileSync(scanner))
      .digest("hex"),
    TRIVY_SKIP_DB_UPDATE: "true",
  };
  try {
    run({ directory, scanner, report, env });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("exports exact image, isolates scanner overrides, preserves evidence, and cleans archive", () =>
  fixture(({ directory, report, env }) => {
    const result = spawnSync("bash", [script, image, report], {
      env,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.stdout,
      "Exact candidate image passed HIGH/CRITICAL scanning.\n",
    );
    assert.deepEqual(JSON.parse(readFileSync(report, "utf8")), { image });
    assert.match(
      readFileSync(`${report}.scanner-version`, "utf8"),
      /Trivy test/,
    );
    assert(!readdirSync(directory).some((name) => name.startsWith("tmp.")));
  }));
test("refuses mutable tags and missing or wrong binary checksums before execution", () =>
  fixture(({ directory, report, env }) => {
    for (const [id, checksum] of [
      ["latest", env.GETTYSBURG_TRIVY_SHA256],
      [image, ""],
      [image, "0".repeat(64)],
    ]) {
      const result = spawnSync("bash", [script, id, report], {
        env: { ...env, GETTYSBURG_TRIVY_SHA256: checksum },
        encoding: "utf8",
      });
      assert.notEqual(result.status, 0);
      assert.equal(existsSync(report), false);
      assert.equal(existsSync(`${report}.scanner-version`), false);
    }
    assert(!readdirSync(directory).some((name) => name.startsWith("tmp.")));
  }));
test("propagates scanner failures and will not overwrite evidence", () =>
  fixture(({ directory, scanner, report, env }) => {
    writeFileSync(
      scanner,
      '#!/usr/bin/env bash\nif [[ "$1" == --version ]]; then printf fixture; exit; fi\nprintf "scan failed\\n" >&2\nexit 17\n',
    );
    env.GETTYSBURG_TRIVY_SHA256 = createHash("sha256")
      .update(readFileSync(scanner))
      .digest("hex");
    const failed = spawnSync("bash", [script, image, report], {
      env,
      encoding: "utf8",
    });
    assert.equal(failed.status, 17);
    assert.equal(failed.stderr, "scan failed\n");
    assert.equal(failed.stdout, "");
    assert(!readdirSync(directory).some((name) => name.startsWith("tmp.")));
    const repeated = spawnSync("bash", [script, image, report], {
      env,
      encoding: "utf8",
    });
    assert.equal(repeated.status, 1);
    assert.match(repeated.stderr, /overwrite/);
  }));
test("deployment scans before service-changing setup and reuses the scanned ID", () => {
  const source = readFileSync("scripts/vps-deploy.sh", "utf8");
  const scan = source.indexOf(
    'run_user bash "${source_root}/scripts/scan-container.sh"',
  );
  assert(scan > source.indexOf("run_user podman build"));
  assert(scan < source.indexOf('install -d -o "${service_user}"'));
  assert(scan < source.indexOf("trap fail ERR"));
  assert.equal(source.match(/run_user podman build/g)?.length, 1);
  assert(source.includes('sed "s|@IMAGE_ID@|${candidate_image_id}|g"'));
});
