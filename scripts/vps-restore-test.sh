#!/usr/bin/env bash
set -Eeuo pipefail

readonly dump_file="${1:-}"
readonly identity_file="${GETTYSBURG_BACKUP_AGE_IDENTITY_FILE:-/srv/gettysburg/.config/gettysburg/backup-age-identity}"
readonly suffix="${RANDOM}-$$"
readonly container_name="gettysburg-restore-test-${suffix}"
readonly volume_name="gettysburg-restore-test-${suffix}"
temporary_directory=""

cleanup() {
	podman rm --force "${container_name}" >/dev/null 2>&1 || true
	podman volume rm --force "${volume_name}" >/dev/null 2>&1 || true
	if [[ -n "${temporary_directory}" ]]; then
		rm -rf -- "${temporary_directory}"
	fi
}
trap cleanup EXIT

if [[ "$(id -un)" != "gettysburg" ]]; then
	printf 'Run this script as the gettysburg service account.\n' >&2
	exit 1
fi
if [[ -z "${dump_file}" || ! -f "${dump_file}" ]]; then
	printf 'Usage: %s /absolute/path/to/gettysburg.dump.age\n' "$0" >&2
	exit 2
fi
if [[ "${dump_file}" != *.age || ! -s "${identity_file}" ]]; then
	printf 'An encrypted .age dump and readable age identity are required.\n' >&2
	exit 2
fi

for command in age node podman sha256sum; do
	command -v "${command}" >/dev/null
done
backup_directory="$(dirname "${dump_file}")"
readonly backup_directory
(
	cd "${backup_directory}"
	sha256sum --check --strict SHA256SUMS >/dev/null
)
readonly ledger_encrypted="${backup_directory}/deletion-ledger.json.age"
readonly ledger_watermark_file="${backup_directory}/deletion-ledger-watermark"
readonly pepper_encrypted="${backup_directory}/credential-pepper.age"
test -s "${ledger_encrypted}"
test -s "${pepper_encrypted}"
test -f "${ledger_watermark_file}"

temporary_directory="$(mktemp -d)"
readonly dump_plaintext="${temporary_directory}/gettysburg.dump"
readonly ledger_plaintext="${temporary_directory}/deletion-ledger.json"
readonly pepper_plaintext="${temporary_directory}/credential-pepper"
age --decrypt --identity "${identity_file}" \
	--output "${dump_plaintext}" "${dump_file}"
age --decrypt --identity "${identity_file}" \
	--output "${ledger_plaintext}" "${ledger_encrypted}"
age --decrypt --identity "${identity_file}" \
	--output "${pepper_plaintext}" "${pepper_encrypted}"
test -s "${dump_plaintext}"
grep -Eq '^[A-Za-z0-9_-]{43}$' "${pepper_plaintext}"
test "$(wc -c <"${pepper_plaintext}")" -eq 44
node -e '
const fs = require("node:fs");
const parsed = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
if (!Array.isArray(parsed.receipts)) process.exit(1);
' "${ledger_plaintext}"

podman volume create "${volume_name}" >/dev/null
podman run --detach \
	--name "${container_name}" \
	--network none \
	--read-only \
	--tmpfs /run/postgresql \
	--tmpfs /tmp \
	--cap-drop ALL \
	--cap-add CHOWN \
	--cap-add DAC_OVERRIDE \
	--cap-add FOWNER \
	--cap-add SETGID \
	--cap-add SETUID \
	--security-opt no-new-privileges \
	--volume "${volume_name}:/var/lib/postgresql/data" \
	--env POSTGRES_DB=gettysburg \
	--env POSTGRES_USER=gettysburg \
	--env POSTGRES_HOST_AUTH_METHOD=trust \
	--env PGDATA=/var/lib/postgresql/data/pgdata \
	docker.io/library/postgres@sha256:d326bec58d3de8d239df60475941522342723934a2598ae59a0281f077681462 >/dev/null

for _ in {1..60}; do
	if podman exec "${container_name}" pg_isready \
		--username=gettysburg --dbname=gettysburg >/dev/null 2>&1; then
		break
	fi
	sleep 1
done
podman exec "${container_name}" pg_isready \
	--username=gettysburg --dbname=gettysburg >/dev/null
podman exec --interactive "${container_name}" pg_restore \
	--username=gettysburg \
	--dbname=gettysburg \
	--no-owner \
	--no-privileges <"${dump_plaintext}"

restored_counts="$(podman exec "${container_name}" psql \
	--username=gettysburg \
	--dbname=gettysburg \
	--tuples-only \
	--no-align \
	--command="SELECT count(*) || ':' || coalesce(max(event_sequence), 0) || ':' || coalesce(max(state_version), 0) FROM games;" | tr -d '[:space:]')"
restored_watermark="$(podman exec "${container_name}" psql \
	--username=gettysburg \
	--dbname=gettysburg \
	--tuples-only \
	--no-align \
	--command='SELECT coalesce(max(position), 0) FROM deletion_ledger;' | tr -d '[:space:]')"
printf '%s:%s\n' "${restored_counts}" "${restored_watermark}"
test "${restored_watermark}" = "$(<"${ledger_watermark_file}")"
