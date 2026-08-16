#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "$(id -un)" != "gettysburg" ]]; then
	printf 'Run this script as the gettysburg service account.\n' >&2
	exit 1
fi
if [[ "${1:-}" == "purge-deleted" && $# -eq 1 ]]; then
	podman exec gettysburg-app node apps/server/dist/operator.js "$@"
	exit
fi
if (($# < 3)); then
	printf 'Usage: %s purge-deleted\n' "$0" >&2
	printf 'Usage: %s issue-host-recovery GAME_ID OPERATOR_IDENTITY\n' "$0" >&2
	printf '       %s issue-seat-recovery GAME_ID SIDE OPERATOR_IDENTITY\n' "$0" >&2
	exit 2
fi

podman exec gettysburg-app node apps/server/dist/operator.js "$@"
