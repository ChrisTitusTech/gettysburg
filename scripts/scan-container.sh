#!/usr/bin/env bash
set -Eeuo pipefail

readonly image_id="${1:-}"
readonly report_file="${2:-}"
readonly scanner="${GETTYSBURG_TRIVY_BIN:-/usr/local/bin/trivy}"
readonly scanner_sha256="${GETTYSBURG_TRIVY_SHA256:-}"
if [[ ! "${image_id}" =~ ^(sha256:)?[0-9a-f]{64}$ ||
	"${report_file}" != /* || "${scanner}" != /* ||
	! "${scanner_sha256}" =~ ^[0-9a-f]{64}$ ]]; then
	printf 'An immutable image ID, absolute report/scanner paths, and verified GETTYSBURG_TRIVY_SHA256 are required.\n' >&2
	exit 2
fi
for command in env mktemp podman sha256sum timeout; do
	command -v "${command}" >/dev/null
done
actual_sha256="$(sha256sum -- "${scanner}")"
if [[ "${actual_sha256%% *}" != "${scanner_sha256}" ]]; then
	printf 'The scanner binary does not match the verified checksum.\n' >&2
	exit 1
fi
if [[ -e "${report_file}" || -e "${report_file}.scanner-version" ]]; then
	printf 'Refusing to overwrite existing scan evidence.\n' >&2
	exit 1
fi
umask 077
scan_directory="$(mktemp -d)"
readonly scan_directory
cleanup() {
	rm -rf -- "${scan_directory}"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

timeout 120 podman save --format docker-archive \
	--output "${scan_directory}/candidate.tar" "${image_id}"
timeout 30 env -i HOME="${HOME}" PATH="${PATH}" \
	"${scanner}" --version >"${report_file}.scanner-version"
timeout 600 env -i HOME="${HOME}" PATH="${PATH}" \
	"${scanner}" --config /dev/null image \
	--cache-dir "${GETTYSBURG_TRIVY_CACHE_DIR:-${HOME}/.cache/trivy}" \
	--scanners vuln --pkg-types os,library --severity HIGH,CRITICAL \
	--ignorefile /dev/null --ignore-unfixed=false \
	--exit-code 1 --format json --output "${report_file}" \
	--input "${scan_directory}/candidate.tar"
test -s "${report_file}"
printf 'Exact candidate image passed HIGH/CRITICAL scanning.\n'
