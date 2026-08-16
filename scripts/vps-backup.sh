#!/usr/bin/env bash
set -Eeuo pipefail

readonly backup_root="${GETTYSBURG_BACKUP_ROOT:-/srv/gettysburg/backups}"
readonly container_name="${GETTYSBURG_DB_CONTAINER:-gettysburg-db}"
readonly app_volume_name="${GETTYSBURG_APP_VOLUME:-gettysburg-app-state}"
readonly recipient_file="${GETTYSBURG_BACKUP_AGE_RECIPIENT_FILE:-/srv/gettysburg/.config/gettysburg/backup-age-recipient}"
backup_complete=false

for command in age find flock podman sha256sum; do
	command -v "${command}" >/dev/null
done

if [[ "$(id -un)" != "gettysburg" ]]; then
	printf 'Run this script as the gettysburg service account.\n' >&2
	exit 1
fi
if [[ ! -s "${recipient_file}" ]]; then
	printf 'Missing age recipient file: %s\n' "${recipient_file}" >&2
	exit 1
fi

install -d -m 0700 "${backup_root}"
exec 9>"${backup_root}/.backup.lock"
flock --exclusive --timeout 900 9
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
readonly timestamp
readonly backup_dir="${backup_root}/${timestamp}"
readonly dump_encrypted="${backup_dir}/gettysburg.dump.age"
readonly ledger_plaintext="${backup_dir}/deletion-ledger.json"
readonly ledger_encrypted="${ledger_plaintext}.age"
readonly ledger_watermark_file="${backup_dir}/deletion-ledger-watermark"
readonly pepper_encrypted="${backup_dir}/credential-pepper.age"
install -d -m 0700 "${backup_dir}"
cleanup_backup() {
	rm -f -- "${ledger_plaintext}"
	if [[ "${backup_complete}" != true ]]; then
		rm -rf -- "${backup_dir}"
	fi
}
trap cleanup_backup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

podman container exists "${container_name}"
podman volume exists "${app_volume_name}"
app_volume_mountpoint="$(podman volume inspect \
	--format '{{.Mountpoint}}' "${app_volume_name}")"
readonly app_volume_mountpoint
readonly pepper_plaintext="${app_volume_mountpoint}/credential-pepper"
podman unshare test -s "${pepper_plaintext}"
podman unshare grep -Eq '^[A-Za-z0-9_-]{43}$' "${pepper_plaintext}"
podman unshare cat "${pepper_plaintext}" |
	age --encrypt --recipients-file "${recipient_file}" \
		--output "${pepper_encrypted}"

podman exec "${container_name}" pg_dump \
	--username=gettysburg \
	--dbname=gettysburg \
	--format=custom \
	--no-owner \
	--no-privileges |
	age --encrypt --recipients-file "${recipient_file}" \
		--output "${dump_encrypted}"

test -s "${dump_encrypted}"
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
		--command="SELECT json_build_object(
          'receipts', coalesce(json_agg(json_build_object(
            'actor', actor,
            'deletedAt', (extract(epoch FROM deleted_at) * 1000)::bigint,
            'gameId', game_id,
            'position', position,
            'purgedAt', CASE WHEN purged_at IS NULL THEN NULL
              ELSE (extract(epoch FROM purged_at) * 1000)::bigint END
          ) ORDER BY position), '[]'::json)
        ) FROM deletion_ledger;" >"${ledger_plaintext}"
	podman exec "${container_name}" psql \
		--username=gettysburg \
		--dbname=gettysburg \
		--tuples-only \
		--no-align \
		--command='SELECT coalesce(max(position), 0) FROM deletion_ledger;' |
		tr -d '[:space:]' >"${ledger_watermark_file}"
else
	printf '{"receipts":[]}\n' >"${ledger_plaintext}"
	printf '0\n' >"${ledger_watermark_file}"
fi
test -s "${ledger_plaintext}"
grep -Eq '^(0|[1-9][0-9]*)$' "${ledger_watermark_file}"

age --encrypt --recipients-file "${recipient_file}" \
	--output "${ledger_encrypted}" "${ledger_plaintext}"
rm -- "${ledger_plaintext}"
(
	cd "${backup_dir}"
	sha256sum \
		"$(basename "${pepper_encrypted}")" \
		"$(basename "${dump_encrypted}")" \
		"$(basename "${ledger_encrypted}")" \
		"$(basename "${ledger_watermark_file}")" >SHA256SUMS
)
chmod 0600 "${pepper_encrypted}" "${dump_encrypted}" "${ledger_encrypted}" \
	"${ledger_watermark_file}" "${backup_dir}/SHA256SUMS"
find "${backup_root}" -mindepth 1 -maxdepth 1 -type d \
	-name '????????T??????Z' ! -newermt '35 days ago' -exec rm -rf -- {} +
backup_complete=true
printf '%s\n' "${backup_dir}"
