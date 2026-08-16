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

restore_previous_files() {
	run_user systemctl --user disable --now gettysburg-purge.timer || true
	run_user systemctl --user stop gettysburg-app.service gettysburg-db.service || true
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
	if [[ "${candidate_exposed}" == true ]]; then
		printf 'Deployment failed after the candidate traffic switch; keeping the candidate and restoring maintenance mode instead of starting an older ruleset.\n' >&2
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
for command in age age-keygen caddy curl git install openssl runuser sed sha256sum systemctl; do
	command -v "${command}" >/dev/null
done
if [[ ! -d "${source_root}/.git" ]]; then
	printf '%s is not a Git checkout.\n' "${source_root}" >&2
	exit 1
fi
if ! git -C "${source_root}" diff --quiet ||
	! git -C "${source_root}" diff --cached --quiet; then
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

if [[ ! -f "${secret_root}/postgres.env" ]]; then
	database_password="$(openssl rand -hex 32)"
	umask 077
	printf 'POSTGRES_DB=gettysburg\nPOSTGRES_USER=gettysburg\nPOSTGRES_PASSWORD=%s\n' \
		"${database_password}" >"${secret_root}/postgres.env"
	printf 'DATABASE_URL=postgresql://gettysburg:%s@gettysburg-db:5432/gettysburg\nGETTYSBURG_CREDENTIAL_PEPPER_FILE=/var/lib/gettysburg/credential-pepper\nGETTYSBURG_SERVER_HOST=0.0.0.0\nGETTYSBURG_SERVER_PORT=3000\nGETTYSBURG_TRUSTED_ORIGIN=%s\n' \
		"${database_password}" "${public_origin}" >"${secret_root}/app.env"
	chown "${service_user}:${service_user}" \
		"${secret_root}/postgres.env" "${secret_root}/app.env"
	chmod 0600 "${secret_root}/postgres.env" "${secret_root}/app.env"
	unset database_password
fi
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

if run_user podman container exists gettysburg-db &&
	run_user podman inspect --format '{{.State.Running}}' gettysburg-db | grep -qx true; then
	run_user "${source_root}/scripts/vps-backup.sh" >/dev/null
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
for _ in {1..60}; do
	if run_user podman healthcheck run gettysburg-db >/dev/null 2>&1; then
		break
	fi
	sleep 1
done
run_user podman healthcheck run gettysburg-db >/dev/null
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

run_user podman image inspect \
	--format 'revision={{ index .Labels "org.opencontainers.image.revision" }} image={{.Id}}' \
	"${candidate_image_id}" >"${rollback_root}/candidate-image.txt"
chown -R "${service_user}:${service_user}" "${rollback_root}"
chmod 0600 "${rollback_root}/candidate-image.txt"

trap - ERR
printf 'Deployed revision %s as %s\n' \
	"${candidate_revision}" "${candidate_image_id}"
