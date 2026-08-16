#!/usr/bin/env bash
set -Eeuo pipefail

readonly dump_file="${1:-}"
readonly suffix="${RANDOM}-$$"
readonly container_name="gettysburg-restore-test-${suffix}"
readonly volume_name="gettysburg-restore-test-${suffix}"
readonly network_name="gettysburg"

cleanup() {
	podman rm --force "${container_name}" >/dev/null 2>&1 || true
	podman volume rm --force "${volume_name}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if [[ "$(id -un)" != "gettysburg" ]]; then
	printf 'Run this script as the gettysburg service account.\n' >&2
	exit 1
fi
if [[ -z "${dump_file}" || ! -f "${dump_file}" ]]; then
	printf 'Usage: %s /absolute/path/to/gettysburg.dump\n' "$0" >&2
	exit 2
fi

sha256sum --check --strict "${dump_file}.sha256"
ledger_watermark_file="$(dirname "${dump_file}")/deletion-ledger-watermark"
readonly ledger_watermark_file
test -f "${ledger_watermark_file}"
podman volume create "${volume_name}" >/dev/null
podman run --detach \
	--name "${container_name}" \
	--network "${network_name}" \
	--read-only \
	--tmpfs /run/postgresql \
	--tmpfs /tmp \
	--cap-drop ALL \
	--security-opt no-new-privileges \
	--volume "${volume_name}:/var/lib/postgresql/data" \
	--env POSTGRES_DB=gettysburg \
	--env POSTGRES_USER=gettysburg \
	--env POSTGRES_HOST_AUTH_METHOD=trust \
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
	--no-privileges <"${dump_file}"

podman exec "${container_name}" psql \
	--username=gettysburg \
	--dbname=gettysburg \
	--tuples-only \
	--no-align \
	--command="SELECT count(*) || ':' || coalesce(max(event_sequence), 0) || ':' || coalesce(max(state_version), 0) || ':' || (SELECT coalesce(max(position), 0) FROM deletion_ledger) FROM games;"
restored_watermark="$(podman exec "${container_name}" psql \
	--username=gettysburg \
	--dbname=gettysburg \
	--tuples-only \
	--no-align \
	--command='SELECT coalesce(max(position), 0) FROM deletion_ledger;' | tr -d '[:space:]')"
test "${restored_watermark}" = "$(<"${ledger_watermark_file}")"
