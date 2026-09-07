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
- Phase 2 is complete. The 2026-09-07 development VPS rollout uses source
  `dc6b73baa8dbabf06cb78c70544eaf51cd4cdfdd` and immutable image
  `d82327daa7268779d61cc095f6faf957e44e05d35bb4b9a502435f0cc9842490`.
  This is not final public-release or Phase 3/4 acceptance.
  Public traffic is held in maintenance after repeated browser connection
  timeouts. Do not reopen it until a reviewed repair passes the failed checks.
  Failed-run environment: Codex engineering automation on ChrisTitusTech's
  Fedora Linux 44 x86_64 workstation, headless Chromium 151.0.7922.34,
  1440x900 desktop consent-fixture viewport. Neither physical-device acceptance
  nor the later two-layout checks completed. Protected diagnostic copies are in
  `/home/titus/.local/state/gettysburg/acceptance/20260907-rollout`.

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
The owner authorized the application rollout on 2026-09-07. That authorization
does not close separate disruptive exercises or final public-release approval.

- [x] Approve and execute the reviewed application rollout. Exact merge-commit
  Application, Documentation, and Firefox/WebKit CI passed. Trivy 0.74.0 found
  zero HIGH/CRITICAL findings across 18 Alpine and 361 Node packages in the exact
  deployed image, including unfixed advisories.
- [x] Verify an encrypted pre-deployment database/state/ledger backup, isolated
  restore, and off-host checksum/decryption checks. Backup `20260907T155353Z`
  preserved 26 deleted games and ledger watermark 26; no active games existed.
- [x] Verify the post-test recovery set and ledger acknowledgement. Encrypted
  backup `20260907T160346Z` passed isolated restore and off-host checks; final
  state is zero active/30 deleted games, with database and acknowledgement at 30.
- [ ] Verify actual VAPID key continuity and off-host recovery. Push remains
  disabled and no signing key was provisioned; absent-key backup checks are not
  evidence of real key recovery or provider delivery.
- [x] Verify public health/readiness and authenticated two-client HTTPS/WebSocket
  movement and saved-state resume against the deployed immutable image.
- [ ] Complete desktop/tablet public-site browser and full 24-turn checks.
  Two Chromium runs failed at the consent fixture's connected-session wait;
  the server logged a room-delivery timeout. Owner: engineering, with reproduction,
  reviewed repair, exact-head CI, and both-layout rerun required. See `TASKS.md`.
- [x] Verify both saved credentials and authoritative state after an application
  restart, then back up the resulting deletion receipt. Both credentials resumed
  identical state; the probe was normally deleted and included in the final backup.
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
