# Gettysburg project tasks

## Remaining-phase execution: 2026-09-06

The owner authorized completing remaining tasks/phases in small PRs and merging
validated increments. Each PR addresses one independently testable concern;
split implementation before it becomes difficult to review, not after bypassing
review or CI. No unresolved owner decision is implicitly approved by this plan.
The owner directed skipping CodeRabbit when rate-limited. Record that skip;
do not bypass built-in review, validation, exact-head CI, or actionable findings.

1. Patch dependency advisories; verify frozen installation, audit, and local gates.
2. Make browser-test deletion durable and verify it with independent sessions.
3. Transcribe remaining mandatory-rule interpretations, then implement movement,
   ZOC/retreat, mandatory night behavior, and versioned replay in separate PRs.
4. Validate rule explanations/previews and full rules-enforced acceptance games.
5. Complete accessibility, supported-browser, security, and performance audits.
6. Exercise recovery/reboot/rollback and measure a safe VPS room limit.
7. Close owner scope, rights, artwork, manual acceptance, and release gates before
   claiming all phases complete or publishing a production release.

Owner decisions: first release is Scenario Five with mandatory rules only;
replay, spectators, and asynchronous notifications are included. Nighttime
reorganization is optional (Rules1.pdf marker description / Battle Manual 10c),
so it is excluded from this mandatory-rules release. The owner also approved the
current original generated board, original counter symbols, and a clearly marked
reduced-strength treatment for public release, keeping supplied scans private.
Notifications will use opt-in browser push. Repeated drags remain one continuous
unit/stack move until another unit moves. Owner gameplay acceptance and final
release validation remain gates; engineering work continues through small PRs.

## Terrain follow-up: 2026-09-06

- [x] Implement and locally validate the approved painted-board terrain.
  - Scope: Record 253 owner-approved A-W hexes, correct B2/F11 to woods +2,
    infer forest/hill links, map road/rail/stream edges, and enable terrain combat.
  - Implementation: New development games use 23 columns, town +1, independently
    cancellable hill/woods components, strongest-hex terrain per skirmish, and a
    combined +10 cap. Culp's Hill moves to R10; eastern entries move to W7/W10.
    Other setup, unit values, schedules, and the 16 objective points remain.
  - Authority: ChrisTitusTech approved all terrain and best-guess forest links,
    and confirmed this is not live/production and old games need no compatibility.
    The owner subsequently authorized commit, push, merge, VPS rollout, and
    retirement of the five old development games after verified encrypted backup.
    The database itself must be preserved.
  - Plan and acceptance: Compare every worksheet row with typed data, validate
    explicit adjacent links, test terrain cancellation and scenario totals,
    then run the local gate and desktop/tablet two-session workflows. Inspect
    the rendered board before claiming visual acceptance. Rollback is the
    previous code revision; preserve stored data.
  - Validation: Frozen install, format, lint, typecheck, tests (251 passed), and
    build pass. The 11 database tests skipped by the default suite were then
    run against an isolated PostgreSQL container: all 92 server tests passed.
    Two-session browser acceptance passed at desktop/tablet widths; fit images
    were visually inspected in `test-results/phase-2`. CodeRabbit reviewed all
    changed and new files; after two minor fixes its second pass found no issues.
    Built-in Codex review also completed with no actionable findings. The older
    installed CLI could not use the configured model; the current CLI completed
    the review without a model or global installation change.
    Markdown lint passes with only table-spacing lint disabled around the
    worksheet to preserve owner-authored A-H rows. Final smoke passed on retry
    after a transient test-port collision; no unrelated process was stopped.
    Full Phase 3 remains open for movement rules and other acceptance gates.
  - References: `docs/references/TERRAIN_ADJUSTMENTS.md` and
    `docs/references/TERRAIN_CONNECTIONS.md` record values, inferred links,
    assumptions, source rules, and scenario adaptation.

| Remaining gate | Responsible owner | Attempted result | Reason and follow-up |
| --- | --- | --- | --- |
| Owner terrain gameplay | ChrisTitusTech | Automated desktop/tablet flows and visual inspection passed | Manually play representative forest/hill/town combats and inspect R10/W7/W10 adaptations before release |
| Complete Phase 3 | ChrisTitusTech | Terrain defense implemented; phase not complete | Finish movement costs, remaining rules, and full rules-enforced acceptance game |

This follow-up supersedes earlier terrain-unverified, fixed-M9, and 231-hex
calibration statements below. The August operational entries are historical
evidence, not a claim that this development project is in production. Remote
status in the August entries must not be treated as current deployment evidence.

## Delivery closeout: 2026-09-06

- [x] Commit, push, merge open PRs, and deploy the reviewed application.
  - PR #4 was the only open PR. Its final implementation head
    `00450ecb86507d26b1a4121d496e8eaace3a2007` passed Application CI,
    Documentation CI, built-in Codex review, and independent CodeRabbit review.
    Hosted CodeRabbit status was successful and all five review threads resolved.
  - Merge/application revision: `40cff572aab183660dfeee188c4b6acddb2b1de5`.
    Both post-merge workflows passed before deployment. The merge has the same
    tree as the reviewed PR head. No open PRs remain; the merged feature branch
    was removed. Historical local branches are retained rather than force-deleted.
  - The owner explicitly authorized retiring the five old development games.
    Pre-retirement backup `20260906T214315Z` and post-retirement backup
    `20260906T214944Z` passed encrypted checksums, isolated restore, and off-host
    verification. Audited host recovery followed by normal `deleteGame` retired
    exactly those five games, raised the deletion ledger from 15 to 20, and
    preserved the database. No compatibility migration or database wipe occurred.
  - `scripts/vps-deploy.sh` deployed image
    `8dfe5b28877de4548c4c2fe4c724ee10e09fd1002586eb3cde875644a15b5fcd`.
    Rollback files and the retained prior image are recorded under
    `/srv/gettysburg/backups/deploy-20260906T215510Z`. Do not restart the older
    ruleset against new terrain games; follow the runbook's maintenance/restore
    procedure if rollback is needed.
  - Public `/healthz` and `/readyz` passed; app and database containers are
    healthy. The app runs as UID/GID 1000. Deployment's public two-client
    WebSocket smoke passed. OCI build warnings about image health metadata are
    benign here: the Quadlet supplies the working, verified health probe.
  - `GETTYSBURG_ACCEPTANCE_ORIGIN=https://gettysburg.christitus.com
    GETTYSBURG_EVIDENCE_DIR=test-results/phase-2-rollout-20260906
    pnpm browser:acceptance` passed with two independent sessions at 1440x900
    and 1024x768. Desktop/tablet fit screenshots were visually inspected.
    Final SQL audit found its two games still active after the harness reported
    success. Their creation times, movement versions, and lack of deletion
    receipts identified them as this run's games. Operator recovery plus normal
    deletion cleaned them up; this limits the harness's cleanup evidence, not
    the verified synchronization and browser-resume results.
  - After backup `20260906T215812Z`, an additional two-client test moved a unit,
    restarted the VPS application, verified both credentials resumed the exact
    saved state including terrain, and synchronized another move. Its game and
    all browser/deployment smoke games were retired through the normal workflow.
    Final backup `20260906T220219Z` passed isolated restore and off-host
    verification after cleanup; the acknowledged deletion watermark is 24.
  - These results close Phase 2's operational gate. They do not replace the
    owner's remaining terrain-gameplay acceptance or claim Phase 3/4 completion.
    This documentation-only closeout does not change the deployed application.

- [x] Triage and patch the existing GitHub dependency alerts.
  - Owner: ChrisTitusTech. Read-only inspection found `shell-quote` 1.8.3
    (critical/high, through development-only `concurrently`) and `qs` 6.15.3
    (moderate, through runtime Express/body-parser). These pre-existing alerts
    were not introduced or fixed by the terrain PR. Workspace overrides now pin
    `shell-quote` 1.9.0 and `qs` 6.16.0 across all transitive paths. This also
    covers the additional `qs` isBuffer advisory found by the current registry
    audit. `pnpm audit --audit-level low` reports no known vulnerabilities.
    Frozen install, format, lint, typecheck, 251 default tests, build, smoke,
    desktop/tablet browser acceptance, and Markdown lint passed. All 92 server
    tests passed against isolated PostgreSQL, including the 11 skipped in the
    default suite. Built-in review found no actionable regressions. Published
    PR #5 merged as `bbb97e20586457817251dac557a2f374831d0b5a` after exact-head
    CI and independent review passed. GitHub reports no open dependency alerts.

- [x] Make browser acceptance await persisted deletion before closing contexts.
  - Owner: ChrisTitusTech. The deployed desktop/tablet scenarios passed, but both
    test games remained active at the final database audit. The current final
    heading wait did not prove the deletion request committed. A shared cleanup
    helper now awaits the exact delete command's successful response, navigation
    home, and an authenticated server read returning `410 game_deleted` before
    contexts close. Desktop/tablet and full-game scenarios use the helper.
    Six regression checks cover delayed completion, failed responses, logical
    rejection, a still-active game, and an incorrect read-back error. They run
    through `pnpm test`. The full 24-turn check then exposed a duplicate leave
    on an already-closing WebSocket; room cleanup now has a single owner and
    sends consent only on an open connection (two additional regression tests).
    The rerun passed desktop/tablet and all 47 full-game transitions, including
    committed deletion. Full-game evidence masks the invitation field. Published
    PR #6 merged as `fc8f907` after exact-head CI and built-in/independent CLI
    reviews passed without findings. Hosted CodeRabbit was rate-limited and
    skipped under the owner's instruction; no actionable threads remained.

## Phase 1 completion

PR #1 merged as `c3d3ef1e683fb7b2fb0fe0c25e40722a8779ff0c` on 2026-08-15.
Phase 1 work may use clearly labelled fixture content while the source and rights
decisions remain open.

Phase 1 implementation and validation are merged into `main`. On 2026-09-06 the
owner closed its remaining scope/original-presentation decisions: mandatory
Scenario Five, current original art approved for release, visibly reduced original
counters, and private source scans. Full Phase 3 gameplay and Phase 4 release
validation remain separate gates.

- [x] Record the owner review of the interpretation and rights ledger.
  - Scope: Confirm the Phase 2 Scenario Five interpretations and original board
    approval, then explicitly approve or defer the per-hex terrain transcription,
    reduced-face presentation, optional/additional-scenario scope, and public-use
    rights decision.
  - Acceptance criteria: Every item is linked to an approved source or labelled
    fixture/deferred with an owner and a phase gate.
  - Automated validation: Owner-local source inventory hashes pass when ignored
    inputs are present; clean-clone content-schema checks pass independently.
  - Manual validation: Project owner reviews the interpretation/rights ledger
    and `docs/references/TERRAIN_ADJUSTMENTS.md`.
  - Dependencies or blockers: Project-owner review and decisions.
  - Completion: Explicit 2026-09-06 scope and original-presentation approvals are
    recorded in `docs/references/SOURCE_ASSETS.md`; the rule implementation
    contract is in `docs/references/MANDATORY_RULES.md`. These supersede the
    historical terrain/rights status below. No supplied scan may be published.
  - Historical status: Implementation complete. The Battle Manual, Scenario Five
    setup, objective/victory schedule, front values, reduced-value formula, and
    original
    deluxe board are recorded. The earlier Big Round Top (`E6`) location and the
    terrain confirmations for `E6`, Little Round Top (`F6`), and Culp's Hill
    (`M9`) have been reopened because they were not checked against the approved
    tracked project board. The source-verified scenario objective coordinates at
    `F6` and `M9` remain fixed. ChrisTitusTech confirmed that woods provide no defense
    adjustment when a participating attacker and defender occupy the same
    connected forest. The landmark locations, exact adjustments, remaining
    per-hex terrain, optional-rule,
    additional-scenario, reduced-art, publication, and interpretation/rights
    decisions remain open. All coordinate-table terrain candidates require
    comparison against the approved tracked project board; the protected
    `gameboard.jpg` is not their approval surface. A deterministic labelled
    derivative at `apps/web/src/assets/gettysburg-board-deluxe-with-hexvalues.png`
    supplies all 231 worksheet display coordinates for static comparison.
    Follow-up: ChrisTitusTech completes those reviews in
    `docs/references/SOURCE_ASSETS.md` and
    `docs/references/TERRAIN_ADJUSTMENTS.md` before Phase 1 is marked complete.

- [x] Scaffold the typed pnpm workspace and CI gate.
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
  - Status: Complete. PR #1 merged as
    `c3d3ef1e683fb7b2fb0fe0c25e40722a8779ff0c`, and its exact-head workspace and
    documentation CI passed. The supported entry points continue to pass on
    Node.js 24 with pnpm 11.21.0.

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

- [x] Complete Phase 1 review and evidence.
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
  - Completion: The 2026-09-06 owner decisions close the final ledger gate.
  - Historical status: Implementation evidence complete. The full repository
    gate, browser acceptance, container smoke, compose proxy run, Markdown lint,
    Action lint,
    source-asset boundary, secret scan, and final diff checks pass. Built-in
    review found a cross-binding idempotency disclosure; the fix and regression
    tests pass. PR #1 merged after exact-head CI. The remaining owner gate is
    ChrisTitusTech's review of the rights ledger; this task and Phase 1 remain
    open until that manual result is recorded.

## Backlog by phase

### Phase 2

- [x] Complete the Phase 2 post-merge battle and operational cleanup.
  - Scope: Block movement and retreat through enemy-occupied hexes while
    preserving legal daytime attack approach into enemy zones of control;
    eliminate an unsupported general with its defeated combat stack; make the
    selected-unit decline action clickable; and address the remaining PR #2
    rate-limit, night-withdrawal, retreat-route, canonicalization, exact-cover,
    environment-pair, and readiness findings.
  - Acceptance criteria: Authoritative rules and the browser agree on movement,
    retreat, loss, and advance choices; every remaining PR #2 thread has a
    tested fix; the complete local gate, desktop/tablet two-browser flow,
    built-in review, independent review, and current-main CI pass. The verified
    off-host backup watermark must cover the live deletion ledger before current
    `main` is deployed. Local/public health and readiness, container health,
    exact running revision, WebSocket, restart/resume, and two-client state
    synchronization must then pass.
  - Completion: The 2026-09-06 delivery closeout above supersedes this historical
    status: PR #4 merged, exact-head and post-merge CI passed, and VPS release
    gates passed on `40cff57`.
  - Historical status: The code and review cleanup merged through PR #3 as `c6f406f`.
    PR #4 on `codex/phase-2-operational-repair` replaces the quote-fragile
    Quadlet expression with a compiled readiness probe, makes container smoke
    assert healthy and intentionally unhealthy states, and preserves the primary
    browser-acceptance error when cleanup also fails. Its complete local
    repository gate, desktop/tablet browser acceptance, rootless Podman
    health-state smoke, source boundary, generated-Quadlet checks, and built-in
    review pass. Application and Documentation CI passed on implementation head
    `405df158c32588438f2748e312146363b67796cb`, and all four hosted review threads
    are resolved. Any later commit must repeat both exact-head workflows. The
    hosted review at that implementation head was rate limited, so a non-rate-
    limited independent review of the final PR head remains required. The task
    also remains open until PR #4 merges, post-merge Application and
    Documentation CI pass on the resulting `main`, the verified off-host
    watermark covers the database ledger, current `main` is deployed, and the
    complete live release gate passes.

- [x] Encode the complete approved map, units, counter states, setup, and entries.
  - Status: The 54 Union and 28 Confederate fronts, Scenario Five setup, entry
    turns/hexes, eight objectives, night turns, and victory schedule are typed
    with local-source provenance and tests. The newly supplied Battle Manual is
    ignored, hashed, visually reviewed, and not committed. The owner approved
    deriving reduced combat values as half the full value rounded up; combat-one
    counters are one-step units eliminated by their first loss. The client uses
    the owner-approved original deluxe raster board beneath the transparent,
    calibrated 231-hex interaction grid. Its hand-painted woods, hills, roads,
    streams, town, and landmarks remain presentation-only and are deliberately
    not used as rules data until the per-hex terrain review. The painted streams
    visually follow the hex-grid landscape and reach the board boundaries, while
    exact edge topology remains deferred to typed Phase 3 data. The separate Time
    Record Track and center-bottom A/B entry markers are intentionally omitted.
    The owner selected this exact artwork revision for the cleanup PR; its
    provenance, dimensions, and checksum are recorded in the source-asset ledger.
    The typed
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
    counter. Retreat is also board drag, and every surviving counter and supported
    general from one losing hex moves together along a legal connected route to
    the first empty hex; a general is eliminated when combat losses remove every
    combat counter in its stack. Advance uses board drag: winning stacks are
    highlighted and vacated defender hexes are authoritative drop targets. The
    visible decline tray accepts a drop or, after unit selection, a click or
    keyboard activation. No board action requires typed hex coordinates. The
    empty Confederate opening is skipped so turn 1 starts at Union
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
    destroyed on claim or revocation. Invitation and operator-recovery claims
    retain client idempotency across lost responses, host-only controls and
    active invitation lookup IDs survive reload and seat surrender, and browser
    recovery paths scrub bearer fragments before redemption. Gameplay,
    management, and audit actions
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
  - Status: The original Phase 2 deployment and restore acceptance completed on
    code revision
    `f6a9ec27927d756daf5711188edbe4d564fed373`, recorded
    by the image label and deployment rollback record behind host Caddy at
    `https://gettysburg.christitus.com`. Local/public health and readiness,
    HSTS, non-root application UID/GID, internal-only application network,
    image-revision label, public WebSocket origin, an automatic public
    two-client state-synchronization transaction, two independent browser
    sessions, application restart/resume, PostgreSQL
    restart/resume, encrypted-credential continuity, and an isolated `pg_restore`
    pass. The post-deployment encrypted backup
    `20260816T072304Z` includes the encrypted credential pepper and passed strict
    checksums, remote isolated restore (`17:48:47:13`), off-host copy validation,
    and the deletion-ledger watermark gate. This is historical acceptance
    evidence, not the current service-health claim: as of the 2026-08-16
    follow-up, the same revision remains deployed with `/readyz` returning 503,
    database watermark 14 ahead of acknowledged watermark 13, and a malformed
    container health command. The operational-cleanup task above owns the new
    backup, current-main deployment, and repeat release gate. The original Caddy
    placeholder and failed candidate units were restored after each
    pre-acceptance deployment failure.
- [x] Complete a full two-player Phase 2 acceptance game.
  - Status: Real two-browser create/join/reject/reconnect workflows pass locally
    and through public HTTPS/WebSockets at 1440 x 900 and 1024 x 768. A separate
    public two-browser run completed all 47 authoritative transitions through
    turn 24, reached the completed state at version 47, captured
    `test-results/phase-2-live/live-full-game-complete.png`, and deleted its test
    game through the confirmed host workflow. The owner confirmed the human
    24-turn acceptance game is complete. CodeRabbit reviewed the complete
    Phase 2 diff, every validated finding was addressed, and the final focused
    reviews returned zero findings. The built-in Codex review completed a direct
    multi-pass review with every validated durability, deployment, readiness,
    and backup finding addressed. PR #2 passed exact-head Application and
    Documentation CI and merged as `e0ba1f6`; later current-main CI and staging
    health are tracked by the operational-cleanup task rather than reopening
    this completed human acceptance run.

- [x] Add the immutable ruleset/content version registry gate.
  - Status: Saved games resolve through the exact ruleset/content pair. Unknown
    pairs remain stored but fail mutation/resume with `version_unavailable`, and
    PostgreSQL readiness fails closed until the matching handler/content bundle
    is restored. Unit and readiness paths cover the unsupported-version case.

### Phase 3

- [ ] Integrate mandatory movement validation and browser previews.
  - Scope: Share terrain routing, budgets, accompaniment, activation, ownership,
    and endpoint stacking checks. Apply a successful proposal atomically through
    the reducer, reset activation for the next side, and capture objectives
    entered along a multi-hex route consistently with repeated drags.
  - Boundary: `gettysburg-mandatory-v4` is under construction and deliberately
    absent from the server registry/new-game defaults. Existing terrain-v3 games
    retain their prior movement behavior. The new validator requires a pinned
    terrain/edge bundle; browser wiring, lone-general capture, reinforcement,
    retreat, and complete night withdrawal still precede ruleset activation.
  - Acceptance: Test preview/reducer identity, half-point spending, stack limits,
    rejected-command immutability, persisted activation, phase reset, traversed
    objectives, missing bundles, and unchanged current ruleset behavior.
    Frozen install, format, lint, typecheck, 296 default workspace tests plus
    six harness tests, build, smoke, Markdown lint, and all 92 isolated
    PostgreSQL server tests pass. Desktop/tablet and full-game regression pass
    (`test-results/mandatory-movement-validator`). Independent review and
    exact-head CI remain required before merge.
- [ ] Persist and enforce the approved continuous-move policy.
  - Scope: A pure proposal tracks the active exact unit/stack group, previously
    closed groups, and full-move general accompaniment. Reordering IDs preserves
    a group; adding/dropping counters cannot restart a prior mover. A successful
    different-group move closes the prior group, not a selection or rejection.
  - Boundary: The serializable `normal_movement` state field and policy helper
    are preparatory; current rulesets do not yet use or populate them. Server
    integration must atomically persist the proposal with accepted movement and
    reset it at the next side's movement phase. Reinforcement entry also counts
    as a movement activation and cannot earn a retroactive general bonus.
  - Acceptance: Test repeated drags, group changes, reconnect serialization,
    half-point remaining budgets, general/slowest-unit limits, and immutability.
    Frozen install, format, lint, typecheck, 284 default workspace tests plus
    six harness tests, build, smoke, Markdown lint, and all 92 isolated
    PostgreSQL server tests pass. Desktop/tablet and full-game regression pass
    (`test-results/continuous-movement-policy`). Independent review and
    exact-head CI remain required before merge.
- [ ] Deliver the mandatory movement calculator and then activate it.
  - Scope: Pure adjacent-step costs and deterministic least-cost routing for
    clear/hill/town, woods/rough heights, explicit road/rail/stream links, day
    and night ZOC, enemy occupancy, and artillery terrain restrictions.
  - Boundary: `packages/game/src/movement.ts` is a preparatory calculator only.
    Existing server validation and browser previews still use the prior route;
    no saved rules/content interpretation changes in this increment.
  - Acceptance: Focused tests cover costs, road detours, stable tie-breaking,
    artillery, friendly transit, invalid steps, and immutable route totals.
    Frozen install, format, lint, typecheck, 273 default workspace tests plus
    six harness tests, build, smoke, and Markdown lint pass. All 92 server tests
    also pass with isolated PostgreSQL. Desktop/tablet and full-game acceptance
    pass (`test-results/movement-calculator`). Independent review and exact-head
    CI remain required before merge. Follow with general accompaniment, continuous
    move boundaries, and matching authoritative/browser integration.
- [ ] Implement and test terrain costs, roads, streams, ZOC, and advanced
  stacking. Basic one-point-per-hex allowance enforcement, cumulative movement
  spending, atomic stack drag, Ctrl single-counter drag, and a capped route
  preview are complete in Phase 2. The 253-coordinate terrain worksheet is
  approved and transcribed. Road/rail/stream edge estimates are mapped and
  structurally tested, but their variable movement costs are not yet enforced.
- [ ] Implement and test complete terrain modifiers and remaining ZOC effects,
  loss, retreat, and advance. Adjacent-contact discovery, same-hex grouping,
  mandatory legal skirmish separation, independent automatic two-die unit-factor
  result interpretation, and printed-factor modifier totals are complete in
  Phase 2. Phase 3 retains verified per-hex terrain modifiers and any remaining
  rule-derived ZOC effects. Terrain tests must prove that repeated standard hill
  or woods/forest terrain across connected defending hexes contributes its
  adjustment only once per skirmish, never once per hex or unit, and that
  matching terrain outside the skirmish contributes nothing. They must also
  prove that a participating attacker cancels woods eligibility for every
  defender in the same connected forest, a defender in a disconnected forest
  remains eligible, the side receives only one woods adjustment when any
  defender remains eligible, and independently applicable hill adjustments
  remain available. Forest-link tests must distinguish woods artwork that crosses
  a shared hex side from visually disconnected woods in adjacent hexes; reviewed
  per-hex-side forest links are required before enforcement.
- [ ] Implement and test remaining reinforcement, night, objective, and victory
  rules. Core mandatory night withdrawal, no entry into enemy ZOC, and
  trapped-only combat are complete. Optional nighttime reorganization is excluded;
  remaining mandatory edge cases are in `docs/references/MANDATORY_RULES.md`.
- [ ] Add rule versions, explanations, previews, and deterministic replay.
- [ ] Complete a full rules-enforced acceptance game.

### Phase 4

- [ ] Finish responsive interaction design using the owner-approved original
  board, counter symbols, and clearly marked reduced strength. Current original
  presentation has explicit release approval; supplied scans stay private.
- [ ] Complete accessibility, browser, performance, and security hardening.
- [ ] Add approved private spectators, replay, and opt-in browser push.
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
