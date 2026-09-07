# Gettysburg

Gettysburg is a browser-native, two-player adaptation of a turn-based hex-grid
battle game. The project is intended to preserve the tabletop flow while adding
modern multiplayer, saved games, server-authoritative state, and a clean user
interface that can be self-hosted on the dedicated Gettysburg VPS.

The local project workspace contains supplied board, rules, and order-of-battle
references that are deliberately ignored by Git. The repository contains only
the approved implementation plan and rights-safe project work. The current
application candidate enables mandatory Scenario Five for new games; complete
phase/release acceptance remains tracked in `ROADMAP.md` and `TASKS.md`.

## Current status

PR #4 merged on 2026-09-06. Its reviewed terrain and operational repairs are
deployed as `40cff572aab183660dfeee188c4b6acddb2b1de5`, with passing exact-head
and post-merge CI, healthy containers, public readiness, verified encrypted
backups, desktop/tablet two-player browser checks, and application restart/resume.
Phase 2 operational closeout is complete. The newer source candidate uses
`gettysburg-mandatory-v4` / `gettysburg-mandatory-board-v1` for new games, including
weighted movement, continuous stack activation, reinforcement costs, connected
terrain defense, retreat/advance, and mandatory night withdrawal. Existing saves
retain their original rules. Dependency advisories were patched separately.
The newer candidate has not been deployed by this change; retained-version replay,
owner gameplay acceptance, and Phase 4 release gates remain open.
See `TASKS.md` for dated evidence; this is a development deployment, not a claim
of production readiness.

## Project documents

- `PLAN.md` - product direction, decisions, delivery strategy, and gates
- `SPEC.md` - required behavior, architecture, security, and acceptance criteria
- `ROADMAP.md` - ordered implementation phases and exit criteria
- `TASKS.md` - current reviewable work and validation status
- `docs/references/SOURCE_ASSETS.md` - local-only source inventory and missing inputs
- `docs/references/TERRAIN_ADJUSTMENTS.md` - per-hex terrain/modifier owner-review
  worksheet
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
has one step and is eliminated by its first loss. All 253 owner-approved terrain
records now feed rules and previews. Inferred movement/forest/hill connections
and scenario adaptations remain explicit owner gameplay acceptance checks.

## Development

Use Node.js 24 and pnpm 11.21.0, with Bash, coreutils/util-linux, and `age`
(`age` plus `age-keygen`) available for local operations tests. These tests use
temporary keys and controlled container/SSH boundaries, not the VPS. Install
dependencies and run the terminating local gate with:

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
pnpm browser:movement
pnpm container:smoke
```

For interactive development, run `pnpm dev`. The web client listens on
`http://127.0.0.1:5173` and proxies health, readiness, and WebSocket traffic to
the server on `http://127.0.0.1:2567`.

The browser acceptance command creates two isolated sessions at desktop and
tablet widths and writes rights-safe board captures to
`test-results/browser-acceptance`. `pnpm browser:movement` separately exercises
mandatory-rule edge cases in clearly labelled development-only browser fixtures.
Run `GETTYSBURG_FULL_GAME=true pnpm browser:acceptance` for the extended gate
used in CI: two independent live combat games through turn 24, one using desktop
keyboard controls and one using tablet touch. Both reload with server dice
awaiting confirmation, resolve available combat choices, verify final and
historical replay, and await durable cleanup. The games have an eight-minute
per-game bound; commands are paced below the room's abuse limit even on fast
runners. CI allows 25 minutes for these games plus the other required gates.
These automated checks do not replace owner tabletop adjudication.
`GETTYSBURG_BROWSER=firefox GETTYSBURG_FULL_GAME=true pnpm browser:acceptance`
also passes locally at both widths with keyboard/mouse input. Chromium remains
the default and supplies continuous tablet-touch and native notification-worker
fixtures. The alternate-engine CI workflow additionally targets WebKit on Ubuntu;
actual Safari/iPad and real push-provider behavior remain manual release gates.
The private source scans and Battle Manual remain local and ignored.

On the board, drag any friendly counter to move its entire stack. Hold Ctrl
before dragging to move only the grabbed counter, or Ctrl-click once to keep it
in single-counter mode for a later drag. Use the group selector for other legal
subsets. Repeated drags must retain the exact group until a different group moves;
previous movers then cannot resume that phase. Roads/rails cost half a point
outside enemy ZOC; other costs use the pinned terrain and connections.

Reinforcement controls select a single counter or common-entry group and show
the actual entry cost and blocked-entry alternatives. Retreat controls offer
legal next steps, undo, and confirmation, including trapped losses and permitted
edge exits. Advance controls offer legal victorious groups and destinations or
decline; normal movement spending does not restrict a free advance. Board
shortcuts remain available. Night guidance names counters that must withdraw.
All movement and combat choices are coordinate-entry-free.

Choose **View replay** to inspect verified mandatory-game history. Opening,
previous/next, event-number, and latest controls reconstruct a historical board;
you can inspect either side and pan/zoom, but cannot move counters or resolve
combat there. Recorded dice are shown with each combat snapshot. **Return to
live game** restores the current authoritative view. Closing replay cancels its
pending request; a failed authorized read clears the displayed snapshot.
Older tabletop rulesets currently fail closed for replay rather than use newer
rules, and deleted games remain inaccessible.

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
