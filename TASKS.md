# Gettysburg project tasks

## Current phase: Phase 2 digital-tabletop MVP

Phase 2 is published on `codex/phase-2-tabletop` and deployed to private staging
at `https://gettysburg.christitus.com` as of 2026-08-15. The local
PostgreSQL/Caddy stack remains available at `http://127.0.0.1:8080`. Built-in
review and exact-head CI remain open; the phase is not marked complete while
either is unresolved.

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

- [x] Encode the complete approved map, units, counter states, setup, and entries.
  - Status: The 54 Union and 28 Confederate fronts, Scenario Five setup, entry
    turns/hexes, eight objectives, night turns, and victory schedule are typed
    with local-source provenance and tests. The newly supplied Battle Manual is
    ignored, hashed, visually reviewed, and not committed. The owner approved
    deriving reduced combat values as half the full value rounded up; combat-one
    counters are one-step units eliminated by their first loss. The client has an
    original vector terrain presentation based on the local board reference,
    including woods, hills, roads, streams, town, and landmark layers; these are
    deliberately not used as rules data until that review. The artwork now uses
    one continuous hand-drawn paper, ink, and watercolor landscape beneath the
    transparent play grid, so woods and elevation cross hex edges naturally.
    Streams join into board-spanning waterways, and every road, railroad, and
    stream reaches the clipped outer board edge instead of stopping mid-map. The
    owner confirmed that I5, J5, and J6 do not receive hill artwork. The typed
    terrain fields stay explicitly unavailable because Phase 2 combat is
    unit-factor-only; reviewed per-hex terrain enforcement remains Phase 3 work.
- [x] Implement the 24-turn rules-light tabletop workflow and server dice.
  - Status: Movement, stacking, reinforcement entry, phase progression,
    cryptographic d10 rolls, confirmation, loss, retreat, advance, objectives,
    casualty scoring, night checks, automatic victory, and completion are
    server-authoritative. Ending movement now discovers every adjacent occupied-
    hex contact and deterministically exact-covers the whole contact network with
    legal independent skirmishes. Every eligible combat counter is assigned once,
    same-hex counters stay together, one side of each skirmish occupies one hex,
    and players cannot omit a touching stack or manually choose a grouping. The
    same authoritative action assigns separate cryptographic d10 rolls to both
    sides of every skirmish; modifiers and results are calculated independently,
    never cumulatively. The board draws each generated contact and presents
    labels, hexes, rolls, and capped printed combat-factor totals without raw ID
    or coordinate entry. Defender terrain adjustments remain excluded until the
    per-hex transcription is reviewed. Core night rules are now authoritative:
    the server and drag preview reject movement or reinforcement entry into an
    enemy ZOC, require every counter with a legal withdrawal to leave before
    movement ends, and create night combat only for combat counters unable to
    withdraw. Normal board drag now moves a whole
    friendly stack atomically at its slowest allowance; Ctrl-drag selects one
    counter. Retreat is also board drag, and every surviving counter and general
    from one losing hex moves together along connected hexes to the first empty
    hex. Advance and decline are board drag actions too: winning stacks are
    highlighted, vacated defender hexes are authoritative drop targets, and a
    visible tray accepts a declined advance. No board action requires typed hex
    coordinates. The empty Confederate opening is skipped so turn 1 starts at Union
    movement without artificial actions. Tests cover every phase-table row,
    automatic mandatory combat entry, dense-network legal separation,
    independent server rolls, nonadjacent combat skipping, night ZOC entry and
    withdrawal boundaries, trapped-only night combat, legacy declaration
    rejection, stacking shape, atomic movement and retreat, reinforcement gates,
    defender-wins-ties and every loss threshold, multi-choice combat, and a
    gap-free 47-action two-seat game through turn 24.
- [x] Add PostgreSQL migrations, transactions, snapshots, actions, and resume.
  - Status: Migrations are concurrent-start safe and idempotent. Real PostgreSQL
    tests prove restart reconstruction and atomic rollback on injected action-row
    failure. Startup, browser, and container checks pass; the container check
    resumes a secure-cookie session after application restart. A local `pg_dump`
    restore reproduced the game ID, versions, and state hash exactly.
- [x] Add secure invitations and operator recovery.
  - Status: One-use fragment invitations, hashed credentials, replay/mismatch
    rejection, binding-scoped authorization, audited one-use seat and host
    recovery, host-issued/revoked replacement invitations, seat surrender, and
    30-day soft deletion, daily hard purge, and minimal append-only soft-delete
    and purge receipts now persist across restart and pass in-memory, HTTP, and
    real PostgreSQL tests. Invitation secrets returned by an idempotent
    issue retry are encrypted with the server-held key outside the database and
    destroyed on claim or revocation. Gameplay, management, and audit actions
    share the gap-free event sequence while management/audit events preserve the
    gameplay version. Backups encrypt the PostgreSQL dump and exported deletion
    ledger with age, record and verify the database ledger watermark, and are
    copied daily to the maintainer workstation before that watermark is
    acknowledged.
    Redacted host-management events now broadcast through the live room and
    advance only the shared event cursor. Restore synchronization reapplies every
    externally retained tombstone or purge event atomically, so a pre-deletion
    backup cannot restore access; `/readyz` fails closed until the mounted
    off-host watermark equals the live ledger.
- [x] Deploy and restore-test the private staging service on the VPS.
  - Status: Rootless Quadlet services run the exact published revision recorded
    by the image label and deployment rollback record behind host Caddy at
    `https://gettysburg.christitus.com`. Local/public health and readiness,
    non-root application UID/GID, image-revision label, public WebSocket origin,
    two independent browser sessions, application restart/resume, PostgreSQL
    restart/resume, encrypted-credential continuity, and an isolated `pg_restore`
    pass. Backup `/srv/gettysburg/backups/20260816T005329Z` restored six deleted
    test games at event sequence 48/state version 47 with ledger watermark 0
    and verified strict checksums. The original Caddy placeholder and failed
    candidate units were restored after each pre-acceptance deployment failure.
- [x] Complete a full two-player Phase 2 acceptance game.
  - Status: Real two-browser create/join/reject/reconnect workflows pass locally
    and through public HTTPS/WebSockets at 1440 x 900 and 1024 x 768. A separate
    public two-browser run completed all 47 authoritative transitions through
    turn 24, reached the completed state at version 47, captured
    `test-results/phase-2-live/live-full-game-complete.png`, and deleted its test
    game through the confirmed host workflow. The owner confirmed the human
    24-turn acceptance game is complete. CodeRabbit reviewed the complete
    Phase 2 diff, its validated findings were addressed, and the focused
    remediation re-review returned zero findings. Exact-head CI remains
    unobserved. The built-in Codex review completed a direct multi-pass review;
    every validated durability, deployment, readiness, and backup finding was
    addressed, and the final focused review returned zero findings.

- [x] Add the immutable ruleset/content version registry gate.
  - Status: Saved games resolve through the exact ruleset/content pair. Unknown
    pairs remain stored but fail mutation/resume with `version_unavailable`, and
    PostgreSQL readiness fails closed until the matching handler/content bundle
    is restored. Unit and readiness paths cover the unsupported-version case.

### Phase 3

- [ ] Implement and test terrain costs, roads, streams, ZOC, and advanced
  stacking. Basic one-point-per-hex allowance enforcement, cumulative movement
  spending, atomic stack drag, Ctrl single-counter drag, and a capped route
  preview are complete in Phase 2.
- [ ] Implement and test complete terrain modifiers and remaining ZOC effects,
  loss, retreat, and advance. Adjacent-contact discovery, same-hex grouping,
  mandatory legal skirmish separation, independent automatic two-die unit-factor
  result interpretation, and printed-factor modifier totals are complete in
  Phase 2. Phase 3 retains verified per-hex terrain modifiers and any remaining
  rule-derived ZOC effects.
- [ ] Implement and test remaining reinforcement, night, objective, and victory
  rules. Core mandatory night withdrawal, no entry into enemy ZOC, and
  trapped-only combat are complete; nighttime reorganization remains.
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
