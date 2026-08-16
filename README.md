# Gettysburg

Gettysburg is a browser-native, two-player adaptation of a turn-based hex-grid
battle game. The project is intended to preserve the tabletop flow while adding
modern multiplayer, saved games, server-authoritative state, and a clean user
interface that can be self-hosted on the dedicated Gettysburg VPS.

The local project workspace contains supplied board, rules, and order-of-battle
references that are deliberately ignored by Git. The repository contains only
the approved implementation plan and rights-safe project work. The current
application candidate implements the Phase 2 rules-light tabletop in
`ROADMAP.md`.

## Project documents

- `PLAN.md` - product direction, decisions, delivery strategy, and gates
- `SPEC.md` - required behavior, architecture, security, and acceptance criteria
- `ROADMAP.md` - ordered implementation phases and exit criteria
- `TASKS.md` - current reviewable work and validation status
- `docs/references/SOURCE_ASSETS.md` - local-only source inventory and missing inputs
- `docs/operations/VPS.md` - verified deployment target and operating model

## Current technical direction

- React, TypeScript, and Vite for the browser client
- SVG for the first board renderer
- Colyseus for authoritative multiplayer rooms
- shared pure TypeScript rules and data packages
- PostgreSQL for durable games and action logs
- Caddy in front of rootless Podman Quadlet services on the VPS

The Phase 2 implementation provides the 82 available source-card counter fronts,
24 turns, reinforcement entry, automatic two-die combat results using verified
unit factors, objective and casualty scoring, PostgreSQL
state/actions/snapshots, restart-safe browser sessions, and a non-root
production-shaped local container path. Reduced combat factors are owner-approved
derived values: halve the full factor and round up, while a combat-one counter
has one step and is eliminated by its first loss. Per-hex terrain modifiers are
explicitly deferred to Phase 3 and remain unavailable as rules data.

## Development

Use Node.js 24 and pnpm 11.21.0. Install dependencies and run the terminating
local gate with:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm smoke
pnpm exec playwright install --with-deps chromium
pnpm browser:acceptance
pnpm container:smoke
```

For interactive development, run `pnpm dev`. The web client listens on
`http://127.0.0.1:5173` and proxies health, readiness, and WebSocket traffic to
the server on `http://127.0.0.1:2567`.

The browser acceptance command creates two isolated sessions at desktop and
tablet widths and writes rights-safe board captures to `test-results/phase-2`.
The private source scans and Battle Manual remain local and ignored.

On the board, drag any friendly counter to move its entire stack. Hold Ctrl
before dragging to move only the grabbed counter, or Ctrl-click once to keep it
in single-counter mode for a later drag. A normal click rejoins its stack. When
a retreat is pending, the highlighted losing stack is dragged together to the
first empty hex. When an advance is pending, drag a highlighted winning stack
to a highlighted vacated defender hex, or into the visible Decline advance
tray. You can also select an eligible winning counter and click or
keyboard-activate the tray to decline. All board movement and combat movement
is coordinate-entry-free.

## Local container path

`pnpm container:smoke` builds the production-shaped image with Podman (or Docker
when Podman is unavailable), proves the application runs with a nonzero UID/GID,
checks PostgreSQL readiness and fail-closed mode, restarts the application, and
proves the saved browser session resumes before clean shutdown.

For an interactive same-origin proxy path, run:

```bash
install -d -m 0700 .secrets
if [[ ! -s .secrets/postgres-password ]]; then
  umask 077
  openssl rand -hex 32 >.secrets/postgres-password
fi
chmod 0444 .secrets/postgres-password
podman compose up --build
```

The local Caddy endpoint is `http://127.0.0.1:8080`. The application container
uses `DATABASE_URL`, a persistent `GETTYSBURG_CREDENTIAL_PEPPER_FILE`,
`GETTYSBURG_SERVER_HOST`, `GETTYSBURG_SERVER_PORT`, the exact public origin in
`GETTYSBURG_TRUSTED_ORIGIN`, and the readiness-test switch
`GETTYSBURG_REQUIRED_DEPENDENCY=unavailable`. PostgreSQL and the credential
pepper use private persistent volumes; no runtime secret is committed.
