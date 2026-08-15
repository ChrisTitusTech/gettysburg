# Gettysburg

Gettysburg is a browser-native, two-player adaptation of a turn-based hex-grid
battle game. The project is intended to preserve the tabletop flow while adding
modern multiplayer, saved games, server-authoritative state, and a clean user
interface that can be self-hosted on the dedicated Gettysburg VPS.

The local project workspace contains supplied board, rules, and order-of-battle
references that are deliberately ignored by Git. The repository contains only
the approved implementation plan and rights-safe project work. Application
development begins with the Phase 1 vertical slice in `ROADMAP.md`.

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

The Phase 1 implementation provides the typed pnpm workspace, responsive SVG
fixture board, authoritative Colyseus room and reconnect flow, bounded browser
acceptance, and a non-root production-shaped local container path. Phase 1 is
explicitly process-lifetime only; PostgreSQL durability begins in Phase 2.

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
pnpm exec playwright install chromium
pnpm browser:acceptance
pnpm container:smoke
```

For interactive development, run `pnpm dev`. The web client listens on
`http://127.0.0.1:5173` and proxies health, readiness, and WebSocket traffic to
the server on `http://127.0.0.1:2567`.

The browser acceptance command creates two isolated sessions at desktop and
tablet widths and writes rights-safe board captures to `test-results/phase-1`.
Reviewed reference captures are checked in under `docs/evidence/phase-1`; its
README contains the regeneration command. The current content is explicitly
labelled Phase 1 fixture data. It is not a source-derived scenario or a claim of
restart durability.

## Local container path

`pnpm container:smoke` builds the production-shaped image with Podman (or Docker
when Podman is unavailable), proves the application runs with a nonzero UID/GID,
checks both ready and dependency-unavailable modes, serves the built same-origin
client, and verifies graceful shutdown.

For an interactive same-origin proxy path, run:

```bash
podman compose up --build
```

The local Caddy endpoint is `http://127.0.0.1:8080`. The application container
uses `GETTYSBURG_SERVER_HOST`, `GETTYSBURG_SERVER_PORT`, the exact public origin
in `GETTYSBURG_TRUSTED_ORIGIN`, and the optional Phase 1 readiness-test switch
`GETTYSBURG_REQUIRED_DEPENDENCY=unavailable`.
Phase 1 generates its in-memory credential pepper at process start; no runtime
secret or PostgreSQL service is committed or required.
