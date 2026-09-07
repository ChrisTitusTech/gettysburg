# First-release acceptance worksheet

Use this worksheet for the remaining human and target-VPS checks. It does not
replace the requirements in `SPEC.md`, the phase exits in `ROADMAP.md`, or the
dated engineering evidence in `TASKS.md`. An unchecked item is not accepted.

## Candidate and approved scope

Record the reviewed source commit, immutable image ID, date, tester, browser/OS,
device, result, and sanitized evidence location with each acceptance run.
Never attach credentials, invitation links, push endpoints, keys, or supplied
scans to public evidence. A failed check needs a reproduction and follow-up.

- Scenario Five, mandatory rules only; no additional scenarios or optional rules.
- Mandatory-game replay, private spectators, and opt-in browser push are included.
- Original generated board, original symbols, and clearly marked derived reduced
  strength are approved. Supplied scans remain private.
- All 253 terrain hexes are owner-verified; B2/F11 are woods. Connections are
  approved best guesses, not a request to repeat or overwrite the terrain audit.
- Phase 2 is complete. The last verified VPS source remains
  `40cff572aab183660dfeee188c4b6acddb2b1de5`; newer local/CI results are not a rollout.

## Owner gameplay acceptance

Responsible owner: ChrisTitusTech. Engineering has automated complete 24-turn
games, but that does not establish agreement with the physical rules.
Use `docs/references/MANDATORY_RULES.md`, `TERRAIN_ADJUSTMENTS.md`, and
`TERRAIN_CONNECTIONS.md` for the recorded interpretations and board coordinates.

- [ ] Compare representative movement costs, road/stream crossings, reinforcement
  entries, stacking, zones of control, and mandatory night withdrawals with the
  physical rules and approved adaptations.
- [ ] Confirm repeated drags keep the same unit/stack's normal move active until
  another unit/group successfully moves; rejected commands must not end it.
- [ ] Compare hill, woods, combined terrain, town, and connected-terrain combats.
  Attackers in the defender's connected forest must cancel its woods component;
  hill and woods components cancel independently under the recorded rules.
- [ ] Verify losses, retreat, advance, and the approved extra-loss/edge-exit
  treatment when terrain makes retreat impossible, including trapped artillery.
- [ ] Verify reduced strength, turn/night sequence, objectives, and final victory
  against the approved Scenario Five interpretation in a complete candidate game.
- [ ] Decide whether interpreted replay of retired legacy tabletop games is
  required for this release or explicitly deferred. Existing saves retain their
  original rules; this decision does not authorize deleting or reinterpreting them.

## Device and accessibility acceptance

Responsible owner: ChrisTitusTech, with engineering repairing reported failures.
Desktop/tablet automation covers Chromium, Firefox, and Playwright WebKit.
WebKit automation is not actual Safari/iPad acceptance. Automated WCAG checks
leave contrast over the image/SVG board for manual inspection.

- [ ] On current supported desktop browsers and an actual Safari/iPad device,
  verify join/resume, selection, pan/zoom, movement, combat choices, replay,
  spectator access/revocation, and readable layouts at supported widths.
- [ ] Verify keyboard-only focus order, visible focus, dialogs, logs, and board
  inspector; use a screen reader to verify meaningful labels and announcements.
- [ ] Verify control/text contrast and reduced-motion behavior, including states
  that the automated contrast audit could not determine.
- [ ] Verify actual Home Screen installation and launch/resume on iPad.
- [ ] With explicitly opted-in test players, verify real provider delivery,
  permission denial, opt-out, click navigation, and behavior after seat surrender,
  revocation, or game completion. Synthetic consent tests are not delivery proof.

## Controlled VPS and release acceptance

Responsible owner: ChrisTitusTech approves the maintenance window and release;
engineering executes and records the reviewed procedures in `VPS.md`.
These operations remain pending approval; this worksheet is not authorization.

- [ ] Approve the candidate and maintenance window before rollout or disruptive
  backup/restore, rollback, restart/reboot, and capacity exercises.
- [ ] Verify the candidate's encrypted database/state/VAPID recovery set and
  off-host restore, including deletion-ledger reconciliation and key continuity.
- [ ] Exercise migration and compatible rollback on a copy, then verify public
  health/readiness, authenticated WebSocket play, persistence, application restart,
  and VPS reboot against the deployed immutable image.
- [ ] Measure concurrent-room capacity on the target VPS and publish only the
  demonstrated limit. Local zoom timings do not establish broadband loading,
  all board-interaction latency, Internet-excluded command latency, or VPS capacity.
- [ ] Complete final candidate review, exact-head CI, full 24-turn acceptance,
  rights/privacy inspection, and explicit public-release approval. Close Phases
  3/4 only after their remaining exit criteria have evidence, not from this
  list alone.
