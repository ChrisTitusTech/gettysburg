# Security policy

## Supported versions

Security fixes target the current `main` branch. Gettysburg is under development;
a public repository does not imply that the hosted game is production-ready.

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/ChrisTitusTech/gettysburg/security/advisories/new).
Do not open a public issue or pull request containing an exploit, credential,
private key, session cookie, invitation/recovery link, or database export.

Include the affected revision, impact, and minimal reproduction using synthetic
data. Redact credentials, personal addresses, and identifying logs. Do not test
against the hosted service or other people's games; use a local isolated setup.
The maintainer will coordinate investigation, remediation, and disclosure in the
private advisory. No fixed response time is promised.

If a credential is exposed, revoke or rotate it immediately. Removing a file
from the current tree does not remove historical commits, logs, caches, or images.
