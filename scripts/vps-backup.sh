#!/usr/bin/env bash
set -Eeuo pipefail

readonly backup_root="${GETTYSBURG_BACKUP_ROOT:-/srv/gettysburg/backups}"
readonly container_name="${GETTYSBURG_DB_CONTAINER:-gettysburg-db}"
readonly app_volume_name="${GETTYSBURG_APP_VOLUME:-gettysburg-app-state}"
readonly recipient_file="${GETTYSBURG_BACKUP_AGE_RECIPIENT_FILE:-/srv/gettysburg/.config/gettysburg/backup-age-recipient}"
readonly app_environment_file="${GETTYSBURG_APP_ENV_FILE:-/srv/gettysburg/.config/gettysburg/app.env}"
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
readonly vapid_encrypted="${backup_dir}/push-vapid.json.age"
readonly vapid_presence="${backup_dir}/push-vapid-present"
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
readonly vapid_plaintext="${app_volume_mountpoint}/push-vapid.json"
vapid_config=""
if [[ -f "${app_environment_file}" ]]; then
	vapid_config="$(sed -n 's/^GETTYSBURG_PUSH_VAPID_FILE=//p' "${app_environment_file}")"
fi
if [[ -n "${vapid_config}" && "${vapid_config}" != /var/lib/gettysburg/push-vapid.json ]]; then
	printf 'Push backups require the canonical persistent-volume key path.\n' >&2
	exit 1
fi
printf '0\n' >"${vapid_presence}"
if podman unshare test -e "${vapid_plaintext}" || podman unshare test -L "${vapid_plaintext}"; then
	podman unshare test -f "${vapid_plaintext}"
	if podman unshare test -L "${vapid_plaintext}"; then
		printf 'Push key must not be a symlink.\n' >&2
		exit 1
	fi
	test "$(podman unshare stat -c '%a:%u' "${vapid_plaintext}")" = 600:1000
	vapid_size="$(podman unshare stat -c '%s' "${vapid_plaintext}")"
	((vapid_size > 0 && vapid_size <= 8192))
	podman unshare cat "${vapid_plaintext}" |
		age --encrypt --recipients-file "${recipient_file}" --output "${vapid_encrypted}"
	printf '1\n' >"${vapid_presence}"
elif [[ -n "${vapid_config}" ]]; then
	printf 'Configured push key is missing; refusing an incomplete backup.\n' >&2
	exit 1
fi
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
	sha256sum push-vapid-present >>SHA256SUMS
	if [[ -f push-vapid.json.age ]]; then
		sha256sum push-vapid.json.age >>SHA256SUMS
	fi
)
chmod 0600 "${pepper_encrypted}" "${dump_encrypted}" "${ledger_encrypted}" \
	"${ledger_watermark_file}" "${backup_dir}/SHA256SUMS"
chmod 0600 "${vapid_presence}"
if [[ -f "${vapid_encrypted}" ]]; then chmod 0600 "${vapid_encrypted}"; fi
find "${backup_root}" -mindepth 1 -maxdepth 1 -type d \
	-name '????????T??????Z' ! -newermt '35 days ago' -exec rm -rf -- {} +
backup_complete=true
printf '%s\n' "${backup_dir}"
