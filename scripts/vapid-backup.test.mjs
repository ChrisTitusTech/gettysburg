import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createECDH } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const verify = resolve("scripts/verify-vapid-backup.mjs");
const backup = resolve("scripts/vps-backup.sh");
function keyData() {
  const key = createECDH("prime256v1");
  return JSON.stringify({
    subject: "mailto:test@example.com",
    publicKey: key.generateKeys().toString("base64url"),
    privateKey: key.getPrivateKey().toString("base64url"),
  });
}
function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    timeout: 15_000,
    ...options,
  });
}
function fixture(action) {
  const directory = mkdtempSync(join(tmpdir(), "gettysburg-vapid-backup-"));
  try {
    action(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
test("validates matching key backups without printing secrets and rejects unsafe files", () =>
  fixture((directory) => {
    const file = join(directory, "push key.json");
    writeFileSync(file, keyData(), { mode: 0o600 });
    const valid = run(process.execPath, [verify, file]);
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(valid.stdout, "");
    assert.equal(valid.stderr, "");
    chmodSync(file, 0o644);
    assert.equal(run(process.execPath, [verify, file]).status, 1);
    chmodSync(file, 0o600);
    const link = join(directory, "symlink");
    symlinkSync(file, link);
    assert.equal(run(process.execPath, [verify, link]).status, 1);
    const original = JSON.parse(readFileSync(file, "utf8"));
    for (const content of [
      "bad json",
      JSON.stringify({
        ...original,
        privateKey: JSON.parse(keyData()).privateKey,
      }),
      " ".repeat(8_193),
    ]) {
      writeFileSync(file, content);
      const invalid = run(process.execPath, [verify, file]);
      assert.equal(invalid.status, 1);
      assert.equal(invalid.stdout, "");
      assert.equal(
        invalid.stderr,
        "Push key backup is not a valid owner-only matching P-256 configuration.\n",
      );
    }
  }));

function backupFixture(directory) {
  const tools = join(directory, "tools");
  const volume = join(directory, "volume");
  const backups = join(directory, "backups");
  mkdirSync(tools);
  mkdirSync(volume);
  const identity = join(directory, "identity");
  const recipient = join(directory, "recipient");
  assert.equal(run("age-keygen", ["-o", identity]).status, 0);
  const publicRecipient = run("age-keygen", ["-y", identity]);
  assert.equal(publicRecipient.status, 0);
  writeFileSync(recipient, publicRecipient.stdout, { mode: 0o600 });
  writeFileSync(join(volume, "credential-pepper"), `${"a".repeat(43)}\n`, {
    mode: 0o600,
  });
  writeFileSync(
    join(tools, "id"),
    '#!/usr/bin/env bash\nprintf "gettysburg\\n"\n',
    { mode: 0o700 },
  );
  writeFileSync(
    join(tools, "podman"),
    '#!/usr/bin/env bash\nset -eu\ncase "$1:$2" in\ncontainer:exists|volume:exists) exit 0 ;;\nvolume:inspect) printf "%s\\n" "$TEST_APP_VOLUME" ;;\nunshare:*) shift; if [[ "$1" == stat && "$3" == "%a:%u" ]]; then stat -c "%a:1000" "$4"; else exec "$@"; fi ;;\nexec:*) if [[ "$3" == pg_dump ]]; then printf fake-dump; else printf "\\n"; fi ;;\n*) exit 2 ;;\nesac\n',
    { mode: 0o700 },
  );
  const appEnv = join(directory, "app.env");
  writeFileSync(appEnv, "", { mode: 0o600 });
  return {
    volume,
    backups,
    identity,
    appEnv,
    env: {
      ...process.env,
      PATH: `${tools}:${process.env.PATH}`,
      TEST_APP_VOLUME: volume,
      GETTYSBURG_BACKUP_ROOT: backups,
      GETTYSBURG_BACKUP_AGE_RECIPIENT_FILE: recipient,
      GETTYSBURG_APP_ENV_FILE: appEnv,
    },
  };
}
test("the actual backup script encrypts the key and preserves it through decrypt/verify", () =>
  fixture((directory) => {
    const fixture = backupFixture(directory);
    const key = join(fixture.volume, "push-vapid.json");
    writeFileSync(key, keyData(), { mode: 0o600 });
    writeFileSync(
      fixture.appEnv,
      "GETTYSBURG_PUSH_VAPID_FILE=/var/lib/gettysburg/push-vapid.json\n",
    );
    const result = run("bash", [backup], { env: fixture.env });
    assert.equal(result.status, 0, result.stderr);
    const saved = result.stdout.trim();
    assert(saved.startsWith(`${fixture.backups}/`));
    assert.equal(
      readFileSync(join(saved, "push-vapid-present"), "utf8"),
      "1\n",
    );
    assert(
      readFileSync(join(saved, "SHA256SUMS"), "utf8").includes(
        "push-vapid.json.age",
      ),
    );
    assert.equal(existsSync(join(saved, "push-vapid.json")), false);
    const restored = join(directory, "restored.json");
    const decrypt = run("age", [
      "--decrypt",
      "--identity",
      fixture.identity,
      "--output",
      restored,
      join(saved, "push-vapid.json.age"),
    ]);
    assert.equal(decrypt.status, 0, decrypt.stderr);
    chmodSync(restored, 0o600);
    assert(
      readFileSync(restored).equals(readFileSync(key)),
      "Restored key bytes must match",
    );
    assert.equal(run(process.execPath, [verify, restored]).status, 0);
    assert.equal(
      run(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "-e",
          'import {loadPushVapid} from "./src/push-config.ts"; await loadPushVapid(process.argv[1]);',
          restored,
        ],
        { cwd: resolve("apps/server") },
      ).status,
      0,
      "Restored bytes must also pass the application loader",
    );
    assert.equal(
      run("sha256sum", ["--check", "--strict", "SHA256SUMS"], { cwd: saved })
        .status,
      0,
    );
  }));
test("backs up disabled-push installations without a key", () =>
  fixture((directory) => {
    const fixture = backupFixture(directory);
    const result = run("bash", [backup], { env: fixture.env });
    assert.equal(result.status, 0, result.stderr);
    const saved = result.stdout.trim();
    assert.equal(
      readFileSync(join(saved, "push-vapid-present"), "utf8"),
      "0\n",
    );
    assert.equal(existsSync(join(saved, "push-vapid.json.age")), false);
  }));
test("fails and removes the partial backup when the configured key is missing", () =>
  fixture((directory) => {
    const fixture = backupFixture(directory);
    writeFileSync(
      fixture.appEnv,
      "GETTYSBURG_PUSH_VAPID_FILE=/var/lib/gettysburg/push-vapid.json\n",
    );
    const result = run("bash", [backup], { env: fixture.env });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /missing/);
    assert.deepEqual(readdirSync(fixture.backups), [".backup.lock"]);
  }));
test("fails on noncanonical configured key paths, permissions, and symlinks", () =>
  fixture((directory) => {
    const fixture = backupFixture(directory);
    writeFileSync(
      fixture.appEnv,
      "GETTYSBURG_PUSH_VAPID_FILE=/elsewhere/key.json\n",
    );
    assert.equal(run("bash", [backup], { env: fixture.env }).status, 1);
    writeFileSync(fixture.appEnv, "");
    const unsafe = join(fixture.volume, "push-vapid.json");
    writeFileSync(unsafe, keyData(), { mode: 0o644 });
    assert.equal(run("bash", [backup], { env: fixture.env }).status, 1);
    rmSync(unsafe);
    const real = join(directory, "real key");
    writeFileSync(real, keyData(), { mode: 0o600 });
    symlinkSync(real, join(fixture.volume, "push-vapid.json"));
    assert.equal(run("bash", [backup], { env: fixture.env }).status, 1);
    assert.deepEqual(readdirSync(fixture.backups), [".backup.lock"]);
  }));
