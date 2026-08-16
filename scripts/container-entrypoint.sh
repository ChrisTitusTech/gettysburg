#!/bin/sh
set -eu

if [ -n "${GETTYSBURG_DATABASE_PASSWORD_FILE:-}" ]; then
	if [ ! -s "${GETTYSBURG_DATABASE_PASSWORD_FILE}" ]; then
		printf '%s\n' "Database password file is missing or empty." >&2
		exit 1
	fi
	# The JavaScript template is intentionally literal.
	# shellcheck disable=SC2016
	database_url_suffix="$(node -e '
const fs = require("node:fs");
const [passwordFile, user, host, port, database] = process.argv.slice(1);
const fail = (message) => {
  console.error(message);
  process.exit(1);
};
const password = fs.readFileSync(passwordFile, "utf8").replace(/\r?\n$/, "");
if (password.length === 0) fail("Database password is empty.");
if (user.length === 0) fail("Database user is empty.");
if (!/^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(host) || host.includes(".."))
  fail("Database host is invalid.");
if (!/^[0-9]+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
  fail("Database port is invalid.");
if (!/^[A-Za-z0-9_.-]+$/.test(database)) fail("Database name is invalid.");
process.stdout.write(`${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`);
' "${GETTYSBURG_DATABASE_PASSWORD_FILE}" \
		"${GETTYSBURG_DATABASE_USER:-gettysburg}" \
		"${GETTYSBURG_DATABASE_HOST:-db}" \
		"${GETTYSBURG_DATABASE_PORT:-5432}" \
		"${GETTYSBURG_DATABASE_NAME:-gettysburg}")"
	DATABASE_URL="postgresql://${database_url_suffix}"
	export DATABASE_URL
	unset database_url_suffix
fi

exec node apps/server/dist/index.js
