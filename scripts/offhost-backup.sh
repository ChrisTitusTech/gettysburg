#!/usr/bin/env bash
set -Eeuo pipefail

readonly ssh_host="${GETTYSBURG_SSH_HOST:-gettysburg}"
readonly configured_backup_root="${GETTYSBURG_OFFHOST_BACKUP_ROOT:-${XDG_STATE_HOME:-${HOME}/.local/state}/gettysburg/offhost-backups}"
readonly identity_file="${GETTYSBURG_BACKUP_AGE_IDENTITY_FILE:-${HOME}/.config/gettysburg/backup-age-identity}"
multiplex_directory=""
staging_directory=""

cleanup() {
	if [[ -n "${multiplex_directory}" ]]; then
		ssh -o "ControlPath=${multiplex_directory}/control" -O exit \
			"${ssh_host}" >/dev/null 2>&1 || true
		rm -rf -- "${multiplex_directory}"
	fi
	if [[ -n "${staging_directory}" ]]; then
		rm -rf -- "${staging_directory}"
	fi
}
trap cleanup EXIT

for command in age find node realpath scp sha256sum ssh; do
	command -v "${command}" >/dev/null
done
if [[ ! -s "${identity_file}" ]]; then
	printf 'Missing age identity file: %s\n' "${identity_file}" >&2
	exit 1
fi
backup_root="$(realpath --canonicalize-missing -- "${configured_backup_root}")"
readonly backup_root
canonical_home="$(realpath --canonicalize-missing -- "${HOME}")"
readonly canonical_home
case "${backup_root}" in
"" | / | "${canonical_home}")
	printf 'Unsafe off-host backup root: %s\n' "${backup_root}" >&2
	exit 1
	;;
esac

install -d -m 0700 "${backup_root}"
known_watermark=0
while IFS= read -r -d '' retained_watermark_file; do
	retained_watermark="$(<"${retained_watermark_file}")"
	if [[ ! "${retained_watermark}" =~ ^(0|[1-9][0-9]*)$ ||
		${#retained_watermark} -gt 16 ]]; then
		printf 'Invalid retained watermark: %s\n' \
			"${retained_watermark_file}" >&2
		exit 1
	fi
	if ((retained_watermark > known_watermark)); then
		known_watermark="${retained_watermark}"
	fi
done < <(
	find "${backup_root}" -mindepth 2 -maxdepth 2 -type f \
		-path '*/????????T??????Z/deletion-ledger-watermark' -print0
)
readonly known_watermark
multiplex_directory="$(mktemp -d)"
readonly control_path="${multiplex_directory}/control"
ssh -MNf \
	-o ControlMaster=yes \
	-o "ControlPath=${control_path}" \
	-o ControlPersist=60 \
	-o ConnectTimeout=15 \
	-o ServerAliveInterval=30 \
	-o ServerAliveCountMax=6 \
	"${ssh_host}"
remote_acknowledgement="$(ssh -o "ControlPath=${control_path}" "${ssh_host}" \
	'if test -f /srv/gettysburg/.config/gettysburg-readiness/offhost-ledger-watermark; then cat /srv/gettysburg/.config/gettysburg-readiness/offhost-ledger-watermark; else printf missing; fi')"
readonly remote_acknowledgement
if [[ "${remote_acknowledgement}" != missing &&
	(! "${remote_acknowledgement}" =~ ^(0|[1-9][0-9]*)$ ||
	${#remote_acknowledgement} -gt 16) ]]; then
	printf 'Invalid remote acknowledgement watermark.\n' >&2
	exit 1
fi

remote_backup_directory="$(ssh -o "ControlPath=${control_path}" "${ssh_host}" \
	'service_uid="$(id -u gettysburg)"; runuser -u gettysburg -- env HOME=/srv/gettysburg XDG_RUNTIME_DIR="/run/user/${service_uid}" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/${service_uid}/bus" /srv/gettysburg/src/scripts/vps-backup.sh')"
if [[ ! "${remote_backup_directory}" =~ ^/srv/gettysburg/backups/[0-9]{8}T[0-9]{6}Z$ ]]; then
	printf 'Unexpected remote backup path: %s\n' "${remote_backup_directory}" >&2
	exit 1
fi
restore_result="$(ssh -o "ControlPath=${control_path}" "${ssh_host}" \
	"service_uid=\"\$(id -u gettysburg)\"; runuser -u gettysburg -- env HOME=/srv/gettysburg XDG_RUNTIME_DIR=\"/run/user/\${service_uid}\" DBUS_SESSION_BUS_ADDRESS=\"unix:path=/run/user/\${service_uid}/bus\" /srv/gettysburg/src/scripts/vps-restore-test.sh '${remote_backup_directory}/gettysburg.dump.age'")"
readonly restore_result
if [[ ! "${restore_result}" =~ ^[0-9]+:[0-9]+:[0-9]+:[0-9]+$ ]]; then
	printf 'Unexpected restore-test result: %s\n' "${restore_result}" >&2
	exit 1
fi
readonly backup_name="${remote_backup_directory##*/}"
readonly final_directory="${backup_root}/${backup_name}"
if [[ -e "${final_directory}" ]]; then
	printf 'Off-host backup already exists: %s\n' "${final_directory}" >&2
	exit 1
fi

staging_directory="$(mktemp -d "${backup_root}/.staging.XXXXXX")"
scp -q -r -o "ControlPath=${control_path}" \
	"${ssh_host}:${remote_backup_directory}/." "${staging_directory}/"
(
	cd "${staging_directory}"
	sha256sum --check --strict SHA256SUMS
)
readonly ledger_plaintext="${staging_directory}/deletion-ledger.json"
age --decrypt --identity "${identity_file}" \
	--output "${ledger_plaintext}" \
	"${staging_directory}/deletion-ledger.json.age"
watermark="$(node -e '
const fs = require("node:fs");
const parsed = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
if (!Array.isArray(parsed.receipts)) process.exit(2);
const states = new Map();
for (const [index, receipt] of parsed.receipts.entries()) {
  if (
    typeof receipt !== "object" || receipt === null ||
    receipt.position !== index + 1 ||
    typeof receipt.gameId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(receipt.gameId) ||
    typeof receipt.actor !== "string" || receipt.actor.trim() === "" ||
    !Number.isSafeInteger(receipt.deletedAt) || receipt.deletedAt < 0 ||
    (receipt.purgedAt !== null &&
      (!Number.isSafeInteger(receipt.purgedAt) || receipt.purgedAt < receipt.deletedAt))
  ) process.exit(2);
  const prior = states.get(receipt.gameId);
  if (
    (receipt.purgedAt === null && prior !== undefined) ||
    (receipt.purgedAt !== null && prior !== "deleted")
  ) process.exit(2);
  states.set(receipt.gameId, receipt.purgedAt === null ? "deleted" : "purged");
}
const watermark = parsed.receipts.at(-1)?.position ?? 0;
if (!Number.isSafeInteger(watermark) || watermark < 0) process.exit(2);
process.stdout.write(String(watermark));
' "${ledger_plaintext}")"
readonly watermark
test "${watermark}" = "$(<"${staging_directory}/deletion-ledger-watermark")"
if ((watermark < known_watermark)); then
	printf 'Refusing watermark regression from retained %s to %s.\n' \
		"${known_watermark}" "${watermark}" >&2
	exit 1
fi
if [[ "${remote_acknowledgement}" != missing ]] &&
	((watermark < remote_acknowledgement)); then
	printf 'Refusing remote watermark regression from %s to %s.\n' \
		"${remote_acknowledgement}" "${watermark}" >&2
	exit 1
fi
rm -- "${ledger_plaintext}"
mv -- "${staging_directory}" "${final_directory}"
staging_directory=""

ssh -o "ControlPath=${control_path}" "${ssh_host}" \
	"set -e; command -v flock >/dev/null; readiness_directory=/srv/gettysburg/.config/gettysburg-readiness; exec 9>\"\${readiness_directory}/offhost-ledger-watermark.lock\"; flock --exclusive 9; current=0; if test -f \"\${readiness_directory}/offhost-ledger-watermark\"; then current=\$(cat \"\${readiness_directory}/offhost-ledger-watermark\"); fi; case \"\${current}\" in ''|*[!0-9]*) exit 1 ;; esac; if test \"\${current}\" -gt '${watermark}'; then printf 'Refusing concurrent watermark regression from %s to %s.\\n' \"\${current}\" '${watermark}' >&2; exit 1; fi; printf '%s\\n' '${watermark}' > \"\${readiness_directory}/offhost-ledger-watermark.new\" && chown gettysburg:gettysburg \"\${readiness_directory}/offhost-ledger-watermark.new\" && chmod 0644 \"\${readiness_directory}/offhost-ledger-watermark.new\" && mv \"\${readiness_directory}/offhost-ledger-watermark.new\" \"\${readiness_directory}/offhost-ledger-watermark\""
find "${backup_root}" -mindepth 1 -maxdepth 1 -type d \
	-name '????????T??????Z' ! -newermt '35 days ago' -exec rm -rf -- {} +
printf '%s\n' "${final_directory}"
