#!/usr/bin/env bash
set -Eeuo pipefail

readonly backup_root="${GETTYSBURG_BACKUP_ROOT:-/srv/gettysburg/backups}"
readonly container_name="${GETTYSBURG_DB_CONTAINER:-gettysburg-db}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
readonly timestamp
readonly backup_dir="${backup_root}/${timestamp}"
readonly dump_file="${backup_dir}/gettysburg.dump"
readonly ledger_watermark_file="${backup_dir}/deletion-ledger-watermark"

command -v podman >/dev/null
command -v sha256sum >/dev/null

if [[ "$(id -un)" != "gettysburg" ]]; then
	printf 'Run this script as the gettysburg service account.\n' >&2
	exit 1
fi

install -d -m 0700 "${backup_root}" "${backup_dir}"
cleanup_failed_backup() {
	rm -rf -- "${backup_dir}"
}
trap cleanup_failed_backup ERR
podman container exists "${container_name}"
podman exec "${container_name}" pg_dump \
	--username=gettysburg \
	--dbname=gettysburg \
	--format=custom \
	--no-owner \
	--no-privileges >"${dump_file}"

test -s "${dump_file}"
ledger_table="$(podman exec "${container_name}" psql \
	--username=gettysburg \
	--dbname=gettysburg \
	--tuples-only \
	--no-align \
	--command="SELECT coalesce(to_regclass('public.deletion_ledger')::text, '');" |
	tr -d '[:space:]')"
if [[ "${ledger_table}" == "deletion_ledger" ]]; then
	podman exec "${container_name}" psql \
		--username=gettysburg \
		--dbname=gettysburg \
		--tuples-only \
		--no-align \
		--command='SELECT coalesce(max(position), 0) FROM deletion_ledger;' |
		tr -d '[:space:]' >"${ledger_watermark_file}"
else
	printf '0' >"${ledger_watermark_file}"
fi
grep -Eq '^[0-9]+$' "${ledger_watermark_file}"
sha256sum "${dump_file}" "${ledger_watermark_file}" >"${dump_file}.sha256"
chmod 0600 "${dump_file}" "${dump_file}.sha256" "${ledger_watermark_file}"
trap - ERR
printf '%s\n' "${backup_dir}"
