# Gettysburg project roadmap

## Phase 0: Project foundation

### Outcome

The source material, product direction, architecture, deployment target, risks,
and ordered implementation work are documented well enough to begin without
inventing missing game behavior.

### Current status

Complete. PR #1 established the planning foundation and passed its exact-head
documentation gate.

### Included work

- Inventory and checksum the supplied board, rules, and orders of battle.
- Record known mechanics and unresolved source requirements.
- Approve the browser-native architecture and self-hosted deployment model.
- Record the verified VPS baseline and operating boundaries.
- Establish repository instructions, specification, roadmap, and task ledger.

### Dependencies and risks

- The remote repository must have a base branch before the first pull request.
- Source scans may not be suitable for public distribution.
- The Battle Manual, complete counter faces, setup, and victory rules are absent.

### Exit criteria

- The planning documents and local-only source inventory are merged through PR
  #1; the ignored source files remain outside Git history.
- Missing requirements and the rights gate remain visible as blockers, not
  silently inferred decisions.
- Phase 1 has a bounded vertical-slice task and validation plan.

### Validation

- `git diff --check` passes.
- The minimal Documentation workflow passes against the exact PR head.
- Source filenames, sizes, page counts, image dimensions, and SHA-256 hashes are
  verified against the local files, and `git check-ignore` confirms every scan
  remains outside the commit.
- The VPS snapshot is refreshed through `ssh gettysburg`; credentials, keys,
  maintainer source IPs, session data, database dumps, and environment files are
  absent or redacted before review.
- Independent review and exact-head pull-request checks are clear before merge.

### Pause or rollback point

Documentation-only changes can be reverted as one merge. No application or
production service is changed by this phase.

## Phase 1: Multiplayer vertical slice

### Outcome

Two browsers can create or join one private room, take opposing seats, and move
two fixture counters on a calibrated board through a server-authoritative state
that survives reconnect.

### Current status

Implementation and validation are merged into `main`. Formal phase closure still
requires the project owner's recorded review of the interpretation and rights
ledger; no Phase 1 code or local-validation failure remains.

### Included work

- Create the pnpm workspace, React/Vite client, Node/Colyseus server, and shared
  game/content packages.
- Establish formatting, lint, type-check, unit/integration tests, build, and CI.
- Create an approved original or clean-room fixture board and calibrated
  A-U/1-11 hex overlay. Keep scan-derived calibration intermediates local and
  Git-ignored.
- Render two accessible fixture counters with selection, pan, zoom, and movement.
- Implement private room creation/join, invitation claim, hashed seat
  credentials, audited operator recovery, state versions, `moveUnit`, rejection
  messages, synchronization, and reconnect.
- Define protocol and persistence interfaces. Fixture/in-memory persistence is
  permitted only as a temporary, non-production Phase 1 exception for reconnect
  while the server process remains alive. It provides no restart durability;
  Phase 1 does not provision PostgreSQL. PostgreSQL-backed state and atomic
  commands are required in Phase 2.
- Add a local container development path plus production-shaped `/healthz`
  liveness and `/readyz` readiness endpoints. In Phase 1 in-memory mode,
  readiness checks only the configured application dependencies and must not
  claim restart durability or require a database.

### Dependencies and risks

- Fixture data must be clearly separated from final source-derived content.
- Board calibration needs manual visual verification at multiple zoom levels.
- Reconnect identity must not allow seat theft.

### Exit criteria

- Two independent browser contexts see the same accepted moves in order.
- The wrong seat, an invalid hex, a stale version, and a duplicate command have
  automated tests and cannot corrupt state.
- A disconnected seat reconnects to its authoritative position and action log.
- Repository setup and every documented repository check work from a clean
  clone. Owner-local source checks are separately labelled and are not CI gates.

### Validation

- Run format, lint, type-check, unit/integration tests, and production build.
- Exercise two-browser create/join/move/reject/reconnect flows.
- Inspect desktop and tablet board rendering and retain screenshots.
- Run the service locally through the production-shaped container entry point.

### Pause or rollback point

Keep the slice isolated from production traffic. If the room or protocol model
fails review, revise it before adding complete game data.

## Phase 2: Digital-tabletop MVP

### Outcome

Two players can play the complete approved scenario as a rules-light digital
tabletop with all counters, turns, reinforcements, server dice, saved state, and
an auditable action log.

### Current status

Implementation, the human acceptance game, and the PR #3 battle/review cleanup
are merged. PR #4's terrain and operational repairs merged and deployed on
2026-09-06 as `40cff572aab183660dfeee188c4b6acddb2b1de5`. Independent review,
PR-head/post-merge CI, encrypted backup/restore, public health/readiness,
desktop/tablet two-client workflows, and application restart/resume passed.
Phase 2 operational closeout is complete. `TASKS.md` records the evidence and
the separate Phase 3/public-release gates.

### Included work

- Encode the complete approved map geometry, units, counter steps, setup, and
  reinforcement schedule as typed content with provenance. Keep painted terrain
  presentation-only until the per-hex terrain and edge transcription is reviewed
  for Phase 3.
- Add full/reduced/eliminated counter state and required general stacking support.
- Implement all phase transitions across 24 turns and identify night turns.
- Add automatic server dice and unit-factor combat results, confirmation,
  losses, retreat, advance, objectives, and completion state.
- Add PostgreSQL schema, migrations, snapshots, ordered actions, and resume.
- Add invite lifecycle and the operator-recovery contract from `SPEC.md`:
  authenticated local action, old-binding revocation, a single-use recovery
  grant, audit logging, preservation of unrelated bindings, and no gameplay-state
  change. Add the private VPS staging deploy.

### Dependencies and risks

- Uses owner-approved derived reduced values: halve each full combat factor and
  round up, with combat-one counters eliminated on their first loss. Reduced
  face artwork, per-hex terrain modifiers, and optional-rule decisions remain
  outside the Phase 2 rules-light fidelity claim and are Phase 3/publication
  inputs.
- Database migration and backup procedures must be ready before durable staging.
- Supplied art remains private unless the rights decision allows its use.

### Exit criteria

- Every approved coordinate and unit is represented with validation against the
  content source.
- Two players can complete a saved game without editing server data.
- Restart and reconnect recover the authoritative match and pending choice.
- Every accepted command, resulting state, and action record is durable across a
  server restart; no Phase 1 in-memory exception remains.
- The resulting state, state version, action record, and any die outcome commit
  atomically. Recovery cannot expose a state/log mismatch or replay-sequence gap.
- Games, snapshots, and actions retain immutable ruleset/content revisions and a
  gap-free per-game action sequence for deterministic resume and replay.
- Action history accounts for every accepted state transition and die roll.
- The private staging deployment is healthy through the public domain.

### Validation

- Content-schema tests cover uniqueness, coordinates, reinforcement references,
  and strength states.
- Integration tests cover persistence failures, restart recovery, and migrations.
- Complete a two-player smoke scenario, then a full manual 24-turn acceptance run.
- Back up and restore a staging match and verify state/action hashes.

### Pause or rollback point

Deploy behind private access. Retain the previous image and pre-migration backup.
Do not begin full automated enforcement until the digital-tabletop flow is usable.

## Phase 3: Rules-assisted game

### Outcome

The server guides and enforces the approved movement, stacking, combat,
reinforcement, night, objective, and victory rules without blocking recovery
from a connection or persistence failure.

### Current status

Terrain-defense work started on 2026-09-06 with approved A-W data and authorized
best-guess connections. This does not complete Phase 3. Phase 2 pulled forward
several movement, stacking,
combat, and core night rules. Phase 2 operational closeout and owner per-hex
approval are complete; terrain gameplay acceptance, movement rules, and
optional-rule decisions remain open. The
coordinate-by-coordinate review worksheet is in
`docs/references/TERRAIN_ADJUSTMENTS.md`; all rows are now approved and transcribed.
Forest/hill links feed combat; road/rail/stream estimates await movement rules.
TASKS.md records validation, review, and remaining owner acceptance.

### Included work

- Extend the Phase 2 one-point-per-hex movement budget with path cost, roads,
  terrain, streams, zones of control, generals, and stacking validation.
- Extend adjacent contact discovery, same-hex grouping, and capped unit-factor
  results with complete rule-derived ZOC behavior, authoritative terrain
  modifiers, retreat priority, forced off-board retreat, and any remaining
  advance legality. Phase 2 already enforces defender-wins-ties, loss thresholds,
  loss allocation, connected retreat, and eligible advance.
- Complete any remaining reinforcement restrictions, nighttime reorganization,
  and source-approved objective and victory edge cases. Phase 2 already enforces
  scheduled entry, objective control, casualty scoring, automatic-victory checks,
  and the turn-24 result.
  - Core night withdrawal, prohibition on entering enemy ZOC, and combat for
    trapped units only were pulled forward as a Phase 2 correctness fix.
    Remaining work includes nighttime reorganization and complete advanced ZOC
    interactions.
- Add rules explanations, previews, warnings, and deterministic replay tests.
- Add explicit rule-version metadata so existing games remain interpretable.

### Dependencies and risks

- Every enforced behavior needs an approved source interpretation and edge cases.
- Enforcement must not create deadlocked games; operator recovery needs auditing.
- Rule-version migrations may make old in-progress games incompatible.

### Exit criteria

- Approved rule examples and boundary cases have table-driven tests.
- Illegal commands are rejected with actionable, player-visible reasons.
- A deterministic replay produces the stored resulting state and die history.
- Two players complete a full enforced game with no manual database intervention.

### Validation

- Property and table-driven rule tests cover movement and combat boundaries.
- Integration tests cover every command and pending-choice transition.
- Compare representative turns against manual tabletop adjudication.
- Complete full desktop and tablet acceptance games in supported browsers.

### Pause or rollback point

Rule enforcement is versioned and feature-gated during rollout. Existing games
remain on their starting rules version or are explicitly declared incompatible.

## Phase 4: Production release

### Outcome

The game has an original, polished, rights-safe presentation and an operated
production service with measured capacity, accessibility, recovery, and release
controls.

### Current status

Not started as a production-release phase. Existing staging, backup, restore,
original-board, and browser evidence are inputs to this phase, not substitutes
for its rights, accessibility, security, capacity, reboot, and final acceptance
gates.

### Included work

- Replace any prototype-only source art with approved or original production art.
- Complete responsive polish, animations, combat panels, reduced motion,
  keyboard support, and screen-reader-friendly inspectors.
- Add spectator/replay capability and asynchronous invitations/notifications if
  the unresolved product decision includes them.
- Add rate limits, security headers, abuse controls, structured operations
  metrics, backup automation, restore exercises, and retention policy.
- Load-test the target VPS, document capacity, and finalize deploy/rollback runbooks.

### Dependencies and risks

- Public launch is blocked on the rights decision.
- External notification services, if selected, add privacy and operational scope.
- Single-host capacity and recovery objectives must be measured, not assumed.

### Exit criteria

- All production acceptance criteria in `SPEC.md` pass.
- The released presentation has a documented rights basis.
- Accessibility and supported-browser audits have no release-blocking findings.
- Backup/restore, migration, rollback, monitoring, and incident steps are tested.
- Load tests establish a published safe room limit on the target VPS.
- Exact-head CI, security checks, independent review, and manual acceptance are
  complete before release deployment.

### Validation

- Run the complete repository gate, dependency/container scanning, and CI.
- Run automated accessibility and performance audits plus manual keyboard,
  screen-reader, reduced-motion, desktop, and tablet checks.
- Exercise deploy, health failure, rollback, backup, restore, and VPS reboot.
- Run a two-player 24-turn production candidate game.

### Pause or rollback point

Use a maintenance gate, the reviewed image digest, the previous compatible image
digest, and a verified pre-migration backup. Stop or roll back when readiness,
data integrity, or health validation fails.
