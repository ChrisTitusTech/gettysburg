# Project instructions

## Purpose

Build a modern, self-hosted browser adaptation of the supplied Gettysburg
hex-grid battle game. Two remote players must be able to join a game, occupy the
Union and Confederate seats, move counters on the board, resolve turns, and
resume a server-authoritative saved game.

## Architecture

The target workspace is:

- `apps/web` - React and TypeScript browser client built with Vite
- `apps/server` - Node.js and Colyseus authoritative game server
- `packages/game` - pure TypeScript state, commands, rules, and validation
- `packages/content` - typed map, unit, reinforcement, and scenario data
- `docs` - product references, decisions, and operations runbooks

Use SVG for the initial map and counter renderer. Introduce PixiJS only after a
measured rendering or interaction need. PostgreSQL owns durable game state and
action logs. Caddy terminates HTTPS and proxies the same-origin application to a
rootless Podman deployment. See `SPEC.md` and `docs/operations/VPS.md`.

The source scans in the local workspace are Git-ignored reference inputs, not
repository content or generated files. Never force-add them. Do not overwrite,
recompress, rename, or redraw them without explicit approval.

## Working boundaries

- Preserve unrelated user changes.
- Never commit or publish supplied local JPG/PDF source material; the explicit
  root-file rules in `.gitignore` are an intentional rights and privacy boundary.
  Add a reviewed explicit rule when a new private source input is received.
- Do not expose or commit credentials, private keys, session data, database
  dumps, environment files, or the maintainer's source IP address.
- Keep game rules deterministic and side-effect free in `packages/game`.
- The server is authoritative for commands, turns, random rolls, and saved state.
- Do not make public-release use of supplied Avalon Hill art or scans until the
  rights and presentation decision in `SPEC.md` is resolved.
- Ask before destructive operations, schema migrations with data-loss risk,
  production deployments, or material product and architecture changes.
- Use rootless services for the application. Root remains available for host
  administration, Caddy, firewall, and package maintenance only. Direct root
  SSH is a key-only break-glass path on this dedicated host; rotate/remove a key
  after maintainer or workstation compromise, preserve an active recovery
  session during changes, and confirm provider-console recovery before removing
  the last verified key.

## Commands

Before the Phase 1 scaffold, clean-clone repository checks are:

```bash
git diff-tree --check --no-commit-id --root -r HEAD
git diff --check origin/main...HEAD
git diff HEAD --check
npx --yes markdownlint-cli2@0.23.0 --config .markdownlint-cli2.yaml \
  '**/*.md' '#.git/**'
git ls-files | sort
```

The project owner may also run local-only source verification when the ignored
inputs are present. This is not a clean-clone or CI requirement:

```bash
sha256sum gameboard.jpg Rules1.pdf Rules2.pdf \
  OOP-Union.pdf OOP-Confederate.pdf
git check-ignore gameboard.jpg Rules1.pdf Rules2.pdf \
  OOP-Union.pdf OOP-Confederate.pdf
```

Phase 1 must add working scripts with these stable repository entry points:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm smoke
pnpm dev
```

`pnpm smoke` must be a timeout-bounded, self-terminating startup check that
starts the browser/server stack, verifies readiness, and shuts it down. `pnpm
dev` remains the interactive development command and is not a CI gate.

Do not document a command as supported until it runs successfully in the
repository and on the intended Node.js LTS toolchain.

## Validation

- Run focused checks while implementing and the complete supported local gate
  before reporting a phase complete.
- Unit-test command validation and deterministic rules in the shared package.
- Integration-test room creation, joining, reconnecting, persistence, and
  authorization at the server boundary.
- Verify the rendered board and primary workflows in a real browser at desktop
  and tablet widths. Keep screenshots or equivalent rendered evidence.
- Inspect final status and diff, and report skipped checks and manual gates.
- If any required pnpm check, two-browser/session check at both desktop and tablet
  viewport widths, independent-review gate, or exact-head CI gate cannot run,
  record the responsible owner, attempted result, reason, and follow-up in
  `TASKS.md`; do not mark the phase complete. VPS deploy, backup, and restore gates
  begin in Phase 2.
- Before merging a phase, complete independent review and verify exact-head CI.

## Documentation routing

- Read `PLAN.md` for approved direction and decision gates.
- Read `SPEC.md` for requirements and acceptance criteria.
- Read `ROADMAP.md` for phase order and exit criteria.
- Read `TASKS.md` for current work, dependencies, and validation status.
- Read `docs/references/SOURCE_ASSETS.md` before encoding game content.
- Read `docs/operations/VPS.md` before infrastructure or deployment work.

Update the relevant document in the same pull request when implementation
changes a requirement, architecture decision, phase status, or operating step.
