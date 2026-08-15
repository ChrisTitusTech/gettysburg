# Gettysburg project tasks

## Current phase: Phase 1 multiplayer vertical slice

PR #1 merged as `c3d3ef1e683fb7b2fb0fe0c25e40722a8779ff0c` on 2026-08-15.
Phase 1 work may use clearly labelled fixture content while the source and rights
decisions remain open.

Local implementation is complete on `codex/phase-1-scaffold` as of 2026-08-15.
The phase remains open only for the owner-controlled review/publication gates
recorded below; no implementation or local-validation failure remains.

- [ ] Resolve the minimum content and rights decisions for prototype work.
  - Scope: Obtain or explicitly defer the Battle Manual, complete counter faces,
    scenario setup, victory/objective rules, optional rules, and art-use decision.
  - Acceptance criteria: Every item is linked to an approved source or labelled
    fixture/deferred with an owner and a phase gate.
  - Automated validation: Owner-local source inventory hashes pass when ignored
    inputs are present; clean-clone content-schema checks pass independently.
  - Manual validation: Project owner reviews the interpretation/rights ledger.
  - Dependencies or blockers: Additional physical source material and owner input.
  - Status: Implementation complete. The ledger explicitly defers every missing
    input, names ChrisTitusTech as owner, and blocks later fidelity/public-release
    claims at the appropriate phase. Owner review is still unobserved. Follow-up:
    ChrisTitusTech reviews `docs/references/SOURCE_ASSETS.md` before Phase 1 is
    marked complete.

- [ ] Scaffold the typed pnpm workspace and CI gate.
  - Scope: Create `apps/web`, `apps/server`, `packages/game`, and
    `packages/content`; pin supported Node/pnpm versions; add format, lint,
    type-check, test, build, and development scripts.
  - Acceptance criteria: A clean clone installs and every documented command
    intended as a terminating check succeeds locally and in CI.
  - Automated validation: `pnpm install --frozen-lockfile`, `pnpm format:check`,
    `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and a
    timeout-bounded `pnpm smoke` that starts both services, verifies readiness,
    and shuts them down.
  - Manual validation: `pnpm dev` starts the browser and server together for
    interactive development and stops cleanly on operator request.
  - Dependencies or blockers: None.
  - Status: Local implementation complete. The frozen install, format, lint,
    type-check, 62 tests, build, bounded smoke check, and interactive start/stop
    check pass on Node.js 24.13.1 with pnpm 11.21.0. Exact-head CI is unavailable
    because the completed work is uncommitted and unpublished; committing,
    pushing, and opening a pull request require explicit owner authorization.
    Follow-up: ChrisTitusTech authorizes publication, then CI must pass at that
    exact head before this task is checked.

- [x] Implement the board calibration and accessible two-counter client.
  - Scope: Create an approved original or clean-room fixture board, map the
    playable A-U/1-11 coordinates, and add SVG pan, zoom, select, and move intent
    for two fixture counters. Keep scan-derived intermediates local and ignored.
  - Acceptance criteria: Counter hit targets remain aligned at supported zoom
    levels and invalid moves visibly return to confirmed state.
  - Automated validation: Coordinate transforms, bounds, selection state, and
    component behavior tests.
  - Manual validation: Desktop and tablet screenshots at minimum, fit, and zoomed
    views; pointer, touch, and keyboard inspection.
  - Dependencies or blockers: Board geometry calibration.
  - Status: Complete. Content and component tests pass. Playwright verified
    pointer, keyboard, and touch flows at 1440 x 900 and 1024 x 768, and refreshed
    minimum, fit, and zoomed evidence is checked in under
    `docs/evidence/phase-1`.

- [x] Implement the authoritative multiplayer room.
  - Scope: Create/join, one-time invitation claim, Union/Confederate seats,
    hashed browser-session credentials and multi-game seat bindings, audited
    operator recovery, versioned `moveUnit`,
    immutable rules/content revisions, ordered broadcast, conflict-safe
    idempotency, action log, and reconnect.
  - Acceptance criteria: Two browsers remain synchronized; unauthorized, stale,
    duplicate, and invalid commands cannot mutate state; a player reconnects to
    the same seat and latest snapshot. A copied invitation cannot take a claimed
    seat, multiple games coexist in one browser session, and losing a cookie
    requires binding revocation and operator recovery.
  - Automated validation: Pure reducer tests plus Colyseus integration tests for
    reconnect, browser restart, cookie loss, copied/replayed invitation, operator
    recovery, credential revocation, and command crash/retry without reapplication.
    Conflicting reuse of one command ID and action-sequence gap detection are
    covered explicitly.
  - Manual validation: Two independent browser contexts complete the full flow.
  - Dependencies or blockers: Workspace scaffold and protocol types.
  - Status: Complete for the Phase 1 live-process persistence boundary. Tests
    cover credential hardening, invitation replay, multiple-game bindings,
    reconnect, seat recovery/revocation, binding-scoped idempotency, crash/retry,
    invalid/stale/unauthorized commands, ordered events, gap detection, and exact
    WebSocket-origin rejection. The two-context browser flow passes at both
    required viewport sizes.

- [x] Add the production-shaped local runtime and health checks.
  - Scope: Rootless-compatible container image, local compose/development path,
    `/healthz` liveness, `/readyz` readiness, graceful shutdown, and documented
    environment contract without secrets. Phase 1 runs in explicitly configured
    in-memory mode and does not provision PostgreSQL.
  - Acceptance criteria: The image and every application service in the local
    compose/development path run as a non-root user, serve the vertical slice,
    and terminate cleanly; readiness fails when its configured Phase 1
    dependencies are unavailable and does not report database durability.
  - Automated validation: Container build, health, shutdown, and configuration
    tests assert a nonzero runtime UID/GID for application processes. The smoke
    test proves in-memory readiness passes without PostgreSQL and fails when a
    required application dependency is removed.
  - Manual validation: Run through the same origin behind a local Caddy or
    equivalent reverse-proxy test and confirm the proxied application process is
    non-root.
  - Dependencies or blockers: Server entry point.
  - Status: Complete. `pnpm container:smoke` passes with Podman at UID/GID
    1000:1000, zero added capabilities, read-only root filesystem, ready and
    fail-closed dependency modes, and clean shutdown. The same-origin Caddy
    compose path passes at `http://127.0.0.1:8080`; both application and proxy
    run non-root with all capabilities dropped and were removed after validation.

- [ ] Complete Phase 1 review and evidence.
  - Scope: Final diff, complete local gate, built-in review, independent review,
    exact-head CI, browser evidence, and documentation/status update.
  - Acceptance criteria: All Phase 1 exit criteria in `ROADMAP.md` pass and no
    required check or manual result is missing.
  - Automated validation: Complete repository gate and exact-head CI.
  - Manual validation: Two-browser desktop/tablet create, join, move, reject, and
    reconnect evidence.
  - Evidence policy: Record `pnpm format:check`, `pnpm lint`, `pnpm smoke`, and
    the two-browser/session flow at both desktop and tablet viewport widths. For
    every unavailable check, record the project owner, attempted result, reason,
    and follow-up before leaving this task open; never mark it complete on an
    unexplained skip.
  - Dependencies or blockers: All Phase 1 implementation tasks.
  - Status: Local evidence complete. The full repository gate, browser
    acceptance, container smoke, compose proxy run, Markdown lint, Action lint,
    source-asset boundary, secret scan, and final diff checks pass. Built-in
    review found a cross-binding idempotency disclosure; the fix and regression
    tests pass. CodeRabbit was stopped after exceeding the owner's duration
    tolerance and must not block progress. Remaining owners and follow-up:
    ChrisTitusTech reviews the rights ledger and authorizes commit/push/PR;
    independent review and exact-head GitHub CI then run on the published head.
    This task and Phase 1 remain open until those results are observed.

## Backlog by phase

### Phase 2

- [ ] Encode the complete approved map, units, counter states, setup, and entries.
- [ ] Implement the 24-turn rules-light tabletop workflow and server dice.
- [ ] Add PostgreSQL migrations, transactions, snapshots, actions, and resume.
- [ ] Add secure invitations and operator recovery.
- [ ] Deploy and restore-test the private staging service on the VPS.
- [ ] Complete a full two-player Phase 2 acceptance game.

### Phase 3

- [ ] Implement and test movement, terrain, roads, streams, ZOC, and stacking.
- [ ] Implement and test combat grouping, modifiers, results, loss, retreat, and
  advance.
- [ ] Implement and test reinforcement, night, objective, and victory rules.
- [ ] Add rule versions, explanations, previews, and deterministic replay.
- [ ] Complete a full rules-enforced acceptance game.

### Phase 4

- [ ] Finish original rights-safe art and responsive interaction design.
- [ ] Complete accessibility, browser, performance, and security hardening.
- [ ] Add approved spectator, replay, and asynchronous features.
- [ ] Automate backups and exercise restore, migration, rollback, and reboot.
- [ ] Load-test the target VPS and document the supported capacity.
- [ ] Complete production-candidate review and 24-turn acceptance.

## Phase 0 completion gate

- [x] Merge PR #1 to establish the project foundation and implementation
  direction.
  - Scope: Source inventory, product plan, specification, phased roadmap, current
    tasks, repository instructions, and verified VPS operations baseline.
  - Acceptance criteria: Planning artifacts are internally linked, unknowns and
    rights risk are explicit, and Phase 1 is bounded and testable.
  - Automated validation: Documentation whitespace/link checks; owner-local
    filename, byte-size, page-count, image-dimension, SHA-256, and
    `git check-ignore` evidence for every supplied source file.
  - Manual validation: Architecture, source interpretation, and live VPS facts
    reviewed during PR #1; mark complete in the first post-merge task update.
  - Residual risk: Missing source and rights decisions remain open Phase 1 gates.

### Phase 0 gate evidence

- Status: Complete. PR #1 merged as
  `c3d3ef1e683fb7b2fb0fe0c25e40722a8779ff0c` on 2026-08-15 after the exact-head
  Documentation check passed.
- Final diff: Planning, repository-policy, documentation-validation, source
  boundary, and VPS baseline files only. The supplied JPG/PDF inputs are ignored,
  untracked, and absent from the staged diff.
- Local gate: `git diff --cached --check`, Markdown lint, Action workflow lint,
  per-asset ignore/untracked checks, and the known-byte regression guard pass.
  Committed HEAD `8514cae` also passes `git diff-tree --check`; the planning
  commit's `origin/main...HEAD` result must be recorded after commit and before
  push.

| Gate | Responsible owner | Attempted result | Unavailable reason | Required follow-up |
| --- | --- | --- | --- | --- |
| Application install | ChrisTitusTech | Not run: no install command exists | Phase 0 has no package manifest or scaffold | Add and run the frozen pnpm install in Phase 1 |
| Type-check | ChrisTitusTech | Not run: no type-check command exists | Phase 0 contains no application source | Add and run `pnpm typecheck` in Phase 1 |
| Tests | ChrisTitusTech | Not run: no test command exists | Phase 0 is documentation-only | Add and run `pnpm test` in Phase 1 |
| Build | ChrisTitusTech | Not run: no build command exists | Phase 0 has no application scaffold | Add and run `pnpm build` in Phase 1 |
| Browser | ChrisTitusTech | Not run: there is no runnable UI | Phase 0 has no client | Run two sessions at desktop and tablet widths in Phase 1 |
| Container | ChrisTitusTech | Not run: there is no application image | Phase 0 has no runtime | Add and run the non-root container smoke gate in Phase 1 |
| Independent review | ChrisTitusTech | CodeRabbit CLI returned zero findings on the staged diff | No unavailable check | Reverify the published exact head before merge |
| Exact-head CI | ChrisTitusTech | Passed: Validate planning foundation | No unavailable check | Reverify the Phase 1 exact head before merge |

- Post-merge follow-up: Completed in the first Phase 1 task-status update.
