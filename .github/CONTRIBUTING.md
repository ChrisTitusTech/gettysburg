# Contributing

Start with the [README](../README.md), [project instructions](../AGENTS.md), and
current [task status](../TASKS.md). Keep pull requests focused and explain the
problem, resulting behavior, and validation. Discuss substantial changes in an
issue before implementing them.

## Local validation

Use Node.js 24 and the pnpm version pinned in `package.json`. Install Bash,
coreutils/util-linux, and age for the operations tests. Run:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm smoke
```

Follow the README's database, browser, and container checks when changing those
boundaries. Report skipped checks and failures. Do not deploy to the VPS as part
of a contribution.

## Secrets, privacy, and assets

Use synthetic test data and sanitized configuration examples. Never commit
credentials, environment files, private keys, session/invitation/recovery data,
database dumps, or personal log/screenshot content. Keep secrets outside the
checkout and container build context. Report vulnerabilities through the
[security policy](SECURITY.md), not public issues.

Supplied board scans, rules PDFs, and private reference material must remain
local. Follow the asset-provenance requirements in the project instructions;
public visibility does not grant permission to reuse third-party artwork or
change the project's licensing.

Be respectful, discuss code and behavior rather than people, and keep discussion
relevant to the project. The maintainer may close abusive or off-topic threads.
