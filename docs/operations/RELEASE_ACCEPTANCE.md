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
- Phase 2 is complete. The latest 2026-10-06 development rollout uses merged
  `2990d8e` and immutable image
  `ef965b292886cb340701d8f41f996da018c1366d7aebb07296dcaffbfb82c5ea`.
  Per-game persistence is deployed; the owner-authorized backup-first purge
  removed 63 old development games. Public input observations improved from
  5.36-5.87 seconds to 248-260 ms, with reconnects around 0.9 seconds. These
  report-mode observations do not close calibrated performance or capacity gates.
  See `TASKS.md` and `VPS.md` for current rollout evidence and rollback boundaries.
- Historical evidence: the 2026-09-07 development VPS rollout used source
  `1baebbd2a31963bfdb3974b714914a29bd839957` and immutable image
  `459eeb0319dea71da0387fc7530937e61754006b7ed0be607e52d9c41759dbc7`.
  This is not final public-release or Phase 3/4 acceptance.
  The repair passed both retained-data VPS full games and exact-head CI.
  Public readiness/two-client smoke and the desktop full game pass. The public
  tablet full-game timing gate remained failed near turn 24. Owner gameplay
  testing is available, but this candidate is not release-accepted.
  PR #56 merged on 2026-10-06 after review and exact-head CI using the owner's
  explicit self-approval exception. The newer rollout above supersedes this
  historical candidate's deployment status without erasing failed-run evidence.
  Browser-run environment: Codex engineering automation on ChrisTitusTech's
  Fedora Linux 44 x86_64 workstation, headless Chromium 151.0.7922.34,
  1440x900 desktop keyboard and 1024x768 touch-tablet viewports. These do not
  establish physical-device acceptance. Protected repair diagnostics are in
  `/home/titus/.local/state/gettysburg/acceptance/20260907-repair`;
  the earlier failed rollout is retained in the sibling `20260907-rollout` folder.

## Start an owner acceptance game

1. Open [Gettysburg](https://gettysburg.christitus.com) and host as either side.
2. Open the private opposing-seat invitation in a separate browser/profile or
   private-browsing session, then claim the seat. Keep invitation links private.
3. Confirm both screens say connected. In the active-side session, move a counter
   and check the other screen. Reload both sessions and confirm the same saved
   state returns.
4. Work through the checks below against the physical board/rules. Record the
   source/image above, browser/OS/device, display coordinates, expected result,
   and actual result. Redact invitation links and credentials from screenshots.

## Owner gameplay acceptance

Responsible owner: ChrisTitusTech. The owner explicitly accepted the board and
rules on 2026-10-06. The checks below record that approval, not a newly observed
device session or a waiver of technical release gates.
Use `docs/references/MANDATORY_RULES.md`, `TERRAIN_ADJUSTMENTS.md`, and
`TERRAIN_CONNECTIONS.md` for the recorded interpretations and board coordinates.

- [x] Compare representative movement costs, road/stream crossings, reinforcement
  entries, stacking, zones of control, and mandatory night withdrawals with the
  physical rules and approved adaptations.
- [x] Confirm repeated drags keep the same unit/stack's normal move active until
  another unit/group successfully moves; rejected commands must not end it.
- [x] Compare hill, woods, combined terrain, town, and connected-terrain combats.
  Attackers in the defender's connected forest must cancel its woods component;
  hill and woods components cancel independently under the recorded rules.
- [x] Verify losses, retreat, advance, and the approved extra-loss/edge-exit
  treatment when terrain makes retreat impossible, including trapped artillery.
- [x] Verify reduced strength, turn/night sequence, objectives, and final victory
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
The owner authorized this application rollout and data purge on 2026-10-06.
This does not close separate disruptive exercises or final public-release approval.

- [x] Approve and execute the reviewed application rollout. Exact candidate-commit
  Application, Documentation, and Firefox/WebKit CI passed for PR #73 and the
  merge revision. The first post-merge WebKit run failed at spectator revocation;
  the unchanged rerun and local WebKit acceptance passed. Trivy 0.75.0 found
  zero HIGH/CRITICAL findings in the exact deployed image, including unfixed
  advisories. No branch protection or test threshold was relaxed.
- [x] Verify an encrypted pre-deployment database/state/ledger backup, isolated
  restore, and off-host checksum/decryption checks. Frozen pre-purge backup
  `20261007T032915Z` preserved all 63 games and ledger watermark 81; post-purge
  backup `20261007T033000Z` verified zero games and watermark 176. The old image,
  credentials, database volumes, and encrypted recovery copies remain retained.
- [x] Verify the repaired candidate's final post-test recovery set and ledger
  acknowledgement after browser/restart probe cleanup. Backup `20261007T034301Z`
  passed isolated restore and off-host checks. Final audit: zero active games,
  12 normally deleted acceptance games, four migrations, ledger/ack 188.
- [ ] Verify actual VAPID key continuity and off-host recovery. Push remains
  disabled and no signing key was provisioned; absent-key backup checks are not
  evidence of real key recovery or provider delivery.
- [x] Verify public health/readiness and authenticated two-client HTTPS/WebSocket
  movement and saved-state resume against the deployed immutable image.
- [x] Complete desktop/tablet public-site browser and full 24-turn checks.
  Chromium 153.0.8010.12 on the Fedora 44 workstation passes both public games
  at 1440x900 desktop and 1024x768 touch-tablet widths, including combat choices,
  pending-result reload, and exact replay. Both retain the eight-minute bound.
  Basic flows, spectator revocation, replay management, and automated
  accessibility checks pass; fit-board screenshots were inspected. Evidence:
  `test-results/performance-vps`. This supersedes the public tablet failure
  for this candidate, not the manual device or calibrated performance gates.
- [x] Verify both saved credentials and identical authoritative state after
  restarting the repaired application. Normal probe deletion is covered by
  the final backup above. Pre-restart backup `20261007T033729Z` passed isolated
  restore/off-host checks; this was not a host reboot.
- [ ] Exercise migration and compatible rollback on an isolated copy. Saved
  rollback files alone do not establish compatibility with newer game writes.
- [ ] Approve and exercise VPS reboot/recovery. A pending reboot marker was
  observed on 2026-09-07; this application rollout did not reboot the host.
- [ ] Measure concurrent-room capacity on the target VPS and publish only the
  demonstrated limit. Local zoom timings do not establish broadband loading,
  all board-interaction latency, Internet-excluded command latency, or VPS capacity.
- [ ] Run the strict 100 ms benchmark on calibrated supported desktop hardware;
  record hardware, OS/browser, workload, and numeric evidence. Shared-CI report
  mode retains misses as diagnostics and cannot close this release gate.
- [ ] Complete final candidate review, exact-head CI, full 24-turn acceptance,
  rights/privacy inspection, and explicit public-release approval. Close Phases
  3/4 only after their remaining exit criteria have evidence, not from this
  list alone.
