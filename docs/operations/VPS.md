# Gettysburg VPS baseline and deployment plan

## Scope and snapshot

This document records the dedicated development/production target verified over
`ssh gettysburg` on 2026-08-14 America/Chicago (2026-08-15 UTC). It contains no
credentials, public keys, invitation secrets, or maintainer source address.
Values such as versions, capacity, certificate dates, and patch status are a
point-in-time baseline and must be refreshed before a production change.

## Identity and public edge

| Item | Verified value |
| --- | --- |
| SSH alias | `gettysburg` |
| Hostname | `Gettysburg` |
| Public IPv4 | `64.52.108.19` |
| Domain | `gettysburg.christitus.com` |
| Virtualization/architecture | KVM, x86_64 |
| Operating system | Ubuntu 26.04 LTS |
| Kernel | `7.0.0-29-generic` |
| Time | UTC, NTP synchronized |

DNS resolves the domain to the public IPv4. Caddy redirects HTTP to HTTPS and
proxies the Phase 2 rootless staging application over HTTP/2. Public `/healthz`
and PostgreSQL-backed `/readyz` passed after deployment.
The observed Let's Encrypt certificate had CN `gettysburg.christitus.com`, a
start date of 2026-08-15 01:59:43 UTC, and an expiry of 2026-11-13 01:59:42 UTC.
Caddy manages renewal, so the dates must not be treated as a manual renewal plan.

## Verified development rollout: 2026-09-06

PR #4 merged and deployed as `40cff572aab183660dfeee188c4b6acddb2b1de5`
after independent review and passing Application/Documentation CI on both the
PR head and merge commit. Runtime image:
`8dfe5b28877de4548c4c2fe4c724ee10e09fd1002586eb3cde875644a15b5fcd`.
Rollback record: `/srv/gettysburg/backups/deploy-20260906T215510Z`.

The owner authorized retirement of exactly five old development games, not a
database wipe. Encrypted pre-retirement backup `20260906T214315Z` and
post-retirement backup `20260906T214944Z` passed isolated restore and off-host
verification. Audited host recovery and normal deletion retired the five games;
the ledger moved from 15 to 20. The database and encrypted backups were retained.
Do not restore the old application against new terrain games without following
the maintenance/backup rollback contract below.

The deployment script's local/public readiness, non-root image validation, and
two-client HTTPS/WebSocket smoke passed. Both containers report healthy; the app
runs as UID/GID 1000. Live browser acceptance passed with two independent
sessions at desktop 1440x900 and tablet 1024x768, with inspected screenshots under
`test-results/phase-2-rollout-20260906`. After another verified off-host backup
(`20260906T215812Z`), a VPS application restart preserved both credentials and
the exact saved terrain state; both clients synchronized moves before and after
restart. A final database audit found that the browser harness had left its two
games active despite reporting success. Audited operator recovery and normal
host deletion cleaned them up; a follow-up in `TASKS.md` requires the harness to
wait for persisted deletion. The deployment and restart smoke games deleted
themselves normally. Final backup `20260906T220219Z` passed isolated restore and
off-host verification after cleanup, with acknowledged deletion watermark 24.
This closes the Phase 2 operational exception below, not the remaining owner
terrain-gameplay, dependency-security, or public-release gates in `TASKS.md`.

## Historical staging exception: 2026-08-16

The successful deployment evidence above is historical acceptance for revision
`f6a9ec27927d756daf5711188edbe4d564fed373`; it is not a current healthy-service
claim. A follow-up inspection found that revision still running while repository
`main` is `c6f406f56541ab1e9b08db6ef860b7cedaa164fb`. Public `/healthz` returned
200, but `/readyz` returned 503. The database deletion-ledger watermark was 14
while the last verified off-host acknowledgment was 13, so the deployed older
revision correctly failed closed. The container also reported unhealthy because
the generated Quadlet health command terminated with an `Unterminated quoted
string` shell error.

Do not restart or redeploy merely to bypass these gates. First produce and verify
the next encrypted off-host backup so its acknowledgment covers watermark 14,
fix and test the Quadlet health command, restore green Application CI on the
exact current `main`, and deploy that reviewed revision through the contract
below. Re-run local/public health and readiness, container health, exact image
revision, HTTPS/WebSocket, restart/resume, and two-client synchronization before
marking Phase 2 operationally closed.

## Capacity

| Resource | Verified value |
| --- | --- |
| CPU | 4 vCPU |
| Memory | 3.7 GiB total, 3.3 GiB available at audit |
| Swap | Persistent 2 GiB `/swapfile`, unused at audit |
| Swappiness | 10 |
| Root disk | 96 GiB total, 90 GiB available, 7 percent used at audit |

This is enough for development and an initial private deployment, but no public
concurrency claim exists until Phase 4 load testing. PostgreSQL memory limits,
Node.js limits, container logs, and backup retention must fit this single host.

## SSH baseline

Effective server settings:

```text
PermitRootLogin prohibit-password
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
MaxSessions 32
```

Key-only root SSH is an owner-approved break-glass choice for this dedicated VPS,
not the application runtime identity. Root is required for host firewall, SSH,
Caddy, packages, and recovery because the locked `gettysburg` service account
has no administrative group membership. Keep keys scoped to trusted maintainer
workstations, remove/replace a key after suspected compromise, retain an active
recovery session during access changes, and confirm provider-console recovery
before removing the last working root key.

The maintainer IPv4 `/32` is listed in `PerSourcePenaltyExemptList`; its value is
intentionally excluded from the repository. Verify it on the host rather than
copying it into tickets or logs.

Active drop-ins:

- `/etc/ssh/sshd_config.d/00-gettysburg-key-only.conf`
- `/etc/ssh/sshd_config.d/01-gettysburg-ssh-exempt.conf`
- `/etc/ssh/sshd_config.d/60-gettysburg-concurrency.conf`

The removed provider override is retained only as a recovery backup at:

- `/root/ssh-config-backups/00-skysilk.conf.disabled-20260815T025031Z`

The workstation alias uses public-key-only authentication, connection
multiplexing with a dedicated socket, a 30-minute control persist window,
keepalives, timeouts, and `IdentitiesOnly`. A 24-session multiplexed concurrency
test passed. Root key access is intentionally accepted because the VPS is
dedicated, but application processes and deployments run as the unprivileged
service account.

Before changing SSH, keep an existing root session open, run `sshd -t`, reload
rather than restart, open a second session, and verify effective authentication
settings. Never remove the last verified key path in the same operation.

## Network and security services

- UFW is active and enabled with default deny incoming and allow outgoing.
- Only TCP 22 (SSH), 80 (HTTP), and 443 (HTTPS) are allowed, including matching
  IPv6 rules.
- Fail2ban is active and enabled with the SSH jail active; no bans existed at
  the audit.
- Unattended upgrades are active and enabled.
- Zero packages were pending and no reboot was required at the audit.
- The system service manager and the lingering `gettysburg` user manager had
  zero failed units after clearing the completed smoke-test record.

Do not expose application port 3000 or PostgreSQL through UFW. Bind the web
container to loopback and keep the database solely on a private container
network.

## Installed development and operations toolchain

| Tool | Verified version |
| --- | --- |
| Git | 2.53.0 |
| Git LFS | 3.7.1 |
| ripgrep | 15.1.0 |
| GCC/G++ | 15.2.0 |
| Make | 4.4.1 |
| Python | 3.14.4 |
| ShellCheck | 0.11.0 |
| Podman | 5.7.0 |
| Buildah | 1.42.1 |
| Skopeo | 1.21.0-dev |
| Node.js | 24.18.0 LTS |
| npm | 11.16.0 |
| pnpm | 10.34.5 |
| Corepack | 0.35.0 |
| Caddy | 2.11.4 |
| PostgreSQL client/pg_dump | 18.4 |

Phase 1 must pin compatible Node.js and pnpm versions in the repository. A later
host package update does not by itself change the supported project toolchain.

## Service account and storage

The locked-password account `gettysburg` has UID/GID 1000, home
`/srv/gettysburg`, and a Bash shell. Subordinate UID and GID ranges are
`100000:65536`. Lingering is enabled so the user systemd manager starts at boot.

Verified rootless Podman characteristics:

```text
rootless=true
cgroups=v2
cgroupManager=systemd
network=netavark
graph=/srv/gettysburg/.local/share/containers/storage
```

The rootless build/run path and the persistent Phase 2 Quadlets pass. The
application and PostgreSQL containers are managed by the lingering `gettysburg`
user manager; the application process runs as UID/GID 1000:1000.

Persistent layout:

```text
/srv/gettysburg/src
/srv/gettysburg/backups
/srv/gettysburg/.config/containers/systemd
/srv/gettysburg/.local/share/containers/storage
```

Planned secret environment files should live under a dedicated path such as
`/srv/gettysburg/.config/gettysburg/`, owned by `gettysburg`, mode 0700 for the
directory and 0600 for files. Do not put secrets in the checkout, container
image, Quadlet file, command line, or project documentation.

## Caddy and application topology

Caddy 2.11.4 is installed from the official package repository and runs as an
enabled host service. Its configuration is `/etc/caddy/Caddyfile`. The current
site proxies the accepted Phase 2 staging revision to `127.0.0.1:3000`.

The intended production flow is:

```text
Internet :80/:443
  -> host Caddy and automatic TLS
  -> 127.0.0.1:3000
  -> rootless Gettysburg web/server container
  -> private rootless network
  -> PostgreSQL container and persistent volume
```

The application should serve the browser bundle, `/api/`, and `/ws/` from the
same origin. Caddy stays host-managed so certificate access and privileged ports
do not enter the rootless application boundary.

`/healthz` is the public process-liveness endpoint and must reveal no internal
detail. `/readyz` is the distinct deployment-readiness endpoint and verifies
required dependencies such as PostgreSQL and migration state. Readiness may be
restricted at Caddy if its detail becomes useful only to operators.

## Deployment contract

Phase 2 should implement these steps as a reviewed script or runbook, not as
unrecorded shell history:

1. Fetch the exact reviewed revision into `/srv/gettysburg/src`.
2. Build an immutable image, scan that exact ID, and record its digest. The
   deployment script refuses scanner/checksum errors or HIGH/CRITICAL findings
   before entering maintenance or changing service files.
3. Back up PostgreSQL and persistent state before a migration.
4. Put Caddy in maintenance mode and stop the old application so no old-ruleset
   writes can race the candidate or make rollback unsafe.
5. Install/update Quadlet files under the service account.
6. Reload the user manager, start the database, run reviewed migrations, and
   start the application.
7. Verify local liveness/readiness and the exact running image before switching
   Caddy to the candidate. If a post-switch public check fails, restore
   maintenance mode and keep the candidate running rather than starting an
   older ruleset against data the candidate may have written.
8. Verify the Caddy route, WebSocket upgrade, and a
   two-client smoke flow. The deploy script deletes its ordinary smoke game
   after the last deployment-readiness check. The resulting live deletion
   receipt does not drop readiness; it is included in the next off-host backup.
9. Confirm the independent review and successful CI both reference the exact
   candidate revision recorded by the image label. Retain the last compatible
   image and backup until the release is accepted.

The reviewed repository entry points are:

```bash
# Root: refuse a dirty checkout, build the exact HEAD, back up an existing
# database, install rootless Quadlets, validate Caddy, and verify readiness.
# First provision an official verified Trivy binary, then export its absolute
# path and SHA-256 as GETTYSBURG_TRIVY_BIN and GETTYSBURG_TRIVY_SHA256.
scripts/vps-deploy.sh

# Gettysburg service account: create an age-encrypted PostgreSQL dump and
# deletion-ledger export, then verify an isolated restore.
scripts/vps-backup.sh
scripts/vps-restore-test.sh \
  /srv/gettysburg/backups/TIMESTAMP/gettysburg.dump.age

# Gettysburg service account: issue a short-lived, one-use recovery grant.
scripts/vps-recovery.sh issue-seat-recovery GAME_ID SIDE OPERATOR_IDENTITY
scripts/vps-recovery.sh issue-host-recovery GAME_ID OPERATOR_IDENTITY
scripts/vps-recovery.sh purge-deleted

# Maintainer workstation: copy a new encrypted backup locally and acknowledge
# its deletion-ledger watermark only after checksums and decryption pass.
scripts/offhost-backup.sh
```

Each recovery issue command returns a `redemption_path` containing the one-time
bearer fragment. Send the complete public-origin URL to the intended recipient
over a private channel; the browser removes the fragment before claiming it.

The Quadlets are under `ops/quadlet/`; they run both containers rootlessly with
read-only root filesystems, private named volumes, and an internal network. The
application drops all capabilities. PostgreSQL drops the defaults and restores
only `CHOWN`, `DAC_OVERRIDE`, `FOWNER`, `SETGID`, and `SETUID`, which its official
entrypoint needs to initialize the named volume and become the database user.
The PostgreSQL and Node base images are pinned by digest. The application
candidate uses Node 24.18.0 on Alpine 3.24 with OpenSSL packages at least 3.5.8-r0;
build and runtime stages share the same base to avoid native ABI mismatches.
The stable Alpine repository can replace package revisions. Minimum-version
constraints permit later fixes instead of requiring removed APKs. Only the base
and resulting image IDs are immutable; source rebuilds are not bit-for-bit
reproducible. Preserve the reviewed image for rollback and scan every new build.
Runtime npm, Corepack, and Yarn are removed after the build. Alpine 3.24 has
[main support through June 1, 2028](https://alpinelinux.org/releases/).
For each base/package refresh, rerun the full container smoke and browser
acceptance gates against the candidate, then scan its immutable image for OS
and Node vulnerabilities. Record scanner version, verified release checksum,
image ID, scan date, and unresolved findings in `TASKS.md`. Rebuild and rescan
the final merged release image; a previous candidate scan does not attest to
later source or dependency changes. This local candidate is not the deployed
VPS image recorded above.

The deployment scanner must be provisioned from an official release whose
archive checksum/signature has been verified before extraction or execution.
Record that provenance in `TASKS.md`; then compute the extracted binary's
SHA-256 and provide it through `GETTYSBURG_TRIVY_SHA256`, with its absolute path
in `GETTYSBURG_TRIVY_BIN` (default `/usr/local/bin/trivy`). The service account
must be able to execute it. The local verified Trivy 0.74.0 binary has SHA-256
`d89bcc6510a267f11b773398cbf1be5520ce39f9e8b6633178c4487f05b7d791`;
do not assume another platform/release has the same binary checksum.

`scripts/scan-container.sh IMAGE_ID /absolute/report.json` exports that exact
local Podman image to a task-owned Docker archive and scans OS/library packages
with a ten-minute limit, current database updates, and no ignore file/config or
inherited Trivy overrides. It checks the binary checksum before executing it.
The deploy script invokes it before its service-changing rollback trap, retains
the JSON report, scanner version, and checksum beside rollback metadata, and
installs the same image ID into the Quadlet without rebuilding. A failed scan
does not stop the running application. The root deployment sequence and scanner
provisioning still require the approved VPS rollout gate; local helper tests
do not claim an actual remote deployment.

Secrets are created
outside Git under `/srv/gettysburg/.config/gettysburg/` with mode 0600. The
deployment script records the exact Git revision and application image ID beside
the pre-change rollback material. Before building or entering maintenance mode,
the script requires `postgres.env` and `app.env` to exist together with matching
database credentials, required settings, `gettysburg` ownership, and mode 0600.
It creates both only when neither file nor a persistent database volume exists;
a partial pair or missing secrets beside existing database data fails closed.
The user timer in `ops/systemd/` runs the 30-day hard-purge job daily. Each dump
records and verifies the database deletion-ledger watermark. The intentionally
simple Phase 2 encryption design uses age and stores the identity on both the VPS
and maintainer workstation. This is easier to operate than an offline-only key;
it protects backup files and the off-host copy at rest but does not protect them
from a total VPS compromise. The workstation is the selected off-host target.
The root deployment script installs the Ubuntu `age` package when absent,
generates the VPS identity once, derives its recipient file, and validates both
before any mandatory pre-deploy backup. It does not invent an acknowledgement
watermark. On the first run it provisions the key, initializes PostgreSQL and an
unready candidate behind maintenance mode, then stops with instructions. This
gives the workstation backup command a real migrated database to copy; traffic
remains disabled until that verified copy creates the acknowledgement and the
deployment is rerun.

Install `age` on the maintainer workstation, then copy the generated identity
through the existing key-only SSH path:

```bash
install -d -m 0700 ~/.config/gettysburg
scp gettysburg:/srv/gettysburg/.config/gettysburg/backup-age-identity \
  ~/.config/gettysburg/backup-age-identity
chmod 0600 ~/.config/gettysburg/backup-age-identity
scripts/offhost-backup.sh
# Rerun scripts/vps-deploy.sh on the VPS after this succeeds.
```

Install `ops/workstation-systemd/gettysburg-offhost-backup.{service,timer}` in
`~/.config/systemd/user/`, then enable the timer. It uses the existing
`ssh gettysburg` identity and writes mode-0700 backups below
`~/.local/state/gettysburg/offhost-backups/`. The timer is persistent, so a
missed run starts after the workstation next boots. A successful copy verifies
`SHA256SUMS`, decrypts and validates the ledger, completes an isolated rootless
`pg_restore`, and atomically advances the
non-secret `offhost-ledger-watermark` under the dedicated
`~/.config/gettysburg-readiness/` directory on the VPS. The application mounts
that directory read-only and compares it with the database ledger once during
startup. A missing, invalid, or behind startup watermark refuses `/readyz`,
gameplay APIs, room admission, and room commands until the ledger is synchronized
and the application restarts. Receipts created after a successful startup do not
make the live service unready; the next verified off-host backup advances the
watermark for the next startup gate.
The sole exception is an authenticated `deleteGame` retry with the exact command
ID of an already accepted deletion; it can return its stored terminal result but
cannot create a new deletion or mutate the game.
The copy refuses to acknowledge a watermark lower than either the remote
acknowledgement or any retained workstation backup.
The service defaults to the GitHub checkout at `%h/github/gettysburg`; set
`GETTYSBURG_CHECKOUT_ROOT=/absolute/checkout/path` in
`~/.config/gettysburg/offhost-backup.env` only when the checkout lives elsewhere.

Use the real lingering user manager for service actions. From a root SSH shell,
an explicit non-interactive invocation is:

```bash
cd /srv/gettysburg
runuser -u gettysburg -- env \
  HOME=/srv/gettysburg \
  XDG_RUNTIME_DIR=/run/user/1000 \
  DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus \
  systemctl --user status
```

The matching Podman environment avoids falling back from the user systemd cgroup
manager during root-driven diagnostics.

## Backups and recovery artifacts

Existing host-configuration backups:

- `/root/vps-bootstrap-backups/fstab.pre-swap-20260815T025031Z`
- `/root/vps-bootstrap-backups/Caddyfile.package-default-20260815T025031Z`
- `/root/ssh-config-backups/00-skysilk.conf.disabled-20260815T025031Z`

These are local rollback artifacts, not application backups. Historical
plaintext staging dumps predate the age workflow and should remain protected by
the service-account directory until their documented retention expires. A new
backup is accepted only after strict checksum validation, off-host copy, and an
isolated rootless restore.

For recovery, decrypt the newest off-host `deletion-ledger.json.age`, copy the
plaintext temporarily into the application container, and run:

```bash
node apps/server/dist/operator.js sync-deletion-ledger \
  /tmp/deletion-ledger.json
```

Remove the plaintext immediately, atomically set the mounted watermark to the
same final position, and only then admit traffic. Synchronization is prefix-
checked and idempotent: a missing position, conflicting receipt, stale external
ledger, or mismatched readiness watermark fails closed. A soft-delete event is
written and replicated immediately with a null purge time; synchronization marks
any restored pre-deletion game inaccessible. The later hard-purge event removes
the retained game and related records.

## Host-baseline verification commands

This is a host-only audit of the current staging deployment. Run:

```bash
ssh gettysburg
systemctl --failed
systemctl is-active ssh ufw fail2ban caddy
systemctl is-active apt-daily.timer apt-daily-upgrade.timer
systemctl is-enabled apt-daily.timer apt-daily-upgrade.timer
grep -RhsE 'APT::Periodic::(Update-Package-Lists|Unattended-Upgrade)' \
  /etc/apt/apt.conf.d/
sshd -t
sshd -T | grep -E \
  '^(passwordauthentication|kbdinteractiveauthentication|pubkeyauthentication|permitrootlogin|maxsessions|persourcepenaltyexemptlist) '
ufw status numbered
curl -fsS --connect-timeout 5 --max-time 15 \
  https://gettysburg.christitus.com/healthz
curl -fsSI --connect-timeout 5 --max-time 15 \
  http://gettysburg.christitus.com/
curl -fsSI --connect-timeout 5 --max-time 15 \
  https://gettysburg.christitus.com/
```

Then verify the service-account manager and rootless runtime with the explicit
environment from the deployment section. Check pending packages and
`/var/run/reboot-required` before calling the host ready.

## Application release gate

Beginning with the first deployed application, the reviewed deployment script or
runbook must fail closed unless all of these checks pass against the candidate
revision and image digest:

1. Local and public `/healthz` return success.
2. Local and public `/readyz` return success for the configured phase; HTTP error
   responses fail the gate.
3. A real WebSocket client completes the HTTPS upgrade, origin/cookie checks, and
   an authenticated room connection through Caddy.
4. Two independent browser/client sessions create or join opposing seats, observe
   the same accepted command, receive an intentional rejection without state
   divergence, disconnect, and reconnect.
5. The running container is the reviewed digest and its application process is
   non-root.

Phase 1 performs this gate in explicit in-memory mode without claiming restart
durability. Phase 2 and later additionally require PostgreSQL/migration readiness
and a resume-after-restart check. A header-only curl is not sufficient evidence
for readiness, WebSocket, or multiplayer behavior.

## Change boundaries

- DNS, firewall, SSH, Caddy, database migration, secrets, and production service
  changes require a reviewed plan and live post-change validation.
- Preserve an active SSH recovery session during access-control changes.
- Do not run the application or database as root.
- Do not delete host backups until replacements and their restores are verified.
- Stop a deployment when build, migration, health, WebSocket, persistence, or
  rollback validation fails. Report partial state instead of forcing forward.
