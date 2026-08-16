#!/usr/bin/env bash
set -Eeuo pipefail

readonly service_user="gettysburg"
readonly service_root="/srv/gettysburg"
readonly source_root="${service_root}/src"
readonly quadlet_root="${service_root}/.config/containers/systemd"
readonly systemd_root="${service_root}/.config/systemd/user"
readonly secret_root="${service_root}/.config/gettysburg"
readonly readiness_root="${service_root}/.config/gettysburg-readiness"
readonly caddy_file="/etc/caddy/Caddyfile"
readonly public_origin="https://gettysburg.christitus.com"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
readonly timestamp
readonly rollback_root="${service_root}/backups/deploy-${timestamp}"
readonly maintenance_caddy="${rollback_root}/Caddyfile.maintenance"

candidate_revision=""
candidate_image_id=""
candidate_exposed=false
candidate_migration_started=false
previous_caddy=""
service_uid=""
readonly -a quadlet_files=(
	gettysburg.network
	gettysburg-db.volume
	gettysburg-app.volume
	gettysburg-db.container
	gettysburg-app.container
)
readonly -a systemd_files=(
	gettysburg-purge.service
	gettysburg-purge.timer
)

run_user() (
	cd "${service_root}"
	runuser -u "${service_user}" -- env \
		HOME="${service_root}" \
		XDG_RUNTIME_DIR="/run/user/${service_uid}" \
		DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/${service_uid}/bus" \
		"$@"
)

wait_for_database_health() {
	for _ in {1..60}; do
		if run_user podman healthcheck run gettysburg-db >/dev/null 2>&1; then
			return 0
		fi
		sleep 1
	done
	printf 'Gettysburg PostgreSQL did not become healthy within 60 seconds.\n' >&2
	return 1
}

environment_has_exact_assignment() {
	local file=$1
	local key=$2
	local expected_value=$3
	local line
	local matches=0

	while IFS= read -r line || [[ -n "${line}" ]]; do
		if [[ "${line}" == "${key}="* ]]; then
			matches=$((matches + 1))
			[[ "${line}" == "${key}=${expected_value}" ]] || return 1
		fi
	done <"${file}"
	[[ "${matches}" -eq 1 ]]
}

validate_environment_pair() {
	local app_file=$1
	local postgres_file=$2
	local database_password

	if [[ ! -f "${postgres_file}" || ! -f "${app_file}" ]]; then
		return 1
	fi
	if [[ "$(stat -c '%a' "${postgres_file}")" != 600 ||
	"$(stat -c '%a' "${app_file}")" != 600 ||
	"$(stat -c '%U:%G' "${postgres_file}")" != "${service_user}:${service_user}" ||
	"$(stat -c '%U:%G' "${app_file}")" != "${service_user}:${service_user}" ]]; then
		return 1
	fi
	database_password="$(sed -n 's/^POSTGRES_PASSWORD=//p' "${postgres_file}")"
	if [[ ! "${database_password}" =~ ^[[:xdigit:]]{64}$ ]]; then
		return 1
	fi
	environment_has_exact_assignment "${postgres_file}" POSTGRES_DB gettysburg &&
		environment_has_exact_assignment "${postgres_file}" POSTGRES_USER gettysburg &&
		environment_has_exact_assignment "${postgres_file}" POSTGRES_PASSWORD "${database_password}" &&
		environment_has_exact_assignment "${app_file}" DATABASE_URL \
			"postgresql://gettysburg:${database_password}@gettysburg-db:5432/gettysburg" &&
		environment_has_exact_assignment "${app_file}" GETTYSBURG_CREDENTIAL_PEPPER_FILE \
			/var/lib/gettysburg/credential-pepper &&
		environment_has_exact_assignment "${app_file}" GETTYSBURG_SERVER_HOST 0.0.0.0 &&
		environment_has_exact_assignment "${app_file}" GETTYSBURG_SERVER_PORT 3000 &&
		environment_has_exact_assignment "${app_file}" GETTYSBURG_TRUSTED_ORIGIN "${public_origin}"
}

restore_previous_files() {
	run_user systemctl --user disable --now gettysburg-purge.timer || true
	run_user systemctl --user stop gettysburg-app.service gettysburg-db.service \
		gettysburg-network.service || true
	if run_user podman network exists gettysburg; then
		run_user podman network rm gettysburg >/dev/null
	fi
	for filename in "${quadlet_files[@]}"; do
		if [[ -f "${rollback_root}/quadlet/${filename}" ]]; then
			install -o "${service_user}" -g "${service_user}" -m 0600 \
				"${rollback_root}/quadlet/${filename}" "${quadlet_root}/${filename}"
		else
			rm -f "${quadlet_root}/${filename}"
		fi
	done
	for filename in "${systemd_files[@]}"; do
		if [[ -f "${rollback_root}/systemd/${filename}" ]]; then
			install -o "${service_user}" -g "${service_user}" -m 0600 \
				"${rollback_root}/systemd/${filename}" "${systemd_root}/${filename}"
		else
			rm -f "${systemd_root}/${filename}"
		fi
	done
	run_user systemctl --user daemon-reload || true
	if [[ -f "${rollback_root}/quadlet/gettysburg-db.container" ]]; then
		run_user systemctl --user start gettysburg-db.service || true
	fi
	if [[ -f "${rollback_root}/quadlet/gettysburg-app.container" ]]; then
		run_user systemctl --user start gettysburg-app.service || true
	fi
	if [[ -f "${rollback_root}/systemd/gettysburg-purge.timer" ]]; then
		run_user systemctl --user enable --now gettysburg-purge.timer || true
	fi
	if [[ -n "${previous_caddy}" && -f "${previous_caddy}" ]]; then
		install -o root -g root -m 0644 "${previous_caddy}" "${caddy_file}"
		caddy validate --config "${caddy_file}" --adapter caddyfile >/dev/null
		systemctl reload caddy
	fi
}

fail() {
	local status=$?
	trap - ERR
	if [[ "${candidate_exposed}" == true || "${candidate_migration_started}" == true ]]; then
		printf 'Deployment failed after candidate migration startup; keeping maintenance mode instead of starting older code against the migrated database.\n' >&2
		install -o root -g root -m 0644 "${maintenance_caddy}" "${caddy_file}" || true
		caddy validate --config "${caddy_file}" --adapter caddyfile >/dev/null 2>&1 || true
		systemctl reload caddy || true
		exit "${status}"
	fi
	printf 'Deployment failed; restoring the previous units and Caddy configuration.\n' >&2
	restore_previous_files
	exit "${status}"
}

if [[ "$(id -u)" -ne 0 ]]; then
	printf 'Run this deployment script as root.\n' >&2
	exit 1
fi
if ! command -v age >/dev/null || ! command -v age-keygen >/dev/null; then
	command -v apt-get >/dev/null
	apt-get update
	DEBIAN_FRONTEND=noninteractive apt-get install --yes age
fi
service_uid="$(id -u "${service_user}")"
readonly service_uid
for command in age age-keygen caddy curl git grep install openssl runuser sed sha256sum stat systemctl; do
	command -v "${command}" >/dev/null
done
if [[ ! -d "${source_root}/.git" ]]; then
	printf '%s is not a Git checkout.\n' "${source_root}" >&2
	exit 1
fi
if [[ -n "$(git -C "${source_root}" status --porcelain=v1 --untracked-files=all)" ]]; then
	printf 'The deployment checkout must be clean.\n' >&2
	exit 1
fi

candidate_revision="$(git -C "${source_root}" rev-parse --verify HEAD)"
install -d -o "${service_user}" -g "${service_user}" -m 0700 \
	"${quadlet_root}" "${systemd_root}" "${secret_root}" "${rollback_root}"
install -d -o "${service_user}" -g "${service_user}" -m 0755 \
	"${readiness_root}"
install -d -m 0700 "${rollback_root}/quadlet" "${rollback_root}/systemd"

for filename in "${quadlet_files[@]}"; do
	if [[ -f "${quadlet_root}/${filename}" ]]; then
		cp -a "${quadlet_root}/${filename}" "${rollback_root}/quadlet/${filename}"
	fi
done
for filename in "${systemd_files[@]}"; do
	if [[ -f "${systemd_root}/${filename}" ]]; then
		cp -a "${systemd_root}/${filename}" "${rollback_root}/systemd/${filename}"
	fi
done
if [[ -f "${caddy_file}" ]]; then
	previous_caddy="${rollback_root}/Caddyfile"
	cp -a "${caddy_file}" "${previous_caddy}"
fi
trap fail ERR

postgres_environment_exists=false
app_environment_exists=false
[[ -f "${secret_root}/postgres.env" ]] && postgres_environment_exists=true
[[ -f "${secret_root}/app.env" ]] && app_environment_exists=true
if [[ "${postgres_environment_exists}" != "${app_environment_exists}" ]]; then
	printf 'Deployment requires postgres.env and app.env to exist as a validated pair; refusing a partial secret configuration.\n' >&2
	exit 1
fi
if [[ "${postgres_environment_exists}" == true ]]; then
	if ! validate_environment_pair \
		"${secret_root}/app.env" "${secret_root}/postgres.env"; then
		printf 'The existing deployment environment files are incomplete or inconsistent.\n' >&2
		exit 1
	fi
else
	if run_user podman volume exists gettysburg-db-data; then
		printf 'Persistent database data exists without its original deployment environment files.\n' >&2
		exit 1
	else
		volume_status=$?
		if [[ "${volume_status}" -ne 1 ]]; then
			printf 'Unable to determine whether persistent database data exists; refusing to generate credentials.\n' >&2
			exit 1
		fi
	fi
	database_password="$(openssl rand -hex 32)"
	umask 077
	printf 'POSTGRES_DB=gettysburg\nPOSTGRES_USER=gettysburg\nPOSTGRES_PASSWORD=%s\n' \
		"${database_password}" >"${secret_root}/postgres.env"
	printf 'DATABASE_URL=postgresql://gettysburg:%s@gettysburg-db:5432/gettysburg\nGETTYSBURG_CREDENTIAL_PEPPER_FILE=/var/lib/gettysburg/credential-pepper\nGETTYSBURG_SERVER_HOST=0.0.0.0\nGETTYSBURG_SERVER_PORT=3000\nGETTYSBURG_TRUSTED_ORIGIN=%s\n' \
		"${database_password}" "${public_origin}" >"${secret_root}/app.env"
	chown "${service_user}:${service_user}" \
		"${secret_root}/postgres.env" "${secret_root}/app.env"
	chmod 0600 "${secret_root}/postgres.env" "${secret_root}/app.env"
	unset database_password volume_status
fi
unset postgres_environment_exists app_environment_exists
if [[ ! -f "${secret_root}/backup-age-identity" ]]; then
	umask 077
	age-keygen --output "${secret_root}/backup-age-identity" >/dev/null
	chown "${service_user}:${service_user}" \
		"${secret_root}/backup-age-identity"
	chmod 0600 "${secret_root}/backup-age-identity"
fi
age-keygen -y "${secret_root}/backup-age-identity" \
	>"${secret_root}/backup-age-recipient"
chown "${service_user}:${service_user}" "${secret_root}/backup-age-recipient"
chmod 0600 "${secret_root}/backup-age-recipient"
if grep -q '^GETTYSBURG_OFFHOST_LEDGER_WATERMARK_FILE=' \
	"${secret_root}/app.env"; then
	sed -i \
		's|^GETTYSBURG_OFFHOST_LEDGER_WATERMARK_FILE=.*$|GETTYSBURG_OFFHOST_LEDGER_WATERMARK_FILE=/run/gettysburg-readiness/offhost-ledger-watermark|' \
		"${secret_root}/app.env"
else
	printf 'GETTYSBURG_OFFHOST_LEDGER_WATERMARK_FILE=/run/gettysburg-readiness/offhost-ledger-watermark\n' \
		>>"${secret_root}/app.env"
fi

run_user podman build \
	--label "org.opencontainers.image.revision=${candidate_revision}" \
	--tag "localhost/gettysburg:${candidate_revision}" \
	--file "${source_root}/Containerfile" \
	"${source_root}"
candidate_image_id="$(run_user podman image inspect \
	--format '{{.Id}}' "localhost/gettysburg:${candidate_revision}")"

printf '%s {\n\trespond "Deployment in progress" 503\n}\n' \
	"${public_origin#https://}" >"${maintenance_caddy}"
caddy fmt --overwrite "${maintenance_caddy}"
caddy validate --config "${maintenance_caddy}" --adapter caddyfile >/dev/null
install -o root -g root -m 0644 "${maintenance_caddy}" "${caddy_file}"
systemctl reload caddy
run_user systemctl --user stop gettysburg-app.service

if run_user podman volume exists gettysburg-db-data; then
	if ! run_user podman container exists gettysburg-db; then
		printf 'Persistent database data exists without a backup-capable container.\n' >&2
		exit 1
	fi
	if ! run_user podman inspect --format '{{.State.Running}}' gettysburg-db |
		grep -qx true; then
		run_user podman start gettysburg-db >/dev/null
		wait_for_database_health
	fi
	run_user "${source_root}/scripts/vps-backup.sh" >/dev/null
fi
run_user systemctl --user stop gettysburg-db.service \
	gettysburg-network.service
if run_user podman network exists gettysburg; then
	run_user podman network rm gettysburg >/dev/null
fi

for filename in "${quadlet_files[@]:0:4}"; do
	install -o "${service_user}" -g "${service_user}" -m 0600 \
		"${source_root}/ops/quadlet/${filename}" "${quadlet_root}/${filename}"
done
sed "s|@IMAGE_ID@|${candidate_image_id}|g" \
	"${source_root}/ops/quadlet/gettysburg-app.container.in" \
	>"${quadlet_root}/gettysburg-app.container"
chown "${service_user}:${service_user}" "${quadlet_root}/gettysburg-app.container"
chmod 0600 "${quadlet_root}/gettysburg-app.container"
for filename in "${systemd_files[@]}"; do
	install -o "${service_user}" -g "${service_user}" -m 0600 \
		"${source_root}/ops/systemd/${filename}" "${systemd_root}/${filename}"
done

run_user systemctl --user daemon-reload
run_user systemctl --user start gettysburg-db.service
wait_for_database_health
candidate_migration_started=true
run_user systemctl --user restart gettysburg-app.service

for _ in {1..60}; do
	if curl --fail --silent --show-error --max-time 3 \
		http://127.0.0.1:3000/healthz >/dev/null 2>&1; then
		break
	fi
	sleep 1
done
curl --fail --silent --show-error --max-time 5 \
	http://127.0.0.1:3000/healthz >/dev/null
if [[ ! -f "${readiness_root}/offhost-ledger-watermark" ]]; then
	trap - ERR
	printf 'The database and unready candidate are initialized in maintenance mode, but the off-host ledger acknowledgement is missing. Copy the generated age identity to the maintainer workstation, run scripts/offhost-backup.sh, and rerun deployment.\n' >&2
	exit 3
fi
run_user systemctl --user enable --now gettysburg-purge.timer

for _ in {1..60}; do
	if curl --fail --silent --show-error --max-time 3 \
		http://127.0.0.1:3000/readyz >/dev/null 2>&1; then
		break
	fi
	sleep 1
done
curl --fail --silent --show-error --max-time 5 \
	http://127.0.0.1:3000/readyz >/dev/null

running_image_id="$(run_user podman inspect \
	--format '{{.Image}}' gettysburg-app)"
if [[ "${running_image_id}" != "${candidate_image_id}" ]]; then
	printf 'Running image %s does not match candidate %s.\n' \
		"${running_image_id}" "${candidate_image_id}" >&2
	false
fi
app_uid="$(run_user podman exec gettysburg-app node \
	--input-type=module -e 'process.stdout.write(String(process.getuid()))')"
if [[ ! "${app_uid}" =~ ^[1-9][0-9]*$ ]]; then
	printf 'The application container reported uid %s.\n' \
		"${app_uid:-<empty>}" >&2
	false
fi

candidate_exposed=true
install -o root -g root -m 0644 "${source_root}/ops/Caddyfile.vps" "${caddy_file}"
caddy fmt --overwrite "${caddy_file}"
caddy validate --config "${caddy_file}" --adapter caddyfile >/dev/null
systemctl reload caddy
curl --fail --silent --show-error --max-time 15 \
	"${public_origin}/readyz" >/dev/null
run_user podman run --rm --network host --entrypoint node \
	"${candidate_image_id}" apps/server/public-smoke.mjs "${public_origin}"

run_user podman image inspect \
	--format 'revision={{ index .Labels "org.opencontainers.image.revision" }} image={{.Id}}' \
	"${candidate_image_id}" >"${rollback_root}/candidate-image.txt"
chown "${service_user}:${service_user}" "${rollback_root}/candidate-image.txt"
chmod 0600 "${rollback_root}/candidate-image.txt"

trap - ERR
printf 'Deployed revision %s as %s\n' \
	"${candidate_revision}" "${candidate_image_id}"
