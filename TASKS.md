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
The owner also approved applying the extra-loss/edge-exit rule when impassable
terrain makes retreat impossible, including trapped artillery on this board.

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

- [x] Repair late hosted replay-verifier findings after PR #25 merged.
  - Scope: Verify invitation retirement at surrender, reject issuance to an
    occupied seat, and reject overlapping host/same-seat binding intervals.
    Add focused corruption/valid-history regressions and preserve ordinary
    resume, deletion privacy, and fail-closed missing-evidence behavior.
  - Gate: ChrisTitusTech owns the follow-up. These comments arrived after the
    reviewed merge; do not treat the merged verifier as final release acceptance.
    Complete local/database/browser gates, fresh independent review, and
    exact-head CI in a separate repair PR before resolving the late threads.
  - Implementation: Persist invitation claim and surrender-revocation event
    boundaries; keep the replay API's evidence projection credential-free.
    Validate nonoverlapping per-role binding intervals once, use indexed
    historical seat occupancy for issuance, and check surrender's outstanding
    invitations without retiring future issues or earlier claims/revocations.
    Immediate-recovery zero-action intervals remain valid. No save rewrite or
    ordinary-resume change; missing replay evidence fails closed.
  - Validation: The first focused run rejected a corrupt recovery fixture at
    the new earlier chronology check; its expected error was updated. Initial
    new test typing errors involved readonly arrays and omitted optional fields;
    corrected fixtures pass typecheck and all 35 focused replay tests, including
    overlapping host/Union/Confederate intervals, consistently forged occupied
    invitations, surrender retirement, future claims/issues, expired invitations,
    and replay after snapshot restore through the API projection. Complete
    local/database/browser gates and fresh review follow before publication.
    The complete local gate now passes with 554 workspace/nine harness tests
    and all 172 PostgreSQL tests. Both enforced games pass through turn 24 with
    two combats, pending-result reload, and exact replay in
    `test-results/replay-management-chronology`; mandatory input fixtures pass
    in `test-results/replay-management-chronology-fixtures`. Fresh independent
    review found no actionable regressions and reran 159 server tests/typecheck;
    its 13
    database skips are covered by the isolated PostgreSQL run above. Parent
    PR #29's failed CI timeout remains a merge blocker for this stack. The
    repaired eight-minute harness bound from parent `7f7a84f` is merged here;
    it changes no application source or browser assertions. The existing
    chronology browser/database evidence above passed under the stricter bound.
    The combined local gate passes again (554 workspace/nine harness tests).
    Fresh independent review against the viewer parent found no actionable
    regressions and reran 159 server tests; database/browser evidence is above.
    PR #31 head `4654b0d` passed Application (`34086415225`, 13m1s) and
    Documentation (`34086415201`) and merged as `079aa17`. Its late PR #25
    threads were resolved after publishing the repair; no unresolved threads
    remained at merge. This closes the repair, not Phase 3 owner acceptance.
- [x] Repair late hosted replay-viewer findings after PR #28 merged.
  - Scope: Respect 429/Retry-After, preserve presentation across adjacent events,
    reflect live management/audit cursors, and remove the desktop grid layout
    that stretches the return button beside the board.
  - Gate: ChrisTitusTech owns focused component/API regressions and real
    desktop/tablet rendered checks, including the entire replay container.
    Independent review and exact-head CI remain required before repair merge.
  - Implementation: Keep the same read-only board during pending and successful
    adjacent-event loads; clear it on authorization/history failure or a game
    change. A 429 preserves the verified view and pauses navigation until the
    bounded numeric Retry-After interval expires, without auto-retrying.
    Management/audit callbacks share accepted-cursor updates separate from
    gameplay state. Replay controls have their own single-column layout.
  - Validation: Nine new component/API cases pass (105 client tests), including
    selection/zoom continuity, other-game isolation, throttled form submission,
    timer expiry, and header parsing. The first focused typecheck caught a
    readonly test-fixture assignment; the fixture now constructs a new state
    and typecheck passes. Desktop/tablet real-browser checks pass in
    `test-results/replay-viewer-context`: pan/selection continuity, full-width
    layout with a normal-height return button, and host-only invitation
    issue/revoke updates reaching a seated replay viewer at unchanged gameplay
    version. Both entire replay-control renders were inspected. Full local,
    database, extended-game/fixture, and fresh review gates now pass: 549
    workspace plus six harness tests, all 167 PostgreSQL server tests, and
    `test-results/replay-viewer-context-final` plus
    `test-results/replay-viewer-context-final-fixtures`. Both extended games
    reached turn 24 and covered loss, retreat, and advance choices. An initial
    format check flagged the new API test; formatting was corrected and the
    complete gate rerun passed. Fresh independent review found no actionable
    regressions and reran 105 client tests; it did not rerun the browser suites
    covered above. Exact-head CI and thread resolution remain before merge.
    After merging PR #29's pacing repair, the combined full gate passes with
    549 workspace/nine harness tests and all 167 PostgreSQL tests. Both full
    games and input fixtures pass in `test-results/replay-viewer-context-paced`
    and `test-results/replay-viewer-context-paced-fixtures`; desktop covered
    loss/advance and tablet all three choices, with reload/replay checks passing.
    The complete replay-container renders were inspected again. A fresh
    independent review of the combined branch found no actionable regressions
    and reran all 105 client tests and whitespace checks.
    PR #30 head `d936c79` passed Application (`34085234470`, 12m12s) and
    Documentation (`34085234490`) with no review threads. The four late PR #28
    threads are resolved after publishing the repair. Merge still waits for
    parent PR #29's repaired exact-head CI.
    After the parent passed and merged, PR #30 merged as `5aeb2d5` with the
    same verified head and no unresolved threads.
- [x] Strengthen the full-game browser acceptance beyond no-contact turns.
  - Scope: Use two actual browser sessions and visible keyboard/touch controls
    to play the pinned opening into two independent live combats, reload both
    clients with server results pending, resolve recorded choices, and continue
    through turn 24 at desktop and tablet widths. Compare saved states after
    every accepted command and verify exact final/historical replay; await
    durable deletion of each acceptance game. No fixture commands or dice are
    injected into the server.
  - Boundary: This is automated workflow coverage, not owner tabletop
    adjudication or proof that every randomized run exercises every choice.
    Existing deterministic fixtures retain edge-case retreat/advance coverage.
    Full Phase 3 and public-release gates remain open.
  - Validation: The first run reached the new desktop scenario but
    its separate HTTP client's state read returned 401 for the browser's Secure
    loopback cookie. Reads now execute inside the authenticated browser instead.
    Keyboard checkbox activation uses Space. Both full games now pass; the first
    successful pair covered loss, retreat, and advance choices at each width.
    Their completed desktop/tablet renders were inspected in
    `test-results/enforced-combat-game`. The final bounded rerun passes in
    `test-results/enforced-combat-game-final`; its desktop game covered all
    three choice kinds and its tablet game covered loss/advance. Isolated
    movement fixtures also pass in `test-results/enforced-combat-game-final-fixtures`.
    Frozen install, format, lint, typecheck, 540 workspace plus six harness tests,
    build, smoke, Markdown/whitespace, and all 167 PostgreSQL server tests pass.
    CI now enables both extended games; each game is bounded to five minutes and
    browser verification fetches to 15 seconds. Fresh independent review found
    no actionable regressions and checked JavaScript syntax/whitespace; it did
    not rerun the browser suites covered above. Exact-head CI follows before
    merge. Responsible owner: ChrisTitusTech. CodeRabbit remains skipped under
    the owner's limited-plan instruction.
    PR #29 head `b467678` passed Application (`34083239002`) in 11m39s and
    Documentation (`34083238994`). Hosted review still identified insufficient
    overall CI headroom and a possible room-limit rejection on fast runners.
    The job now allows 20 minutes while preserving each game's five-minute
    bound. A monotonic pacer spaces sequential commands by at least 400ms,
    including time spent in UI/persistence work, without changing server limits.
    Three deterministic tests cover first-command latency, fast ten-second
    windows, and credit for elapsed work; they are included in `pnpm test`.
    The repaired full local gate passes with 540 workspace and nine harness
    tests. Both paced full games pass in `test-results/enforced-combat-game-paced`;
    movement fixtures pass again in
    `test-results/enforced-combat-game-paced-fixtures-final`. Server source is
    unchanged from the passing 167-test PostgreSQL run. Fresh independent review
    found no actionable defects and reran all nine harness tests/whitespace;
    browser evidence is from the separate runs above. Exact-head CI remains
    required after pushing this repair and resolving its two hosted threads.
    Superseding head `8189bd0` failed Application run `34084873020`: desktop
    completed successfully, but tablet reached turn 24/movement/v59 and exceeded
    the five-minute per-game bound during an authenticated verification read.
    Movement fixtures, startup smoke, and container smoke were skipped; this is
    not complete CI evidence. Documentation run `34084872957` passed. The
    timeout is now eight minutes per game and 25 minutes overall, retaining
    all assertions, 15-second reads, pacing, and self-termination. Responsible
    owner ChrisTitusTech must verify the repaired exact head before merge.
    Local observation identified repeated whole-service snapshot hydration in
    ordinary resume reads (roughly 9 MB across six acceptance games); a separate
    Phase 4 performance repair will consolidate these reads. This is not a
    measured capacity claim. Full local/browser validation and fresh review
    follow this bounded timing repair before push.
    The repaired full local gate passes (540 workspace/nine harness tests).
    Both enforced games pass in `test-results/enforced-game-time-budget` with
    pending-result reload and exact replay; tablet covered all three choices,
    desktop retreat/advance. Server code is unchanged from the passing 167-test
    PostgreSQL run. Fresh independent review found no actionable regressions,
    checked JavaScript syntax/whitespace, and did not rerun browser/CI gates.
    Mandatory browser input fixtures pass in
    `test-results/enforced-game-time-budget-fixtures`. Reverify exact-head CI
    before merge; the failed older run remains historical evidence.
    PR #29 head `7f7a84f` passed Application (`34086215407`, 11m32s) and
    Documentation (`34086215405`) and merged as `eec9876`, with no unresolved
    threads. This supersedes the earlier timeout failure and closes automated
    workflow coverage, not representative physical-board adjudication.
- [ ] Deliver read-only replay controls and finish replay acceptance.
  - Scope: Toggle live/replay views; navigate opening, previous/next, numbered,
    and latest events. Inspect either side, pan/zoom, and read recorded combat
    dice without routing game commands. Abort pending reads on close and discard
    stale or failed responses; keep the live room synchronized separately.
  - Boundary: Mandatory games only until retained-version handlers exist.
    Deleted games remain inaccessible. Full representative game adjudication,
    spectator authorization, measured replay capacity, and release gates remain.
  - Acceptance: Component/API regressions cover navigation, request credentials,
    abort/failure/mismatched-game responses, and read-only counter inspection.
    Two real desktop/tablet sessions must traverse historical states and prove
    that the live server version does not change. Inspect both rendered views,
    run the full local/database/browser gates, then independent review and CI.
  - Validation: Full frozen install, formatting, lint, typecheck, 528 workspace
    tests plus six harness tests, build, smoke, Markdown, and whitespace checks
    pass. All 158 server tests pass with isolated PostgreSQL. Two-session
    desktop/tablet replay and the no-contact 24-turn transition check pass in
    `test-results/replay-viewer-final`; mandatory input fixtures pass in
    `test-results/replay-viewer-final-fixtures`. Rendered replay views inspected.
    Fresh independent local Codex review found no actionable regressions and
    reran all 93 client tests. Exact-head CI and parent PR repairs remain before
    merge. CodeRabbit is skipped under the owner's limited-plan instruction.
    Hosted review found that counter selection blocked subsequent map panning,
    surrender remained visible during replay, and Confederate pending choices
    lacked markers. Replay now preserves the pan surface after inspection,
    hides surrender until returning to live play, and marks both sides' recorded
    retreat/advance choices without enabling commands. Three component tests
    pass (96 client tests); desktop/tablet browser coverage now checks panning
    after inspection and surrender visibility. The full local gate passes with
    536 workspace tests plus six harness tests and all 163 PostgreSQL tests.
    Desktop/tablet two-session replay, panning, surrender visibility, and
    no-contact 24-turn checks pass in `test-results/replay-viewer-interactions`;
    isolated input fixtures pass in `test-results/replay-viewer-interactions-fixtures`.
    Both rendered replay views were inspected. Fresh independent local review
    found no actionable regressions and reran all 96 client tests. Exact-head CI
    and review-thread resolution remain before merge.
    A further hosted pass found that read-only counter selection still exposed
    all 253 hexes as focusable move buttons. Replay now suppresses destination
    roles, move labels, and tab stops while retaining counter inspection and
    panning. Component checks cover every hex; real desktop/tablet acceptance
    also checks the destination accessibility tree after selection. The complete
    local gate passes with 540 workspace plus six harness tests. All 167 server
    tests passed with PostgreSQL on the unchanged server code in parent PR #27.
    Both browser suites pass in `test-results/replay-viewer-keyboard` and
    `test-results/replay-viewer-keyboard-fixtures`, including desktop/tablet
    replay inspection, panning, no inactive move tab stops, and the no-contact
    24-turn regression. Fresh independent review found no actionable regressions
    and reran all 96 client tests. Exact-head CI remains a merge gate.
    PR #28 head `3b8d046` passed Application (`34082151006`) and Documentation
    (`34082150966`) CI and merged into main as `b3fadc2`, with no unresolved
    review threads. Broader accessibility and owner gameplay gates remain open.
- [ ] Expose authorized replay snapshots, then finish replay delivery.
  - Scope: Add a read-only replay endpoint with a strict optional event-sequence
    cursor and current host/seat authorization checked in the same database
    snapshot as history. Resolve the exact registered replay handler. Return
    only replayed board state and cursor metadata with no-store caching;
    keep private bindings, recovery records, and raw actions internal.
  - Boundary: Mandatory games only in this increment. Retained games still
    resume but interpreted replay fails closed until their own handlers exist.
    Corrupt histories and prefixes beyond 10,000 actions fail generically.
    UI, spectator access, checkpointing/capacity and complete acceptance remain.
  - Acceptance: Test both seats, host-only access, unrelated/expired/revoked and
    deleted sessions, recovery metadata privacy, strict cursors, malformed logs,
    response isolation, readiness, retained-version rejection, and the work cap.
    Replay two independent automatic combats and a paid historical prefix after
    a real PostgreSQL restart. Run the full local/browser gates, independent
    review, and exact-head CI before merging.
  - Validation: Fourteen access/HTTP/bounds cases and a PostgreSQL combat-replay
    restart case pass. Frozen install, format, lint, typecheck, 517 default tests
    plus six harness tests, build, smoke, Markdown lint, and all 153 server tests
    with PostgreSQL pass. Two-session desktop/tablet and no-contact 24-turn
    browser acceptance pass (`test-results/authorized-replay`); mandatory input
    fixtures pass (`test-results/authorized-replay-fixtures`). Fresh independent
    built-in review found no actionable defects. Exact-head CI remains a
    pre-merge gate; CodeRabbit is limited and skipped per owner direction.
    No phase or deployment completion is claimed.
    The restart test now also crosses a real seat recovery so replay must use
    the persisted old/new binding chronology added by the verifier's follow-up.
    The combined stack passes frozen install, format, lint, typecheck, 519
    default tests plus six harness tests, build, smoke, Markdown lint, and all
    155 PostgreSQL server tests. Both browser suites pass again in
    `test-results/authorized-replay-chronology` and
    `test-results/authorized-replay-chronology-fixtures`. Fresh independent
    follow-up review found no actionable defects. Exact-head CI remains
    pre-merge; old totals above record the initial API.
    Hosted review then required throttling before synchronous replay and
    game-scoped binding indexing. The route now applies minute-long session,
    source, and global limits before reads/reconstruction; responses use 429,
    no-store, and Retry-After. The service supplies only this game's actors and
    invitation metadata to the indexed verifier, including the parent's new
    host chronology checks. Four regressions cover all limiter dimensions,
    expiry without reconstruction on denial, and invitation management across
    recovered-host snapshot restore. The full install/format/lint/typecheck,
    527 workspace tests plus six harness tests, build, smoke, Markdown, and
    whitespace gate passes; all 163 server tests pass with PostgreSQL.
    Desktop/tablet two-session and no-contact full-turn checks pass in
    `test-results/authorized-replay-limits`; isolated input fixtures pass in
    `test-results/authorized-replay-limits-fixtures`. Fresh independent local
    review found no actionable defects and reran 150 server tests; its 13
    database skips are covered by the separate PostgreSQL gate above.
    Exact-head CI remains before merge.
    The API now also supplies the verifier's invitation activation/revocation,
    claim, and expiry evidence; secrets remain excluded. The complete local
    gate passes again (527 workspace plus six harness tests; all 163 PostgreSQL
    tests). Both browser suites pass in `test-results/authorized-replay-invitation`
    and `test-results/authorized-replay-invitation-fixtures`. Fresh independent
    local review found no actionable defects and reran 150 server tests;
    its 13 database skips are covered above. Exact-head CI remains before merge.
    Recovery audit evidence is now passed to the strengthened verifier using a
    game-scoped, credential-free projection of retained grants. Existing host
    and seat recovery replay tests, including PostgreSQL restart, exercise this
    integration. The full local gate passes (529 workspace plus six harness
    tests and all 165 PostgreSQL tests). Both browser suites pass in
    `test-results/authorized-replay-audit` and
    `test-results/authorized-replay-audit-fixtures`. Fresh independent local
    review found no actionable defects and reran 152 server tests; its 13
    database skips are covered above. Exact-head CI remains before merge.
    A further hosted pass found that the API readiness middleware hydrated the
    PostgreSQL snapshot before the replay limits ran. The replay gate now runs
    before body parsing and readiness. All three limiter tests assert denied
    requests never call readiness or replay; an anonymous unavailable-service
    regression proves repeated 503 requests are bounded too. The complete local
    gate passes with 531 workspace plus six harness tests and all 167 PostgreSQL
    tests. Two-session desktop/tablet and no-contact full-turn acceptance pass
    in `test-results/authorized-replay-early-limits`; mandatory input fixtures
    pass in `test-results/authorized-replay-early-limits-fixtures`. Fresh
    independent review found no actionable regressions and reran 154 server
    tests; its 13 database skips are covered above. General API capacity and
    readiness cost remain in the Phase 4 hardening scope. Reverify exact-head CI
    before merge.
    PR #27 head `13f81ec` passed Application (`34081955973`) and Documentation
    (`34081955914`) CI and merged into main as `f9c439f`, with no unresolved
    review threads. This completes the API increment, not all replay/release gates.
- [ ] Enable mandatory new games and complete representative acceptance.
  - Scope: New games use `gettysburg-mandatory-v4` with the complete pinned
    `gettysburg-mandatory-board-v1` opening. Weighted terrain/route movement,
    exact-group continuation, reinforcement entry, normal exit, forced retreat,
    advance, and mandatory night controls now run against real authoritative
    games. Saved legacy/terrain pairs retain their prior interpretation.
  - Boundary: This supersedes the preparatory increments' not-yet-activated
    notes below. No database rewrite, VPS deployment, Phase 3 completion, or
    public-release acceptance is implied. Authorized replay controls, owner
    representative gameplay, and Phase 4 work remain open.
  - Acceptance: Prove a newly created PostgreSQL game uses the pinned opening,
    resumes paid continuation after restart, rejects a closed group, and retains
    both earlier movement handlers. Use two real browser sessions at desktop
    and tablet widths for weighted movement, reconnect, pointer/touch drag,
    keyboard single-counter movement, and the no-contact 24-turn sequence.
    Inspect rendered evidence and run the complete local gate, isolated database
    suite, container restart smoke, independent review, and exact-head CI.
  - Validation: Frozen install, format, lint, typecheck, 501 default workspace
    tests plus six harness tests, build, smoke, Markdown lint, and all 136 server
    tests with isolated PostgreSQL pass. Local rootless container smoke passes:
    UID/GID 1000, restart/resume, fail-closed readiness, and clean shutdown.
    Two-session desktop/tablet and no-contact 24-turn browser acceptance pass in
    `test-results/mandatory-default-final`; mandatory input fixtures pass in
    `test-results/mandatory-default-final-fixtures`.
    The tablet fit and held-drag views were inspected; screenshots mask any
    one-time invitation. Fresh independent built-in review found no actionable
    defects. Exact-head CI remains a pre-merge gate. CodeRabbit is limited and
    skipped per owner direction. This no-contact game does not replace owner
    gameplay acceptance.
    PR #26 head `2f5a173` failed CI run `34079237275` at held-drag page
    screenshot capture after tests and two-player acceptance passed. Startup
    and container smoke were skipped. Attempt 2 was superseded/cancelled by
    the parent-repair merge; owner ChrisTitusTech must retain this as incomplete
    evidence until the latest head's full Application gate passes. Local browser
    fixtures passed without weakening their movement assertions.
    Superseding activation head `6098981` passed the complete Application gate
    (`34081759781`) and Documentation gate (`34081759784`). PR #26 merged into
    main as `eedf574` after independent review and no unresolved threads. This
    closes the increment's failed-CI follow-up, not representative acceptance.
- [ ] Verify mandatory replay, then expose authorized replay controls.
  - Scope: Reconstruct mandatory-v4 from its pinned opening and ordered
    accepted commands, resolving the historical seat binding and recorded dice.
    Match automatic skirmish rolls by participants rather than JSON key order.
    Verify command hashes, sequence/state versions, event metadata, every
    resulting gameplay state, and an optional final snapshot. Historical prefixes
    supply a replay cursor. Management/operator records consume sequence only;
    their private payloads are neither executed nor exposed. Surrender retains
    its separate server-owned state-version behavior.
  - Boundary: This pure verifier is not a public API, an authorization mechanism,
    or a cryptographic proof of an untampered database. It does not generate
    replacement dice or use recorded resulting states as replay starting points.
    Authorized server/API integration, replay UI, retained-version behavior,
    and the full rules-enforced acceptance game remain open.
  - Validation: Thirty cases cover all 47 no-contact phase transitions across
    24 turns, paid continuation and prefixes, recorded dice, two independent
    skirmishes with reordered keys, input isolation, recovered historical seats,
    surrendered seats, private management/audit records, corrupted state,
    malformed JSON, unavailable versions/schemas, hashes, and duplicate commands.
    The no-contact test is not a representative owner-adjudicated acceptance game.
    Frozen install, format, lint, typecheck, 510 default tests plus six harness
    tests, build, smoke, Markdown lint, and all 145 PostgreSQL tests pass.
    Two-session desktop/tablet and 24-turn regression pass
    (`test-results/mandatory-replay-chronology`); mandatory browser fixtures pass
    (`test-results/mandatory-replay-chronology-fixtures`). Independent built-in
    review found no actionable defects. Hosted review then identified duplicate
    operator request IDs and altered gameplay summaries that the verifier did
    not reject. Both checks and three regression cases are added; the complete
    local and browser gates pass again. Fresh independent built-in repair review
    found no actionable defects. Exact-head CI must pass before merge.
    CodeRabbit is limited and skipped per owner direction.
    A second hosted pass found reused surrendered bindings and non-UUID
    automatic combat IDs. Replay now remembers surrendered binding tuples and
    requires server-generated UUID-v4 automatic combat IDs; replacement-seat
    replay and malformed-ID regression checks cover both repairs. Related checks
    reject invalid audit/management identifiers, invalid authorization versions,
    and any action after terminal deletion. Fresh combined independent built-in
    review found no actionable defects. Reverify exact-head CI before merge.
    A third hosted pass requires exact command-schema UUID validation, null
    operator IDs on gameplay, and binding activation chronology. All new seat
    bindings now persist their activation sequence in the canonical service
    snapshot; recovery, surrender, and deletion also record retirement bounds.
    Replay rejects attribution before activation or after retirement and fails
    closed if historical chronology is missing. Retained saves are not rewritten
    and ordinary resume is unchanged. Host command IDs reuse the gameplay
    envelope's UUID schema. Focused chronology, replacement-seat, malformed-ID,
    and missing-metadata cases cover the repairs. Combined local, database, and
    browser gates pass. Fresh independent built-in repair review found no
    actionable defects; exact-head CI remains pre-merge.
    A fourth hosted pass led to full host-command schema/hash/event validation
    and fixed-version, nonblank operator attribution checks. Redacted host
    records are now rejected rather than certified; validation never executes or
    exposes their contents. The request to preserve deleted-game seat bindings
    was declined against the deletion policy: deleted games are inaccessible,
    the API denies them, and this helper must fail closed without its required
    historical inputs. A regression proves that intentional missing-input
    failure; no deletion/retention behavior was weakened. The full local and
    database gates pass again. Browser evidence above is unchanged by these
    verifier-only repairs. Fresh independent built-in review found no actionable
    defects; exact-head CI remains pre-merge.
    A fifth hosted pass requires host-binding chronology and invitation-derived
    revoke summaries. Host creation/recovery now persist activation/retirement
    bounds just like seats. Replay indexes only this game's historical actors
    once, rejects unknown/ambiguous/temporally invalid host attribution, and
    derives revoke text from the retained invitation side instead of trusting
    the recorded summary. Missing evidence fails closed; deletion and ordinary
    resume policies are unchanged. Focused recovery and altered-summary checks,
    full local/database gates, and two-session desktop/tablet acceptance pass
    (`test-results/mandatory-replay-host`). The first fixture run lost its page
    during a concurrent rebuild and timed out; rerunning without concurrent
    builds passed (`test-results/mandatory-replay-host-fixtures`). Keep browser
    fixtures isolated from rebuilding their watched workspace. Fresh independent
    local review found no actionable defects and reran 130 server tests
    (12 database checks skipped there; the separate database gate passed).
    Exact-head CI remains before merge.
    A sixth hosted pass requires historical invitation availability, not just
    matching side text. New invitations retain activation sequence; explicit
    revocation retains its sequence. Replay also requires an unclaimed target,
    the matching revocation boundary, and a revoke timestamp before expiry.
    Retargeting a rehashed action to a claimed invitation, earlier revocation,
    future activation, missing revocation, or expired evidence is rejected.
    All 507 workspace tests plus six harness tests and all 142 PostgreSQL tests
    pass with the complete local gate. Desktop/tablet two-session acceptance and
    mandatory input fixtures pass in `test-results/mandatory-replay-invitation`
    and `test-results/mandatory-replay-invitation-fixtures`. Fresh independent
    local review found no actionable defects and reran 130 server tests;
    its 12 database skips are covered above. Exact-head CI remains before merge.
    A seventh hosted pass requires issued-invitation evidence, literal gameplay
    success, and recovery-audit linkage. Each issuance now matches exactly one
    retained side/activation record. Gameplay result/event envelopes are exact
    and require boolean `ok: true`. Consumed recovery grants now retain audit
    request/sequence and replacement binding IDs; replay matches operator,
    unrevoked/unexpired consumption, old retirement, new activation/version,
    and side against those records. Fabricated audits, altered recovery evidence,
    changed issue sides, and malformed success records are covered. All 509
    workspace plus six harness tests and all 144 PostgreSQL tests pass with the
    complete local gate. Both browser suites pass in
    `test-results/mandatory-replay-audit` and
    `test-results/mandatory-replay-audit-fixtures`. Fresh independent local
    review found no actionable regressions and reran 132 server tests; its 12
    database skips are covered above. Exact-head CI remains before merge.
    An eighth hosted pass requires surrender's authoritative seat retirement,
    not only rejection of later commands from that seat. Replay now requires
    the surrender boundary at the next sequence and a finite revocation time;
    retired actor evidence and recovered old-binding activation must also be
    internally consistent. Regression cases reject an active surrendered seat,
    a delayed retirement, and recovery of a not-yet-active binding. All 510
    workspace plus six harness tests and all 145 PostgreSQL tests pass with the
    complete local gate. Both browser suites pass in
    `test-results/mandatory-replay-retirement` and
    `test-results/mandatory-replay-retirement-fixtures`. Fresh independent
    review found no actionable regressions and reran 133 server tests; its 12
    database skips are covered above. Exact-head CI remains a merge gate.
    PR #25 head `c7a2371` passed Application (`34081757381`) and Documentation
    (`34081757389`) CI, with fresh independent review and no unresolved threads.
    It merged into main as `c164721`. The authorized API and viewer remain
    separately reviewed increments; no phase or deployment closeout is implied.
- [ ] Register mandatory saves, then enable new games and live acceptance.
  - Scope: Resolve the exact mandatory-v4 / mandatory-board-v1 pair with an
    identity restore handler. Require the pinned full terrain/edge bundle,
    static unit values/schedules, objective values, and explicit activation,
    movement spending, and step state. Reject changed/missing data without
    mutation or legacy state repair. Canonical comparison accepts PostgreSQL
    JSON object reordering without silently changing content.
  - Boundary: New games still use terrain-v3. This adds a saved-state handler,
    not a migration, rollout, or full persisted-state integrity audit. Mutable
    combat results and objective ownership remain gameplay state. Full command
    coverage, deterministic replay, default activation, and live two-player
    mandatory acceptance remain separate work.
  - Validation: Twenty-one service cases cover exact restore, unavailable
    content, missing movement state, reordered JSON, paid continuation across
    restart, closed groups, idempotency, rejected-command immutability, and
    opposing-seat authorization. An isolated PostgreSQL case seeds a complete
    mandatory fixture, migrates/restarts, executes a paid stack move, and checks
    the saved state, action/version pair, snapshot, and retry identity. Frozen
    install, format, lint, typecheck, 480 default tests plus six harness tests,
    build, smoke, Markdown lint, and all 115 PostgreSQL tests pass. Two-session
    desktop/tablet and 24-turn regression pass
    (`test-results/mandatory-version-regression`); mandatory browser fixtures
    pass (`test-results/mandatory-version-fixtures`), including the parent PR's
    repaired held-drag capture. Fresh independent built-in review found no
    actionable regressions. PR #24 merged as `5ed70d0` after hosted Codex review
    and exact-head CI passed. No unresolved threads remained; CodeRabbit was
    limited and skipped under owner direction.
- [ ] Pin and activate the complete mandatory content/version pair.
  - Scope: Add an isolated initial-state constructor with all approved terrain,
    existing movement edges, unchanged Scenario Five units/schedules/objectives,
    empty continuous-movement activation, and explicit off-board road/rail
    crossings. A fixed content fingerprint protects the revision from silent
    edits. Record the inferred crossings and scheduled entry costs in
    `docs/references/TERRAIN_CONNECTIONS.md`; do not modify owner terrain rows.
  - Boundary: The new pair is `gettysburg-mandatory-v4` /
    `gettysburg-mandatory-board-v1`. This preparatory constructor does not
    register the pair or change server-created games; the separate saved-state
    handler above now supplies strict server bundle validation. New-game
    activation, replay integration, and live two-player mandatory acceptance
    remain separate work. Owner gameplay review of inferred
    road/rail border crossings remains required before release.
  - Validation: Nineteen cases cover complete content, immutable identity,
    isolated snapshots, unique boundary entries, every scheduled entry cost, and
    all nine explicit road/rail entry discounts. Frozen install, format, lint,
    typecheck, 459 default workspace tests plus six harness tests, build, smoke,
    Markdown lint, and all 93 isolated PostgreSQL tests pass. Two-session
    desktop/tablet and 24-turn regression pass
    (`test-results/mandatory-content-regression`); mandatory keyboard/touch
    browser fixtures also pass (`test-results/mandatory-content-fixtures`).
    Initial independent review and hosted Codex review found no actionable
    defects. Exact-head CI then timed out capturing a held drag before startup
    and container smoke could run. The harness now captures the page without
    locator auto-scroll/actionability while the pointer is held; route assertions
    and actual input release remain unchanged. The full local gate and repaired
    desktop/tablet browser fixtures pass; the held-drag image was visually
    inspected (`test-results/mandatory-content-capture-repair`). Fresh independent
    review found no actionable regression. PR #23 merged as `9365b34` after
    repaired-head Application/Documentation CI and hosted Codex review passed.
    No unresolved threads remained. CodeRabbit initially hit its limit and was
    skipped; its final Free-plan status completed without a comprehensive
    line-by-line review, so independent built-in review supplies that gate.
- [ ] Complete mandatory reinforcement/night guidance and live acceptance.
  - Scope: Select scheduled counters for single or joint entry; preview actual
    costs and nearest legal enemy-free alternatives, and explain friendly
    congestion without inventing substitute entries. Selection alone never
    commits a move. Pending requests disable controls; authoritative updates
    reset selection. Night guidance names counters with an affordable withdrawal
    and blocks ending movement until they withdraw; missing pinned data fails
    closed, while genuinely trapped counters can proceed to combat.
  - Boundary: Mandatory-v4 remains unavailable to new games. Complete pinned
    content/version activation and full two-player rules-enforced acceptance
    remain open. Existing rules retain their reinforcement controls.
  - Validation: Eight component cases and real desktop keyboard/tablet touch
    fixtures cover joint road entry, blocked alternatives, congestion, stale
    selection, pending requests, night withdrawal, trapped counters, unavailable
    data, and inactive seats. Rendered entry/night controls were inspected in
    `test-results/mandatory-turn-guidance`. Frozen install, format, lint,
    typecheck, 440 default workspace tests plus six harness tests, build, smoke,
    Markdown lint, and all 93 isolated PostgreSQL tests pass. Two-session
    desktop/tablet and 24-turn regression pass
    (`test-results/mandatory-turn-guidance-regression`). A formatting failure
    was corrected before rerunning the full gate. PR #22 merged as `326878d`
    after fresh independent built-in review, hosted Codex review, and exact-head
    CI passed. No unresolved threads remained; CodeRabbit was limited and skipped
    under owner direction.
- [ ] Complete mandatory advance controls and full-game acceptance.
  - Scope: Preview advance with the same pure reducer used by the server. Offer
    legal victorious groups and destinations, including a smaller infantry/general
    pair when artillery cannot enter wooded rough hills. Normal movement spending
    and closed activations do not restrict this free combat action. Declining is
    available even when no group can advance. Board clicks, drag previews, and
    drag release validate terrain, ownership, pending choices, and source capacity.
  - Boundary: Mandatory-v4 is still unavailable to new games. Reinforcement/night
    guidance, complete pinned content/version activation, and full two-player
    rules-enforced acceptance remain open; existing rules keep their controls.
  - Validation: Seven cases cover safe subsets, free movement/objectives,
    invalid previews, keyboard focus, confirmation, declining, disabled/opposing
    seats, and board clicks. Browser fixtures exercise desktop keyboard/mouse
    and tablet touch through the real schema/reducer, including leaving artillery
    behind, unchanged movement spending, and a blocked advance that can decline.
    The rendered tablet controls were inspected in
    `test-results/mandatory-advance-controls`. Frozen install, format, lint,
    typecheck, 432 default workspace tests plus six harness tests, build, smoke,
    Markdown lint, and all 93 isolated PostgreSQL tests pass. Two-session
    desktop/tablet and 24-turn regression pass
    (`test-results/mandatory-advance-controls-regression`). PR #21 merged as
    `1317e14` after fresh independent built-in review, hosted Codex review, and
    exact-head CI passed. No unresolved threads remained; CodeRabbit was limited
    and skipped under owner direction.
- [ ] Complete mandatory normal-movement group and exit controls.
  - Scope: Offer all legal subsets of a selected stack, retaining source capacity,
    printed budgets, general accompaniment, and active/closed move boundaries.
    Selecting a group never commits movement. An affordable edge exit requires
    a separate permanent-exit confirmation; a new server version or selection
    discards that confirmation, and pending requests disable controls.
  - Boundary: Mandatory-v4 remains disabled for new games. Entry/advance/night
    guidance, complete version/content activation, and two-player acceptance
    remain separate work. Existing rules keep their previous controls.
  - Validation: Seven focused cases cover legal subsets, activation, pair selection,
    confirmation/cancel, stale confirmation, disabled controls, and illegal exits.
    Desktop keyboard and tablet touch fixtures select a pair while an immobile
    counter stays behind, then exercise confirmed normal exit through the real
    schema and reducer. Rendered controls were inspected in
    `test-results/mandatory-movement-controls`. Frozen install, format, lint,
    typecheck, 425 default workspace tests plus six harness tests, build, smoke,
    Markdown lint, and all 93 isolated PostgreSQL tests pass. Two-session
    desktop/tablet and 24-turn regression also pass
    (`test-results/mandatory-movement-controls-review`). PR #20 merged as
    `84d23f6` after fresh independent built-in review, hosted Codex review, and
    exact-head CI passed. No unresolved threads remained; CodeRabbit was limited
    and skipped under owner direction. Independent review identified
    radio focus loss after selection: only the exit confirmation now remounts,
    while component and real-browser arrow-key tests verify preserved radio focus.
    Re-selecting a prior group cannot revive its discarded confirmation.
- [ ] Finish mandatory retreat browser controls and full-game acceptance.
  - Scope: Each original stack has legal next-step buttons, undo, a suggested
    route, and explicit confirmation. Friendly transit continues to the first
    empty hex; blocked edge exits are permanent and free. Terrain-trapped stacks
    can assign exactly one extra combat-counter loss under the owner's approved
    adaptation. Pending server requests disable choices; accepted state versions
    reset uncommitted routes. Board clicks/drags reject illegal mandatory paths.
  - Boundary: Board shortcuts support adjacent legal retreats and the suggested
    complete route; the step controls expose all other legal routes without
    typing coordinates. Existing rules retain their board controls. Mandatory-v4
    activation and full two-player rules-enforced acceptance remain open.
  - Validation: Eight component cases cover route confirmation, undo, trapped
    losses, edge exits, disabled requests, stale drafts, authority/missing data,
    and invalid board clicks. `pnpm browser:movement` now also covers retreat
    routes, extra loss, and permanent exit at desktop/tablet widths through the
    real schema and reducer. Evidence is under
    `test-results/mandatory-retreat-controls`; visual inspection caught and fixed
    a cramped inherited form grid, and the revised layout was inspected again.
    Frozen install, format, lint, typecheck, 418 default workspace tests plus six
    harness tests, build, smoke, Markdown lint, and all 93 isolated PostgreSQL
    tests pass. Two-session desktop/tablet and 24-turn full-game regression also
    pass (`test-results/mandatory-retreat-controls-review`). PR #19 merged as
    `ce95600` after fresh independent built-in review, hosted Codex review,
    and exact-head CI passed. CodeRabbit was limited and skipped under owner
    direction; no unresolved review threads remained.
- [ ] Complete mandatory movement browser previews and acceptance.
  - Scope: Click, keyboard, touch, and drag previews share the authoritative
    movement validator. Drag overshoot stops at an affordable legal endpoint;
    clicked destinations report their full cost or rejection. General bonuses
    and closed continuous moves use the same activation state as the reducer.
    Releasing a drag while the board is disabled cannot submit a command.
  - Boundary: Mandatory-v4 is still unavailable to new server games. The new
    `pnpm browser:movement` check exercises labelled local fixtures through the
    real command schema and reducer, not a live mandatory-rules server session.
    Final activation and two-player rules-enforced acceptance remain open.
  - Validation: Desktop mouse/keyboard and tablet touch fixtures cover half-point
    roads, weighted overshoot, unaffordable woods, closed moves, and general
    accompaniment. Rendered desktop/tablet evidence was visually inspected in
    `test-results/mandatory-movement-preview`. The fixture check also runs in
    Application CI. Frozen install, format, lint, typecheck, 410 default workspace
    tests plus six harness tests, build, smoke, Markdown lint, and all 93 isolated
    PostgreSQL server tests pass. Existing two-session desktop/tablet and 24-turn
    full-game regression also pass (`test-results/mandatory-movement-preview-review`).
    PR #18 merged as `e1af65e` after independent built-in review, repaired-head
    hosted Codex review, and exact-head CI passed. All four hosted findings were
    fixed and their threads resolved. CodeRabbit was skipped while limited;
    its final Free-plan check completed without substituting for independent
    built-in review.
  - Hosted review follow-up: Preserve an active pair when it stops with a
    stationary friendly counter; show weighted cost in the SVG overlay; exercise
    a genuine touch drag at tablet width; and clamp beyond-budget friendly full
    targets while retaining source-capacity and reachable-target errors.
    Added unit/browser regressions for these findings. The first overlay test
    used HTML-only `innerText` on SVG; switching to `textContent` fixes the harness
    without weakening its exact `1 / 1` assertion. All local gates and browser
    checks passed again after these fixes; fresh independent review and exact-head
    CI passed on the repaired head before merge.
- [ ] Complete mandatory night withdrawal and browser guidance.
  - Scope: End-of-movement enforcement searches affordable legal withdrawals
    using the same weighted movement calculator and validator as normal moves.
    It checks every legal group from a threatened stack, general bonuses, active
    move boundaries, source/destination capacity, friendly transit, artillery,
    streams, and edge exits. Missing pinned movement data fails closed.
  - Boundary: This changes only the still-unavailable mandatory-v4 ruleset;
    existing saved rules keep their prior behavior. Browser guidance, complete
    activation, and full rules-enforced acceptance remain open.
  - Acceptance: Ten focused cases cover real terrain costs, group withdrawal,
    friendly transit, capture, activation, edge cost, missing bundles, and bounded
    range equivalence with point-to-point routes over all 253 hexes. Frozen
    install, format, lint, typecheck, 399 default workspace tests plus six harness
    tests, build, smoke, Markdown lint, and all 93 isolated PostgreSQL server
    tests pass. Desktop/tablet and full-game regression pass with evidence in
    `test-results/mandatory-night-withdrawal`. PR #17 merged as `d527a8a` after
    independent built-in review, hosted Codex review, and exact-head CI passed.
    No unresolved review threads remained; CodeRabbit is skipped when limited.
- [ ] Complete mandatory combat inheritance and advance controls.
  - Scope: Mandatory-v4 uses the approved reduced combat factors and terrain
    calculation, including participating-attacker region cancellation, strongest
    defending hex, and the combined +10 cap. Advance remains free and can enter
    enemy ZOC, including at night, but artillery cannot enter wooded rough hills
    even along roads. Missing destination terrain or a non-adjacent target is
    rejected. A general must accompany a victorious combat attacker rather than
    advance alone; these two guards address hosted-review findings.
  - Boundary: The current terrain-v3 interpretation remains unchanged. Browser
    controls, remaining night rules, and the complete mandatory ruleset/content
    registry entry still precede activation for new games.
  - Acceptance: Reuse all 17 terrain/skirmish checks against both versions, test
    reduced factors in mandatory-v4, and add eleven advance cases for terrain,
    free movement, general support, ZOC, authorization, and legacy isolation.
    Frozen install, format, lint, typecheck, 389 default workspace tests plus six
    harness tests, build, smoke, Markdown lint, and all 93 isolated PostgreSQL
    server tests pass. Desktop/tablet and full-game regression pass with evidence
    in `test-results/mandatory-combat-and-advance-review`. PR #16 merged as
    `1840c5f` after fresh independent built-in review and exact-head CI passed.
    Both hosted Codex findings were fixed and their threads resolved. CodeRabbit
    was limited and skipped under the owner's instruction.
- [ ] Complete forced-retreat command and browser integration.
  - Scope: Authorize the pending seat and complete original stack; use the shared
    route validator for single/stack retreat commands. New mandatory-only
    `retreatOffBoard` and `acceptTrappedLoss` commands provide free permanent exit
    or exactly one extra combat-counter loss. General support loss, intermediate
    objective capture, remaining stack choices, and vacated-only advance offers
    are applied atomically. Room registration already derives from the protocol.
  - Boundary: Browser controls, artillery-safe advance, full night behavior, and
    mandatory ruleset/content activation remain separate tasks. Existing rulesets
    retain their previous retreat behavior and reject the new choices.
  - Acceptance: Twelve integration tests cover losses, exits, whole stacks,
    authority, remaining choices, capture, previews, objectives, snapshots, ZOC,
    terrain, and legacy isolation. Frozen install, format, lint, typecheck, 361
    default workspace tests plus six harness tests, build, smoke, Markdown lint,
    and all 93 isolated PostgreSQL server tests pass. Desktop/tablet and full-game
    regression pass (`test-results/forced-retreat-choices`). PR #15 merged as
    `dbb8400` after independent built-in review, hosted Codex review, and exact-head
    CI passed. CodeRabbit was limited and skipped; no unresolved threads remained.
- [ ] Complete mandatory retreat geometry, forced choices, and browser controls.
  - Scope: A shared pure calculator prefers viable non-enemy-ZOC steps, permits
    enemy ZOC only when necessary, continues through friendly stacks to the first
    empty hex or edge exit, and enforces artillery terrain restrictions. Complete
    route reachability prevents friendly dead ends and cycles from being mistaken
    for an escape. Invalid input or missing terrain never authorizes extra loss.
  - Boundary: This preparatory increment does not activate mandatory-v4 or change
    legacy retreat commands. Pending-choice authorization, whole-original-stack
    enforcement, extra-loss allocation, free exits, advance, and browser controls
    remain separate integration work. The calculator supplies deterministic
    complete suggestions, not exhaustive routes to every clicked destination.
  - Acceptance: Fifteen focused tests cover ZOC priority, terrain, friendly
    transit/dead ends/cycles, edge choices, empty endpoints, budgets, stacks,
    generals, invalid inputs, and deterministic suggestions at all 253 hexes.
    Independent review caught an open-edge shortcut: direct exits now require no
    viable on-board first step; exits through friendly chains remain available.
    Frozen install, format, lint, typecheck, 349 default workspace tests plus six
    harness tests, build, smoke, Markdown lint, and all 93 isolated PostgreSQL
    server tests pass. Desktop/tablet and full-game regression pass with evidence
    in `test-results/retreat-path-rules`. PR #14 merged as `476da4d` after fresh
    independent built-in review, hosted Codex review, and exact-head CI passed.
    CodeRabbit was limited and skipped; no unresolved review threads remained.
- [ ] Complete permanent board exit and its browser control.
  - Scope: An edge exit spends one normal movement point, obeys the active-group
    boundary and source capacity, and permanently removes counters from play.
    The separate `exited` status retains historical strength but cannot move,
    re-enter, or participate in combat. Manual 6a5 counts reduced units only while
    on the board, so exited counters score neither reduced nor eliminated losses.
  - Boundary: The command is rejected by older rulesets; mandatory-v4 remains
    unavailable for new games. Browser entry/exit controls and forced-retreat
    exits remain separate work.
  - Acceptance: Cover full/reduced scoring, snapshots, one-point cost, general
    allowance, activation, source capacity, capture, authority, night exits, and
    legacy isolation. Room handlers now derive from the protocol command map;
    a real WebSocket test verifies every name reaches authoritative validation.
    Night withdrawal recognizes affordable exits, including active stacks and
    general bonuses. These close two hosted-review findings; full terrain-aware
    on-board night withdrawal remains in its separate task.
    Frozen install, format, lint, typecheck, 334 default
    workspace tests plus six harness tests, build, smoke, Markdown lint, and
    all 93 isolated PostgreSQL server tests pass. Desktop/tablet and full-game
    regression pass after review fixes (`test-results/voluntary-board-exit-review`).
    PR #13 merged as `622c525` after fresh independent built-in review and
    exact-head CI passed; both hosted review threads are resolved. CodeRabbit
    was limited on the final head and skipped per owner direction.
- [ ] Complete mandatory reinforcement entry and browser controls.
  - Scope: Charge terrain or explicitly connected off-board-road entry costs;
    replace enemy-occupied/ZOC entries with nearest safe board-edge alternatives.
    Friendly congestion requires waiting, not an invented alternate entry.
    Joint entry lets a general accompany up to two combat counters from their
    first step; entry spends movement and changes the active move group.
  - Boundary: `enterReinforcementStack` is schema-validated but rejected by
    existing rulesets. Mandatory-v4 remains unavailable for new games. Browser
    controls and the explicit off-board-road content bundle remain to be wired.
  - Acceptance: Cover schedules, blocked-entry ties, friendly congestion, all
    edges blocked, road/terrain costs, artillery, accompaniment, atomicity,
    activation changes, protocol validation, capture previews, and legacy
    isolation. Frozen install, format, lint, typecheck, 321 default workspace
    tests plus six harness tests, build, smoke, Markdown lint, and all 92
    isolated PostgreSQL server tests pass. Desktop/tablet and full-game
    regression pass (`test-results/reinforcement-entry-rules`). PR #12 merged as
    `2be8453` after independent built-in review and exact-head CI passed.
    CodeRabbit was limited and skipped per owner direction; no unresolved
    review threads remained.
- [ ] Complete mandatory lone-general capture integration.
  - Scope: Eliminate unsupported generals in enemy combat ZOC; retain combat
    support and ignore general-only ZOC. Settle every normal-movement step and
    every accepted mandatory-rules command. A combat counter can capture on
    approach and enter the vacated hex; a lone general cannot keep moving after
    capture. General losses award no casualty points.
  - Boundary: This affects only the still-unavailable mandatory-v4 handler.
    Existing terrain-v3 commands retain their previous interpretation.
  - Acceptance: Cover support, both sides, intermediate capture, repeated-drag
    equivalence, source abandonment, capture on entry, and legacy isolation;
    frozen install, format, lint, typecheck, 307 default workspace tests plus
    six harness tests, build, smoke, Markdown lint, and all 92 isolated
    PostgreSQL server tests pass. Desktop/tablet and full-game regression pass
    (`test-results/lone-general-capture`). PR #11 merged as `b280cbf` after
    independent built-in review and exact-head CI passed. CodeRabbit was limited
    and skipped per owner direction; no unresolved threads remained.
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
    (`test-results/mandatory-movement-validator`). PR #10 merged as `5ad7cd5`
    after independent built-in review and exact-head CI passed. CodeRabbit was
    limited and skipped per owner direction; no unresolved threads remained.
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
    (`test-results/continuous-movement-policy`). PR #9 merged as `4940533` after
    independent built-in review and exact-head CI passed. CodeRabbit was limited
    and skipped per owner direction; no unresolved threads remained.
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
    pass (`test-results/movement-calculator`). PR #8 merged as `cb79dfa` after
    independent built-in review and exact-head CI passed. CodeRabbit was limited
    and skipped per owner direction; no unresolved threads remained. General
    accompaniment and server validation now have separate preparatory increments;
    browser integration and ruleset activation remain.
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

- [ ] Add browser host controls for spectator refresh and revocation.
  - Scope: Host-only metadata panel, current-status refresh before revocation,
    existing audited/idempotent host command flow, reload, safe stale-response
    handling, and visible retry errors. No bearer secret display. Link creation
    and the spectator screen remain separate increments.
  - Validation plan: Component regressions for invited/claimed commands, read
    failure/retry, already retired grants, and game changes. Real desktop/tablet
    browser checks create invitation/claim fixtures through the API, then use
    visible controls to refresh/reload/revoke both grant types, prove observer
    reads/replay are denied afterward, and preserve both player seats/state.
    This is not full spectator UI acceptance. Run complete local/database/browser
    gates, independent review, exact-head CI, and hosted thread checks. Owner:
    ChrisTitusTech. No deployment or migration.
  - Initial validation: Full local gate passed 582 workspace/nine harness
    tests; all 199 PostgreSQL tests passed. Independent review found no
    actionable regressions and reran 109 web tests. Browser acceptance failed
    in fixture read-back because the separate request context did not send the
    secure browser cookie over loopback HTTP. Read-back now uses fetch inside
    the authenticated browser, and an explicit pre-revocation 200 assertion
    prevents a false-positive denial check. Fresh gates and review are required.
  - Final local validation: Frozen install, format, lint, typecheck, 582
    workspace/nine harness tests, build, smoke, Markdown and whitespace pass.
    All 199 PostgreSQL tests pass for unchanged server code. Desktop/tablet host
    refresh/reload/revocation and authenticated pre/post-revocation checks pass;
    full games exercise all three choices, reload/exact replay, and input
    fixtures pass in `test-results/spectator-host-controls-cookie` and its
    `-fixtures` directory. Rendered tablet controls were inspected without
    clipping. Fresh independent review found no actionable regressions and
    reran all 109 web tests. Exact-head CI and hosted threads remain before merge.
  - Hosted review found that the spectator panel's local busy state allowed
    overlapping seat-invitation/deletion host operations and stale resume
    responses. All application host commands now share a serial operation queue
    through their post-command response application. Failures reject normally
    without blocking later requested operations. Focused delayed-response and
    failure-recovery regressions accompany this repair; full validation and
    fresh independent review are required before publishing and resolving it.
    Repair validation passes the full local gate (584 workspace/nine harness
    tests), with the prior 199 PostgreSQL checks covering unchanged server
    code. Desktop/tablet full games exercise all pending choices, reload/exact
    replay, host grant controls, and input fixtures in
    `test-results/spectator-host-serialization` and its `-fixtures` directory.
  - Exact-head Application `34098943030` failed at head `d334cca`: the existing
    nine-command PostgreSQL replay/restart test exceeded Vitest's five-second
    unit-test default on the shared runner. The other 198 database-enabled
    server tests and all 111 web tests passed; later build/browser/container
    steps did not run. Full-run inspection found only expected injected errors,
    isolated test-database trust/locale warnings, and action-runtime deprecations.
    This multi-transaction integration test now has a bounded 15-second budget;
    no runtime timeout or assertion is relaxed. Owner: ChrisTitusTech. Rerun
    local/database gates, independent review, and exact-head CI before merge.
    Repair validation passes the full local gate (584 workspace/nine harness
    tests) and all 199 PostgreSQL tests. Fresh independent review found no
    actionable defects; its database check was not rerun, covered by the
    isolated result above. Application code is unchanged, so the verified
    desktop/tablet evidence above remains applicable; exact-head CI must rerun
    the complete workflow before merge.
    Fresh independent review found no actionable regressions and reran 111 web
    tests. Publish the repair, resolve the hosted thread, and verify exact-head
    CI before merge; no release or deployment gate is waived.

- [x] Add the host-only spectator grant-list API.
  - Scope: One authorized snapshot read returns outstanding invitation IDs,
    invited/claimed status, and invitation expiry, without secrets or identities.
    Expired unclaimed and revoked grants disappear; claimed grants remain
    revocable beyond invitation expiry. Read-only; no session renewal.
  - Validation plan: Host/seat/observer/cross-game authorization, projection,
    expiry/revocation/deletion, unchanged snapshots, HTTP response shape, and
    PostgreSQL restart coverage. Run full local/database/browser gates, fresh
    independent review, exact-head CI, and hosted thread checks before merge.
    Host browser controls and spectator UI remain separate work. Owner:
    ChrisTitusTech. No migration or VPS change is part of this increment.
  - Validation: Frozen install, format, lint, typecheck, 578 workspace/nine
    harness tests, build, smoke, Markdown, and whitespace pass. All 199 isolated
    PostgreSQL tests pass. Desktop/tablet enforced games, pending-result reload,
    exact replay, and input fixtures pass in `test-results/spectator-grant-list`
    and its `-fixtures` directory; desktop exercised all three pending choices.
    Fresh independent review found no actionable defects and reran 183 server
    tests; its 16 PostgreSQL skips are covered above. Exact-head CI and hosted
    thread checks remain before merge. CodeRabbit is limit-skipped as authorized.
  - Closeout: PR #36 head `fedf0f0aa607a305396a66569d843b6db436c5da` passed
    Application `34096055329` and Documentation `34096055298`. A separate final
    query confirmed no review threads before merge into `faa8586` on 2026-09-07.

- [ ] Repair spectator authorization, session mirrors, and retry-cookie lifetime.
  - Scope: Three late PR #34 findings arrived after its separate merge check
    reported zero threads. Ordinary observer reads now require unique claimed
    invitation/binding/session links and an actual issuance event, not only a
    matching active session. Missing development claim metadata fails closed.
    Preserve observer-only PostgreSQL session rows and repair missing mirrors;
    bound all cookie-setting responses to authoritative remaining lifetime.
    Failed duplicate claims must not silently renew their browser session.
    Soft deletion removes the claim-to-session link while retaining hashes.
  - Validation plan: Corrupted/unbound/reassigned grant regressions, shared-role
    preservation, exact retry cookie lifetime, and PostgreSQL mirror retention,
    repair, and deletion. Run the full local/database/browser gate, fresh
    independent review, exact-head CI, and resolve all three hosted threads.
    Owner: ChrisTitusTech. Live transport remains isolated until this repair
    clears; no new VPS deployment or destructive migration is authorized here.
    Initial typecheck caught an optional issuance record dereference; an
    explicit missing-record guard fixes it. Targeted service/HTTP tests pass.
  - Validation: Frozen install, format, lint, typecheck, 576 workspace/nine
    harness tests, build, smoke, Markdown and whitespace pass. All 197 isolated
    PostgreSQL tests pass, including observer mirror retention/repair/deletion.
    Desktop/tablet enforced games, all pending choices, reload/exact replay,
    and input fixtures pass in `test-results/spectator-integrity` and its
    `-fixtures` directory. Fresh independent review found no actionable
    regressions and reran 181 server tests; its 16 database skips are covered
    above. Exact-head CI and hosted thread resolution remain before merge.
- [ ] Add private read-only spectator claims and revocable HTTP/replay access.
  - Scope: Separate observer bindings, exact UUID claim retries, secure cookies,
    public-only state/events, current-access replay checks, and audited host
    revocation. Preserve legitimate host/seat bindings in a shared browser;
    spectator bindings alone cannot authorize gameplay, host mutations, or raw
    recovery exports. Persist claims/bindings in canonical snapshots, retain
    invitation hashes through soft deletion, and remove observer bindings.
  - Boundary: No live room access or spectator UI yet. Immediate socket
    revocation, host grant-list controls, and three-session desktop/tablet
    acceptance follow in separate small increments. Owner: ChrisTitusTech.
  - Validation plan: Service/HTTP tests cover claim isolation, safe retries,
    expiry, revocation, deletion/restore, and corrupt claim/replay evidence.
    PostgreSQL close/reopen must preserve an exact claim retry and enforce
    revocation. Run the complete local/database/browser gates, independent
    review, and exact-head CI before merge. An initial focused run used stale
    compiled shared protocol files; rebuilding that package cleared its three
    rejection failures. Frozen install, format, lint, typecheck, 572 workspace
    tests/nine harness tests, build, smoke, Markdown and whitespace all pass.
    All 193 PostgreSQL server tests pass, including close/reopen claim retry and
    revoked reads/replay. Desktop/tablet enforced games, pending-result reload,
    exact replay, and input fixtures pass in `test-results/spectator-access`
    and its `-fixtures` directory; desktop covered all three pending choices.
    The existing replay presentation was visually inspected. Independent local
    review found no actionable regressions and reran 177 server tests; its 16
    database skips are covered above. Exact-head CI and hosted thread checks
    remain required before merge; no live spectator UI is claimed yet.
  - Late PR #33 follow-up: Its green-CI merge ran despite two new unresolved
    findings returned by the final thread query. This was a merge-gate failure,
    not a clean review closeout. PR #34 verifies claimed spectator records
    against unique bindings (including synthetic-claim regression coverage) and
    now rejects mismatched/duplicate invitation tuple identifiers on restore.
    Fresh full validation, independent review, exact-head CI, and explicit
    review-thread resolution are required before this corrective merge. Owner:
    ChrisTitusTech; no deployment occurred with the unresolved findings.
    Repair validation passes: complete local gate with 573 workspace/nine
    harness tests, all 194 PostgreSQL tests, and both desktop/tablet enforced
    games plus input fixtures in `test-results/spectator-restore-identifiers`
    and its `-fixtures` directory. Both games covered all three pending choices,
    reload, and exact replay. Fresh independent review found no actionable
    regressions and reran typecheck, 178 server tests, and whitespace; its 16
    database skips are covered above. New-head CI remains pending publication.
- [ ] Add audited host-managed spectator invitations.
  - Scope: Separate 24-hour spectator invitations from player invitations;
    cap outstanding grants at eight, preserve command-id retries with sealed
    secrets, and support host-only issue/revoke events without gameplay-version
    changes. Persist the optional collection in canonical PostgreSQL snapshots;
    revoke invitations and destroy secrets on soft deletion/external-ledger
    restore, retain hashes for 30 days, then remove them on hard purge. Verify
    issue/revoke evidence during mandatory replay.
  - Boundary: No spectator claim endpoint, binding, room access, or UI yet.
    Follow with read-only claiming/authorization, immediate revocation of live
    observers, replay access, then desktop/tablet controls and acceptance. Never
    route spectator credentials to player or host mutations. Owner: ChrisTitusTech.
  - Validation: Five focused cases pass for independent issuance, safe retries,
    expiry/capacity, command isolation, deletion/restore, and corrupt replay
    evidence. Add HTTP host-authorization and PostgreSQL restart regressions;
    run the complete local/database/browser gates, fresh independent review,
    and exact-head CI before merging this preparatory increment.
    The full local gate passes with 564 workspace/nine harness tests and all
    184 PostgreSQL server tests. HTTP issue/revoke is host-authorized; database
    close/reopen preserves invitation retries and interpreted replay. Both
    desktop/tablet full enforced games and input fixtures pass in
    `test-results/spectator-invitations` and its `-fixtures` directory; both
    games covered loss/advance, pending-result reload, and exact replay. Fresh
    independent review found no actionable regressions and reran typecheck and
    169 server tests; its 15 database skips are covered above. There is no new
    spectator UI to inspect in this increment; existing browser workflows passed.
  - Review follow-up: Two hosted findings required retaining hashed invitation
    evidence through soft deletion and rejecting orphan issue/revocation records
    during full replay. Added regressions for soft/hard deletion and external
    ledger restore, missing/out-of-range evidence, and legitimate historical
    prefixes. The earlier deletion assertion intentionally changes to the
    specified 30-day retention contract. Fresh full local validation passes with
    565 workspace/nine harness tests and all 185 PostgreSQL tests. Desktop and
    tablet full enforced games, reload/exact replay, and input fixtures pass in
    `test-results/spectator-evidence-retention` and its `-fixtures` directory;
    tablet covered all three pending choice types. Independent local review
    found no actionable regressions and reran 170 server tests/whitespace;
    its 15 database skips are covered above. Exact-head CI and thread resolution
    remain required before merge; Phase 4 remains open.
- [x] Consolidate ordinary resume into one authorized snapshot read.
  - Scope: Replace the response's four/five independent snapshot hydrations with
    one read for current host/seat access, public action events, host-only
    invitation metadata, and game state. Preserve the HTTP contract, immediate
    revocation/recovery, expiry, and deleted-game behavior. Copy public events
    without cloning historical resulting states; never cache access across
    requests. Readiness remains a separate read and persistence is unchanged.
  - Evidence: Initial server typecheck and 163 default server tests pass.
    Added role/privacy/isolation, recovery/revocation, expiry/deletion, HTTP
    single-service-read, and PostgreSQL single-query regressions. Full local,
    isolated database, desktop/tablet browser, fresh independent review, and
    exact-head CI gates follow before merge. Owner: ChrisTitusTech. Compare
    browser timing as a local observation only; VPS capacity remains unmeasured.
  - Validation: Frozen install, format, lint, typecheck, 558 workspace plus nine
    harness tests, build, smoke, Markdown/whitespace, and all 177 PostgreSQL
    tests pass. The database regression proves one canonical query for a resume
    response, excluding readiness. Both desktop/tablet enforced games, reload
    with pending dice, exact replay, and input fixtures pass in
    `test-results/atomic-resume-read` and `test-results/atomic-resume-read-fixtures`.
    Desktop covered all three combat choices; tablet loss/advance. Fresh
    independent review found no actionable regressions and reran typecheck and
    163 server tests; its 14 database skips are covered above. This is a read
    consolidation, not a query cache, schema migration, or VPS capacity result.
    PR #32 head `b6ad555` passed Application (`34087110035`, 9m46s) and
    Documentation (`34087109946`) and merged as `aba5694`, after independent
    review and with no unresolved threads. Readiness/persistence cost, actual
    VPS capacity, and the remaining Phase 4 features/gates stay open.
- [ ] Finish responsive interaction design using the owner-approved original
  board, counter symbols, and clearly marked reduced strength. Current original
  presentation has explicit release approval; supplied scans stay private.
- [ ] Complete accessibility, browser, performance, and security hardening.
- [ ] Add approved private spectators, replay, and opt-in browser push.
- [ ] Automate backups and exercise restore, migration, rollback, and reboot.
- [ ] Load-test the target VPS and document the supported capacity.
- [ ] Complete production-candidate review and 24-turn acceptance.

### Host spectator link creation

- [ ] Add visible host creation, copying, and hiding of private spectator links.
  - Scope: Reuse the serialized, idempotent host-command flow. Keep secrets in
    component memory and URL fragments only; never persist them in browser
    storage. Show a selectable URL when clipboard access is unavailable.
    Refresh clears claimed/revoked links; hiding is explicitly not revocation.
    Retain a successfully created link if only the metadata refresh fails.
    The separate observer screen/transport must pass before release advertising.
  - Validation plan: Unit tests cover creation/copy, failed-response retry keys,
    refresh failures, claimed-link clearing, hide, clipboard denial, and stale
    game responses. Desktop/tablet checks issue through visible host controls,
    verify private fragment URLs, and prove reload does not recover the secret.
    Run full local/database/browser gates, fresh independent review, exact-head
    CI, and final thread checks. Owner: ChrisTitusTech.
  - Initial validation: 114 web tests, typecheck, and lint pass. No game rules,
    terrain, source assets, deployment, or migration changes are included.
  - Validation: Full local gate passes 587 workspace/nine harness tests; the
    prior 199 PostgreSQL tests cover unchanged server code. Independent review
    found no actionable defects and reran 114 web tests. Desktop/tablet full
    games, pending-result reload, replay, host-issued fragment URLs, secret
    clearing on reload, revocations, and input fixtures pass in
    `test-results/spectator-link-create` and its `-fixtures` directory. Desktop
    covered retreat/loss; tablet loss/advance. Exact-head CI and final thread
    checks remain before merge. CodeRabbit is limit-skipped as authorized.

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
