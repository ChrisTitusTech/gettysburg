# Gettysburg project specification

## Problem

The supplied hex-grid game exists as a board image, two rules pages, and two
orders of battle. Playing remotely currently requires a physical setup or an
older generic virtual-tabletop experience. The project will provide a modern,
purpose-built browser representation with authoritative multiplayer and durable
saved games on infrastructure controlled by the project owner.

## Users

- A host creates a private game and shares a join code or link.
- Two players occupy the Confederate and Union seats.
- A returning player resumes the correct seat by presenting the seat credential
  cookie or completing the audited operator-recovery flow.
- A spectator may observe only after spectator mode is implemented and enabled
  for that game.
- An operator deploys, backs up, restores, and diagnoses the service through the
  dedicated `gettysburg` account on the VPS.

The primary interaction target is a current desktop browser. Tablet landscape
is required before production release. Phone play is a later optimization and
must not be claimed until the full board workflow is manually validated.

## Current implementation boundary

First-release scope was confirmed on 2026-09-06: Scenario Five, mandatory rules
only, plus replay, private spectators, and opt-in browser push notifications.
The owner approved the original generated board, original counter symbols, and
clearly marked reduced strength for public release; supplied scans stay private.
`docs/references/MANDATORY_RULES.md` records the remaining rules contract.

The 2026-09-06 development terrain follow-up supersedes the older terrain
exclusion below: the active board is A-W / 1-11 (253 hexes), matching the painted
columns. All terrain rows are owner-approved. Explicit best-guess forest and
hill links drive combat; road/rail/stream links are transcribed but variable
movement costs remain future work. See `docs/references/TERRAIN_ADJUSTMENTS.md`
and `docs/references/TERRAIN_CONNECTIONS.md` for exact rules and assumptions.
The owner confirmed this is not live/production and old development games need
not remain compatible. The owner subsequently authorized retirement of five old
development games after encrypted backup verification. Normal audited deletion
retired those games; the database was preserved.

The last verified VPS deployment implements the Phase 2 Scenario Five
rules-light digital tabletop, durable PostgreSQL state, recovery, and staging.
That evidence does not claim complete Phase 3 rule enforcement or Phase 4
production readiness. Phase 2 operational closeout completed on 2026-09-06:
PR #4 passed independent review and exact-head CI, merged with passing post-merge
CI, and deployed as `40cff572aab183660dfeee188c4b6acddb2b1de5`. Public readiness,
encrypted backup/restore, desktop/tablet two-client workflows, and application
restart/resume passed.
`TASKS.md` owns the live status so temporary operational facts do not weaken the
requirements below.

## Source game facts

The implementation must preserve these facts visible in the supplied material:

- The board is an irregular hex map labelled by columns A through U and rows 1
  through 11, with a 24-turn track.
- Terrain includes clear, hill, rough hill, woods, town, road, railroad, stream,
  named features, and objectives.
- A turn has a Confederate move/combat sequence followed by a Union move/combat
  sequence. Completing the Union sequence advances the turn.
- Turns 8, 16, and 24 are night turns.
- During a night turn, units in an enemy zone of control must withdraw when a
  legal withdrawal is available, no unit may move or enter as a reinforcement
  into an enemy zone of control, and combat occurs only for active-side combat
  units that cannot withdraw.
- Movement is affected by roads, woods, rough hills, streams, enemy zones of
  control, and generals as described in the source rules.
- Normal stacking is one combat unit, or two combat units when a general is
  present, subject to final interpretation of the complete rules.
- Combat groups adjacent attackers and defenders under the documented
  adjacency restrictions.
- Each side rolls a ten-sided die; a displayed zero counts as ten. Strength and
  terrain modifiers are applied with a maximum modifier of +10.
- Ties favor the defender. A margin of 3 through 5 causes one loss and a margin
  of 6 or more causes two losses, followed by required loss allocation, retreat,
  and eligible advance.
- Reinforcements enter on scheduled turns and hexes listed by the orders of
  battle.

The supplied rules and orders of battle remain the authority for rule mechanics,
unit data, and scenario data where this summary is incomplete. The owner-approved
tracked project board is the visual authority for which terrain is painted in a
hex and whether painted terrain continues across a hex side. Owner-reviewed typed
content becomes the runtime authority after that visual terrain is transcribed.
Ambiguity must be recorded; the owner explicitly authorized best-guess forest
connections for the development terrain pass. See
`docs/references/SOURCE_ASSETS.md`.

## Required behavior

### Game lifecycle

- A host can create a private game and receive a non-guessable invitation. A
  join URL's request-visible path and query contain only its non-secret lookup ID.
  The bearer secret may temporarily appear only in the URL fragment, which is not
  sent in the HTTP request, or be entered as a code. The first-party-only
  redemption page copies the fragment value into memory and synchronously removes
  the fragment with `replaceState` before posting it once in an HTTPS request
  body. The page loads no third-party scripts and sends
  `Referrer-Policy: no-referrer`; secrets never enter request paths, query
  strings, referrers, or access logs.
- Game creation requires the host to choose an open Union or Confederate side.
  In one transaction it creates or reuses the caller's `BrowserSession`, stores
  its credential verifier, persists a separate `HostBinding` with
  `binding_version = 1`, and creates the host's initial `SeatBinding` for that
  side. The successful HTTPS response sets the secure session cookie and returns
  an invitation restricted to the opposing open seat. Only the durable
  HostBinding authorizes host actions such as issuing invitations and
  `deleteGame`; connection order, seat side, and connection state never confer
  host authority. Seat invitations claim only `SeatBinding` records and cannot
  create host authority. Seat surrender does not revoke a HostBinding.
  Lost host credentials require an audited local-operator recovery that rotates
  only that game's HostBinding and atomically increments its persisted positive
  `binding_version`, while preserving every SeatBinding and any host authority in
  other games. Revocation tombstones retain the binding ID/version required for
  terminal retry proof. Tests cover restart, reconnect, seat surrender, seat
  claims, first-time host creation without an existing session, atomic initial
  host-seat creation, host recovery, version rotation, and rejection of non-host
  delete/invitation attempts.
- The invitation permits a one-time claim of an open seat; it does not prove
  ownership of a seat after that claim.
- A second player can claim the open seat and both clients see the same state.
- A successful claim creates or reuses a random browser-session credential. The
  server stores only its hash, sends it in a secure cookie, and binds that session
  to the claimed game/seat. One session can hold bindings for multiple games.
- Seat ownership cannot be taken over by another connection without an explicit
  game action or operator recovery.
- A disconnected player can reconnect and receive a current snapshot plus any
  required pending choice by presenting the bound session credential. A browser
  restart preserves this cookie only through its valid `Max-Age`/`Expires` and
  follows the same reconnect flow.
- A copied or replayed invitation cannot reconnect to or take a claimed seat.
- Losing the seat cookie is not self-service recoverable. For seat-credential
  recovery, an authenticated local operator command must revoke the old
  SeatBinding, issue a single-use recovery credential out of band, and append an
  operator action to the game log.
- A SeatBinding is revoked on seat-credential recovery, explicit seat surrender,
  or game deletion. Seat recovery binds only that seat to the new browser session
  without invalidating unrelated seat or host bindings and never changes gameplay
  state. Host recovery is the separate HostBinding-only rotation defined above.
- Beginning in Phase 2, game state and action history survive server and browser
  restarts. Phase 1 guarantees browser restart and live-process reconnect only;
  a server-process restart intentionally loses its fixture game.
- A game can be paused between commands without a connection remaining open.

Invitation, `RecoveryGrant`, and `BrowserSession` bearer credentials are each
generated independently with a CSPRNG from exactly 32 random bytes and encoded as
43-character unpadded base64url. Decoders require that canonical encoding and
decode to exactly 32 bytes. Persistent credential verifiers are domain-separated
HMAC-SHA-256 values using a server-held pepper outside the database; raw bearer
values are never persisted or logged.

### Board and pieces

- The board supports pan, zoom, hex selection, legible coordinate labels, and a
  visible selected-unit state.
- A calibrated data overlay maps each playable coordinate to the approved
  tracked project board.
- Counters expose side, identity, strength state, movement allowance, location,
  and relevant status without relying on color alone.
- Invalid drops return the counter to its authoritative location and explain
  the rejection.
- The turn and phase, active side, pending action, and action log remain visible
  without obscuring the board.

### Turn and command handling

- The server owns the turn, phase, legal actor, random rolls, and state version.
- Clients request typed commands and never directly overwrite shared state.
- Accepted commands are atomic, versioned, persisted, and broadcast in order.
- Every Action persists an immutable authorizing reference with binding type, ID,
  and version: gameplay uses the acting `SeatBinding`, host management uses its
  `HostBinding`, and operator audit uses the authenticated local-operator identity
  revision. This reference is historical evidence, not transferable authority.
- Duplicate command identifiers are idempotent. Stale commands receive the
  current version and a recoverable error.
- `command_id` is client-generated and unique per game in the configured
  persistence adapter. PostgreSQL enforces this beginning in Phase 2. The state
  mutation, action row, and serialized command result commit in one transaction.
  The action also stores a hash of the canonical object containing exactly
  `schema`, `command_name`, and `payload`, using the UTF-8, no-BOM JCS bytes
  defined below. Before any duplicate lookup can return a serialized result, the
  caller must still be authorized through the Action's persisted binding type,
  ID, and version; a matching session/game/actor alone is insufficient. An
  authorized identical duplicate returns the stored result without reapplying the
  command. A revoked, version-mismatched, or unauthorized caller receives an
  authorization error and no stored result; authorized reuse of the ID with a
  different canonical hash is rejected. The only exception is an
  identical retry of the terminal `surrenderSeat`, or a `deleteGame` retry during
  its soft-deletion window, that performed the revocation: the same still-valid
  BrowserSession credential may
  prove the original binding ID and version against its non-authorizing tombstone
  and receive only that command's stored result. This proof cannot authorize any
  other command, restore a binding, or reveal a result to a different session.
- Canonicalization version `gettysburg-command/v1` first validates and normalizes
  the typed payload, then constructs an object containing exactly `schema`,
  `command_name`, and `payload`. The hash input is the UTF-8, no-BOM byte sequence
  of that object's RFC 8785 JSON Canonicalization Scheme representation. JCS
  determines object-key ordering, JSON string escaping, Unicode handling, and
  finite IEEE 754 number representation; non-finite numbers and lone surrogates
  are rejected. Binary fields, if a future command defines one, are unpadded
  base64url strings. Optional fields without defaults stay absent; fields with a
  defined server default are materialized during normalization before hashing.
  The action stores the
  lowercase 64-character hexadecimal SHA-256 digest as `canonical_request_hash`
  and stores the canonicalization version. Any future canonicalization change
  requires a new version identifier, so logical retries under one version produce
  identical bytes and hashes.
- The fixed version-1 test vector has canonical bytes
  `{"command_name":"moveUnit","payload":{"destination":"A1","unit_id":"u1"},"schema":"gettysburg-command/v1"}`
  with no trailing newline and SHA-256
  `dd5d6dabdba0e9a402f023eb97068bf1785d9ad62e7613d7035fb73d17ca9368`.
  Tests assert both the exact byte sequence and digest, plus reordered-input,
  authorized duplicate, revoked-seat duplicate, and default-normalization cases.
  Omitting a defaulted field and explicitly supplying its default must produce
  identical canonical bytes and a hash; omitting a non-defaulted optional field
  keeps it absent.
- Unauthorized commands, malformed payloads, and commands for the wrong phase
  are rejected without partial mutation.
- Random combat rolls use a server-side cryptographically secure source and are
  recorded in the action log.

### Seat lifecycle command contract

`surrenderSeat` uses the common command envelope and may be issued only by the
currently bound session for that seat. It is serialized after any accepted
command and rejected with `pending_choice` while that seat owns an unresolved
combat choice. Acceptance revokes only that game/seat binding, records a gameplay
Action that also serves as its audit entry, and marks the seat open; it never
creates a second Action row. That row stores the client `command_id`, the next
sequence, and `resulting_version = expected_version + 1`. Replay applies its
seat-open state but never reactivates the revoked credential. The binding
revocation, open-seat state, revocation of every unclaimed invitation previously
issued for that game/seat, serialized result, and single Action row commit in one
transaction. A host or local operator must issue a new one-time invitation after
surrender before another session can claim the seat. The old binding and every
pre-surrender invitation remain unusable. An identical `command_id` retry from
the original still-valid
BrowserSession uses only the revoked binding's ID/version tombstone to return the
stored surrender result under the narrow rule above; it restores no authority.
Unrelated bindings held by the same browser session are preserved. Integration
tests cover surrender, one-row sequencing, replay, old-binding reconnect
rejection, an unused pre-surrender invitation, a valid post-surrender invitation,
tombstone-proved idempotent retry, cross-session retry rejection, pending-choice
rejection, and unrelated bindings.

### Gameplay, management, and audit ordering

All action kinds share the gap-free per-game `Action.sequence` event log, while
`Game.version` tracks gameplay state only. Every broadcast carries distinct
`event_sequence`, `state_version`, and `kind` fields; snapshots carry both the
latest event sequence and state version. Clients detect delivery gaps only with
`event_sequence`. They require the next state version only for gameplay events;
they accept redacted management/audit events with a repeated state version and do
not apply them to gameplay state.

A gameplay action has a client `command_id`, changes game state, and sets
`resulting_version = expected_version + 1`. An operator audit action has no client
command ID, uses a unique server-generated
`operator_request_id`, and records `expected_version = resulting_version` without
changing gameplay state. For an operator audit action only, both version fields
are non-null and satisfy
`expected_version = resulting_version = Game.version` at commit. For a gameplay
action, `expected_version` is the pre-command game version and
`resulting_version = expected_version + 1`; the committed game version becomes
that result. Thus sequence increments for every action, while `Game.version`
equals the result of the latest gameplay action and may repeat across intervening
management/audit actions. Replay orders every event by `Action.sequence`, applies
only gameplay actions to state, and exposes redacted management/audit events in
chronological history. Recovery is idempotent on
`(game_id, operator_request_id)` and atomically changes credential bindings,
consumes the grant, and appends one audit action without changing `Game.version`.
Tests cover gameplay sequence 10/version 7, audit sequence 11/version 7, and
gameplay sequence 12/version 8 without a false gap or repeated-version rejection.

HostBinding-authorized `issueInvitation`, `revokeInvitation`, and `deleteGame`
commands use the common canonical command envelope and create one
`host_management` Action. The
client-generated `command_id` is their idempotency key, scoped to the game, and
the canonical hash, serialized result, management mutation, and Action commit in
one transaction. Each consumes the next `Action.sequence` but records non-null
`expected_version = resulting_version = Game.version` and does not change the
gameplay version. Authorized identical retries return the stored result;
`deleteGame` permits only the terminal HostBinding tombstone proof defined above
during the 30-day soft-deletion window. After hard purge removes the Action and
binding tombstone, every retry returns the stable non-sensitive `game_purged`
error from the deletion ledger and never recreates or discloses the prior result.
For `issueInvitation`, the bearer value in the stored result is sealed with a
server key outside the database and is recoverable only until claim, revocation,
or expiry. `Invitation.token_hash` stores only the domain-separated verifier; the
recoverable ciphertext exists only in the Action result and is erased at that
terminal event. Raw bearer values are never stored or logged. Later retries return
the stored terminal status and never mint a new secret.

`revokeInvitation` supplies only the invitation's non-secret lookup ID. The
server derives and verifies its game, authorizes the current HostBinding, locks
the invitation against a concurrent claim, and accepts only an unclaimed,
unexpired invitation. It atomically records `revocation_timestamp`, destroys any
sealed result ciphertext, stores the result, and appends the management Action.
The same command ID is idempotent; another command against an already claimed,
expired, or revoked invitation returns `invitation_unavailable` without mutation.
A claim/revoke race can commit only one outcome. Redacted management events are
broadcast/logged under the event-sequence contract without exposing invitation
or session credentials. Tests cover atomic retry, leaked-invitation revocation,
claim/revoke races, conflicting command-ID reuse, management events between
gameplay events, delete retries during soft deletion, and the post-purge
`game_purged` response.

### Rules enforcement stages

The current source candidate creates new games under the complete pinned
`gettysburg-mandatory-v4` / `gettysburg-mandatory-board-v1` pair. The mandatory
contract in `docs/references/MANDATORY_RULES.md` governs their weighted movement,
continuous-move activation, reinforcement costs, terrain defense, retreat,
advance, and night behavior. Preview controls and authoritative reducers share
the same legality calculations. Missing or changed pinned content fails closed.
Existing saves retain their own registered pair and legacy repair behavior;
mandatory saves are never passed through those older repair routines.
The Phase 2 contracts below document retained behavior, not the new-game default.
Activation alone does not close replay delivery, owner gameplay acceptance,
or the Phase 3/4 exit criteria. No deployment is implicit in source activation.

Phase 2 is a rules-light digital tabletop: the server enforces seat ownership,
turn order, state shape, unit ownership, counter occupancy, die rolls, and
persistence while players may adjudicate advanced rules.

Scenario Five starts at Union movement on turn 1 because Confederate has no
deployed or eligible reinforcement counters. This opening skip does not consume
state or event versions. Turn 2 starts with Confederate movement normally once
its scheduled reinforcements are available.

Phase 2 enforces the printed movement allowance as a simple one-point-per-hex
budget, never routes movement through an enemy-occupied hex, permits daytime
movement into an enemy zone of control to establish an attack, and enforces the
core night withdrawal, no-entry, and trapped-combat ZOC rules. Phase 3 adds
automated validation for variable movement costs, roads, terrain, streams,
remaining zones of control and advanced stacking, authoritative terrain combat
modifiers, retreat priority and forced off-board retreat, remaining reinforcement
restrictions, mandatory night behavior, and any source-approved objective or
victory edge cases. Phase 2 already enforces basic general stacking, mandatory
contact grouping, independent unit-factor results, loss allocation, connected
retreat, eligible advance, objective control, casualty scoring, automatic-victory
checks, and final victory.
The interface must distinguish a hard rejection from a warning that players may
acknowledge under a future optional-rule policy.

### Phase 2 movement command contract

`moveUnit` supplies one unit ID and a destination coordinate; `moveStack`
supplies two or more unit IDs from the same hex and one shared destination.
Both use the common versioned/idempotent command envelope. The board sends
`moveStack` by default when a dragged counter shares its hex with friendly
counters; holding Ctrl before dragging explicitly selects only that counter and
sends `moveUnit`. Ctrl-click also keeps that explicit single-counter selection
for a later drag; a normal click returns the counter to whole-stack selection.
The browser derives the destination from the dropped board hex; players never
type a coordinate. Only the active seat may move its own unit or stack during
its movement phase. Phase 2 verifies expected version, unit and seat
ownership, an authoritative on-board deployed location, an eligible movable
status, board bounds, destination existence, and counter occupancy, then persists
the location mutation and serialized result atomically. A stack move is one
atomic command: every submitted counter moves or none does, and the slowest
counter's remaining allowance limits the route. Each crossed hex spends one
movement point, including across multiple moves in the same movement phase; no
counter can exceed its printed allowance and each budget resets at the start of
its side's next movement phase. Reinforcement units are
rejected by `moveUnit` and must use `enterReinforcement`; eliminated and other
off-board units are rejected. The authoritative shortest legal route cannot
enter an enemy-occupied hex. Daytime routes may enter an enemy zone of control,
including an empty hex adjacent to an enemy counter, while night routes may not
enter one. Phase 2 permits at most one general in a hex. A
destination without a general permits at most one combat unit; a
destination with one general permits at most two combat units. An empty
destination accepts either unit type; a general-only destination accepts up to
two combat units; and a one-combat-unit destination rejects another combat unit
but accepts one general. A general-plus-one-combat destination accepts one more
combat unit. A second general and any move beyond those capacities are rejected.
On Turns 8, 16, and 24, the server derives enemy zones of control from deployed
enemy combat counters. The authoritative shortest route may not enter any such
hex. Before ending movement, every friendly deployed counter currently in an
enemy ZOC must withdraw when it has movement remaining and at least one adjacent
non-ZOC destination that satisfies ownership and stacking. Variable terrain
cost, other route obstruction, daytime ZOC cost, stream, road, and other
advanced stacking legality remain player-adjudicated until Phase 3. Acceptance
cases cover empty, general-only, combat-only, general-plus-one-combat, and full
destinations for both mover types, enemy-occupied route detours, and legal
daytime entry into an enemy zone of control.

### Phase 2 reinforcement-entry command contract

`enterReinforcement` supplies one reinforcement unit ID and destination through
the common command envelope. Only the active seat may call it during its movement
phase. The server verifies the unit belongs to the active side, is off-board in
an available reinforcement state, satisfies its approved scheduled entry window,
and has not already entered or been eliminated. The destination must exist, be
one of that unit's typed entry hexes, and satisfy the Phase 2 stacking invariant.
The state transition, action, and result persist atomically and idempotently.
Night reinforcement entry into an enemy ZOC is rejected. Phase 3 adds any
further rule-derived entry restrictions; `moveUnit` remains limited to already
deployed units. Tests cover early, on-schedule, duplicate, wrong-side,
wrong-entry-hex, occupied, already-entered, and night-ZOC cases.

### Phase 2 combat command contract

Phase 2 provides an authoritative, mandatory adjacent-combat workflow while
leaving terrain and the remaining advanced modifiers for Phase 3:

- Ending movement discovers every deployed non-general stack adjacent to an
  opposing combat stack. The server deterministically partitions each connected
  contact network into the fewest legal independent skirmishes: every eligible
  combat counter is assigned exactly once, every combat counter sharing a hex
  stays in the same skirmish, and one side of each skirmish occupies exactly one
  hex. This permits many attacking hexes against one defending hex or one
  attacking hex against many defending hexes, but never a multi-hex-versus-
  multi-hex battle. Players cannot omit a touching combat stack or choose a
  different grouping. Exact-cover separation is work-bounded and fails the
  phase command closed if it cannot produce a complete legal partition; the
  server never substitutes an illegal multi-hex-versus-multi-hex battle.
- The same authoritative `endPhase` action creates a unique combat ID and one
  cryptographically secure d10 roll per side for every skirmish. Each skirmish
  stores and resolves its own dice and capped unit-factor modifiers; rolls and
  factors are never accumulated across separate skirmishes. The complete
  generated combat state and every roll are retained in the durable action
  result. `declareCombat` and `rollCombat` remain accepted only for compatibility
  with an already-saved legacy combat workflow; the normal client exposes no
  manual declaration or roll action.
- `confirmCombatResult` supplies only the combat ID. Only the active seat may
  call it after the automatic roll. The server caps each side's printed
  combat-factor modifier at +10, adds it to that side's roll, and derives the
  complete result. The defender wins a tied modified total. A margin of 0-2
  causes retreat, 3-5 causes retreat plus one step loss, and 6 or more causes
  retreat plus two step losses. An attacker win offers advance after required
  losses and retreats resolve. Losses are capped at the participant steps still
  available. New terrain-version games include the approved hill, woods, and
  town adjustments. The interface shows the combined unit/terrain total.
  Phase 3 terrain defense is calculated once per skirmish, not once per unit or
  participating hex. Repeated standard hill or woods/forest terrain across
  connected defending hexes contributes that terrain's approved adjustment only
  once. Matching terrain in an adjacent hex outside the skirmish contributes
  nothing. Separate skirmishes calculate independently; combinations of
  different terrain types use the strongest effective defending hex, not a sum
  across hexes. Each hex is capped at its approved total. A +4 wooded rough hill
  has +2 hill and +2 woods components; town is +1. These are recorded assumptions
  under the owner's completion instruction. A forest is a continuous region
  of woods-containing hexes linked
  only across a shared hex side where the approved project-board artwork shows
  the woods continuing through that side. Adjacent woods hexes without that
  connection are separate forests. Wooded-hill and rough-hill-plus-woods hexes
  participate only through reviewed woods links. A participating defending woods
  hex is eligible for woods defense only when no participating attacker occupies
  that same connected forest. The defending side receives its single woods
  adjustment only if at least one participating defending woods hex remains
  eligible. If none remains eligible, the skirmish receives no woods adjustment.
  Cancellation affects only woods; an independently applicable standard- or
  rough-hill adjustment remains available unless a participating attacker shares
  that connected hill (Rules2.pdf rule 4b2). Explicit inferred hill links define
  that independent cancellation.
  A reduced counter contributes half its full combat factor rounded up. A
  combat-one counter has no reduced step and is eliminated by its first
  allocated loss. Saved Phase 2 v1 games retain their original combat behavior;
  newly created games record and use the v2 rule.
  The server creates the first required loss or retreat choice.
  Once losses are allocated, it advances through each confirmed retreat and then
  offers advance only when a server-derived eligible attacker exists. With zero
  losses, no retreat, and no eligible advance, it marks the combat `resolved`
  immediately. A requested advance with no eligible attacker also resolves
  without a choice; otherwise an explicit advance-or-decline choice is required.
- `allocateLoss` supplies the combat ID and unit/step allocations. Only the seat
  that owns the pending loss may call it. The payload contains exactly one
  non-negative integer allocation, including zero, for every participant owned by
  that seat and no other unit. Allocations cannot exceed available steps, and the
  total must exactly satisfy the pending loss count before advancing to retreat
  or advance. When losses eliminate every combat counter in a general's
  participating stack, that unsupported general is eliminated in the same
  authoritative action and is not left behind or offered a retreat.
- `retreatUnit` handles a lone retreating counter. `retreatStack` supplies the
  combat ID, every pending counter from one original hex, and its connected drag
  path. The pending IDs include surviving combat units plus any friendly general
  that shared their hex. Only the owner of the pending retreat may call either
  command. Counters that began together cannot be split: they move atomically to
  the same final hex. The path starts at their current hex, enters connected
  adjacent hexes, cannot enter an enemy-occupied hex, and stops at the first
  empty hex; a friendly-occupied hex therefore forces the retreat to continue.
  The browser searches for a legal connected route rather than committing to an
  enemy-blocked shortest path when another legal route exists.
  Phase 3 adds enemy-ZOC priority, forced off-board retreat, and the remaining
  complete retreat legality.
- `advanceAfterCombat` supplies the combat ID, the eligible counters dragged
  from one original stack, and either a server-recorded vacated defender hex or
  an explicit decline. The board highlights eligible counters and authoritative
  destinations. Normal drag keeps the eligible stack together; holding Ctrl
  before dragging selects only the grabbed eligible counter. Dropping on a
  highlighted vacated hex advances the submitted counters atomically, while
  dropping into the visible Decline advance tray declines without coordinate
  entry. After selecting eligible counters, clicking or keyboard-activating that
  tray also declines without a drag. The server verifies every submitted counter
  against the pending choice,
  same-source location, seat, deployment, destination, and stacking capacity.
  Only the active attacking seat may resolve the choice. Completion or decline
  marks the combat resolved.
- `endPhase` is rejected while any combat is not `resolved`, including
  `declared`, `awaitingResultConfirmation`, and pending-choice states. Phase 2
  has no implicit combat-cancellation path. Ending movement atomically creates
  and rolls all mandatory skirmishes when the active side has at least one
  deployed non-general counter adjacent to an opposing deployed non-general
  counter. On a night turn, ending movement is first rejected while any counter
  in enemy ZOC still has a legal withdrawal; therefore only combat counters that
  cannot withdraw can enter an automatic night skirmish. Otherwise combat is
  skipped within the same authoritative action and play advances to the next
  side or turn.

Successful `endPhase` transitions are:

| Current turn/phase/side | Resulting turn/phase/side |
| --- | --- |
| Any turn, movement, Confederate, adjacent enemies | Same turn, combat, Confederate |
| Any turn, movement, Union, adjacent enemies | Same turn, combat, Union |
| Any turn, movement, Confederate, no adjacent enemies | Same turn, movement, Union |
| Turns 1-23, movement, Union, no adjacent enemies | Next turn, movement, Confederate |
| Turn 24, movement, Union, no adjacent enemies | Turn 24, completed, no active side |
| Turns 1-24, combat, Confederate | Same turn, movement, Union |
| Turns 1-23, combat, Union | Next turn, movement, Confederate |
| Turn 24, combat, Union | Turn 24, completed, no active side |

Every successful transition is one authoritative gameplay action: it consumes
the next action sequence, increments `Game.version` by one, persists atomically,
and broadcasts the resulting state. A rejected transition changes neither value.

Each accepted command is one idempotent authoritative action/result, including
server-generated rolls, and follows the atomic persistence and ordering rules.
Phase 3 adds complete ZOC grouping, authoritative terrain modifiers, and the
remaining retreat and advance legality.

### Error and recovery behavior

- Loading and reconnecting states are explicit and do not expose an editable
  stale board.
- Server errors preserve the last confirmed client snapshot and offer retry.
- A failed persistence transaction does not broadcast an uncommitted action.
- Beginning in Phase 2, a process restart reconstructs active rooms from
  PostgreSQL. Phase 1 in-memory mode exposes no restart-durability claim.
- Maintenance mode prevents new commands while allowing a clear operator
  message and controlled shutdown.

## User experience

The visual direction is a restrained, period-informed interface using original
web assets rather than imitating a generic desktop tabletop. Board content has
priority over chrome. Common actions need keyboard and pointer access, touch
targets must be usable on tablet, focus must be visible, and state cannot be
communicated by color alone.

Required workflows are create game, join game, choose/confirm seat, inspect a
counter, move, declare and resolve combat, complete a phase, reconnect, and
resume a saved game. Destructive choices such as concession or game deletion
require confirmation.

### Deletion and retention

`deleteGame` is a confirmed host action. It first soft-deletes the game for a
30-day recovery window, immediately blocks gameplay and reconnect, and revokes
the game-specific HostBinding, all seat bindings, invitations, and recovery
grants. Any retained host reference is non-authorizing tombstone metadata only.
Actions, snapshots, hashed invitation/grant records, and service-managed exports
remain inaccessible but retained with the deletion tombstone solely for audited
restore.
A shared `BrowserSession` and its hash remain only when another live game binding
needs them; deleting one game never revokes unrelated bindings.

Soft deletion immediately appends a minimal non-secret tombstone containing only
game ID, deletion time, audit actor, a null purge time, and a monotonic position.
After 30 days, a hard-delete job purges the game, Actions, Snapshots,
HostBindings, SeatBindings, Invitations, RecoveryGrants, and service-managed
exports, then appends the matching purge event with its purge time. These events
form an append-only deletion ledger, replicated off-host separately from
restorable application backups and retained for at least 90 days, longer than
the 35-day maximum backup age plus a seven-day restore-lag allowance. Every
backup records its verified ledger watermark. Encrypted on-host and off-host
backups use a maximum 35-day retention and are not selectively rewritten. Every
restore, during soft deletion or after hard deletion, synchronizes the external
ledger and applies every entry after the backup watermark before `/readyz` can
pass or traffic can be enabled. A soft tombstone makes restored game data
inaccessible; its later purge event removes it. A missing, invalid, unverifiable,
or unsynchronized watermark fails closed. Previously downloaded user exports are
outside server control and the export UI states that limitation. Tests prove a
deleted game's old credentials cannot reconnect during soft deletion, after hard
purge, or after restoring any retained backup, while unrelated bindings still
work.

Accessibility targets for production are WCAG 2.2 AA for application controls,
meaningful labels for counters and hexes, keyboard-operable dialogs and logs,
reduced-motion support, and sufficient contrast. The dense board may use a
parallel textual inspector rather than making every SVG shape independently
verbose.

## Architecture and data flow

```text
Browser (React + SVG)
  | HTTPS / WebSocket
  v
Caddy on the VPS
  | 127.0.0.1:3000
  v
Node.js + Colyseus authoritative server
  | typed commands and snapshots
  +--> shared game rules/content packages
  |
  +--> PostgreSQL on a private Podman network
```

The browser keeps presentation state and the latest confirmed server snapshot.
The room validates a command through the pure game package, persists the event
and resulting state in one transaction, then broadcasts its event sequence, state
version, kind, and authorized payload.
PostgreSQL stores games, seats/players, snapshots, ordered actions, invitations,
and schema migrations. Replay is derived from the ordered action stream plus
periodic snapshots. Each game is pinned at creation to immutable
`ruleset_version` and `content_revision` identifiers. Snapshots and actions retain
both identifiers so resume and replay never reinterpret stored IDs with newer
rules or content.

The server ships an append-only version registry keyed by the exact
`(ruleset_version, content_revision)` pair. Each entry resolves to the replay
handler, validators, and immutable content bundle needed by that game; resume and
replay use this registry and never current defaults. Deployment readiness fails
if any active stored game references an unavailable pair: `/readyz` returns 503
and blocks a rollout or traffic switch. Gameplay HTTP APIs, room admission, and
room commands also fail closed while readiness is unavailable. An affected
authenticated game remains
available only for stored snapshot metadata and action-log export; mutation,
resume, and interpreted replay return `version_unavailable` and never use current
defaults. Recovery requires restoring the exact registry handler/content bundle
or running an explicit, audited, reversible migration to a new pair without
rewriting the original action stream. Readiness returns 200 only after every
active game resolves to a supported pair. Compatibility tests cover failed
readiness, the read-only response, registry restoration, retained-version replay,
and migrated-version replay.

The current replay API increment is `GET /api/games/:gameId/replay`, with an
optional nonnegative integer `sequence` query (zero is the opening; omission
means latest). Current host or seat access is checked together with the stored
history in one service read. The no-store response contains only `state`,
`sequence`, and `latest_sequence`; it never exposes historical bindings, recovery
identities, invitation secrets, or raw actions. It verifies the requested prefix
from pinned content and compares the latest prefix with the saved state.
Seat and host activation/retirement sequence bounds are retained in the canonical
service snapshot; missing chronology fails replay closed and is not inferred
from time.
Host attribution uses those bounds, and revoke summaries use retained invitation
metadata. Revocation additionally requires a previously activated, unclaimed
target, its exact revocation sequence, and a timestamp before expiry. Missing
historical evidence fails closed without rewriting retained saves.
Issued invitations match retained side/activation evidence. Recovery audit rows
match consumed grants, their request/sequence and operator identity, and the
old/new binding rotation. Gameplay success requires the exact accepted envelope
and literal boolean `ok: true`. None of this private evidence is returned by
the replay endpoint.
The verifier receives only the requested game's evidence and indexes
historical actors once. Before database reads/reconstruction, process-local
one-minute limits allow 30 replay attempts per session, 60 per source, and 300
globally. Exhaustion returns `429 replay_rate_limited` with `Retry-After: 60`;
limiter keys retain a credential hash, never the credential. These are initial
abuse bounds, not a measured capacity claim or a replacement for checkpointing.
Malformed/out-of-range cursors return `replay_cursor_invalid`; corrupt histories
or requested prefixes beyond 10,000 actions return generic `replay_unavailable`.
Only the mandatory pair currently has a registered interpreted-replay handler.
Retained tabletop pairs remain resumable but replay returns `version_unavailable`
until their own handlers are implemented; no mandatory fallback is allowed.
The client exposes read-only opening/previous/next/jump/latest navigation,
counter inspection for both sides, and recorded combat dice. Replay replaces
gameplay controls until the player returns to live state; it never routes a
game command. Closing aborts pending reads, stale responses are ignored, and
failed authorized reads clear the historical board. Retained-version coverage,
measured capacity/checkpointing, and
spectator authorization remain separate implementation/release gates.

Production runs as rootless Podman Quadlet services under the `gettysburg` user.
Caddy is the only public application edge. The deployment target and current
host baseline are specified in `docs/operations/VPS.md`.

## Proposed data contracts

The precise schema is a Phase 1 deliverable, but it must represent:

- `Game`: id, scenario, immutable ruleset version/content revision, status, turn,
  phase, active side, version, timestamps
- `BrowserSession`: id, credential hash, creation/expiry/revocation timestamps
- `HostBinding`: game id, browser session id, positive monotonic binding version,
  creation/revocation timestamps, recovery/audit reference
- `SeatBinding`: game id, side, browser session id, credential/binding version,
  creation/revocation timestamps, connection state
- `Invitation`: non-secret lookup id, token hash, game id, allowed seat, expiry,
  one-time claimed timestamp/session, revocation timestamp
- `RecoveryGrant`: non-secret lookup id, token hash, target binding type
  (`seat` or `host`), game id, nullable seat, target binding id/version, issuing
  operator/audit reference, expiry, consumed timestamp, revocation timestamp.
  Host grants require a null seat and rotate only that game's HostBinding; seat
  grants require a side and rotate only that SeatBinding.
- `Unit`: stable id, side, formation, type, full/reduced strengths, movement,
  location or reinforcement state, status
- `Hex`: coordinate, terrain, edges, road/rail links, objective metadata
- `Combat`: stable game-scoped id, attackers, defenders, modifiers, rolls, result,
  pending choices; retained in snapshots and replay data
- `Snapshot`: game id, last event sequence, resulting state version, ruleset
  version, content revision, state, timestamp
- `Action`: id, game id, monotonic per-game sequence,
  gameplay/host-management/operator-audit kind, nullable client command id,
  nullable operator request id,
  authorizing binding/identity type, immutable authorizing ID and version,
  canonicalization version, canonical request hash, actor, expected/resulting
  version, ruleset version, content revision, command, payload, serialized result,
  timestamp

`(game_id, command_id)` for gameplay/host-management actions,
`(game_id, operator_request_id)` for audit actions, `(game_id, sequence)`, and
`(game_id, resulting_version)` for gameplay actions are unique. Sequence values
are strictly increasing without gaps and drive replay, broadcast order, and
client gap detection. Protocol contracts are shared TypeScript types with runtime
validation at every network and persistence boundary. Database rows are not sent
directly to clients.

Invitation claim derives the target game and seat only from the verified
`Invitation.game_id` and `Invitation.allowed_seat`. Any supplied game or side
that differs is rejected without consuming the invitation. The single claim
transaction checks unclaimed, unexpired, and unrevoked state and atomically locks
or conditionally claims the derived `(game_id, side)`. A database uniqueness
constraint permits only one active binding for that pair. A second active-binding
uniqueness constraint on
`(game_id, browser_session_id)` prevents one browser session from holding both
sides of one game while allowing it to hold bindings in different games. Both
constraints are enforced in the claim transaction. The transaction creates the
seat binding and records the invitation claim time/session only after the seat
claim succeeds. A concurrent loser receives `seat_unavailable`; it creates no
binding and does not consume the invitation. A recovery transaction consumes one
valid grant, revokes the old binding, creates the replacement binding, and
appends the operator audit action. Concurrent invitation or recovery reuse can
commit only once.

## Security and privacy

- HTTPS is mandatory; HTTP redirects to HTTPS.
- Only ports 22, 80, and 443 are public on the host firewall.
- Application and database containers run rootless; PostgreSQL has no public
  listener.
- Password and keyboard-interactive SSH authentication remain disabled. Host
  administration uses public keys.
- Invitations are random, expiring, and revocable. `Invitation.token_hash` is
  only the verifier paired with a non-secret lookup ID; any temporary recoverable
  ciphertext follows the sealed Action-result lifecycle above. Raw bearer values
  are never stored or logged.
- Browser-session credentials are independently random and stored only as hashes.
  An invitation claims an open seat but never authenticates later reconnection.
- The browser cookie is named `__Host-gettysburg-session` and uses `Secure`,
  `HttpOnly`, `SameSite=Strict`, `Path=/`, and no `Domain`. It includes `Max-Age`
  and may include matching `Expires`; neither extends beyond the server-side
  session expiration. One session maps to multiple game/seat bindings.
- Production WebSocket upgrades require TLS and an exact `Origin` of
  `https://gettysburg.christitus.com`; missing or untrusted origins and non-TLS
  public connections are rejected before reading the seat cookie or commands.
  Caddy is the only public edge. The application accepts forwarded scheme
  information only from the loopback Caddy connection and rejects direct or
  non-TLS production upgrades before parsing cookies or commands. The session
  credential and requested game/seat binding are validated during every upgrade.
- Every command is authorized against the server-side seat and game status.
- Rate limits cover game creation, invitation attempts, HTTP endpoints, and
  WebSocket message volume.
- Logs omit session tokens, invitation secrets, and database credentials. Full
  client IP addresses are never recorded; security telemetry may use a documented
  truncated or keyed-pseudonymous value with bounded retention.
- Secrets live outside Git in rootless service environment files with mode 0600.
- Dependencies, container images, and migrations are reviewed before production
  deployment.

The supplied scans may contain copyrighted Avalon Hill material. They remain
local, are ignored by Git, and must never be force-added. Public or commercial
release requires confirmed rights or a clean-room set of original board,
counter, and explanatory assets.

## Performance and compatibility

- Support current stable Chrome/Chromium, Firefox, and Safari releases.
- A board interaction should provide visual feedback within 100 ms on supported
  desktop hardware; accepted network commands should normally appear to both
  players within 500 ms excluding Internet latency.
- Initial application content should become interactive within 3 seconds on a
  typical broadband connection after compression and caching.
- Reconnection should restore a normal active game within 5 seconds after the
  transport becomes available.
- A single room targets two players plus optional spectators. Phase 4 load tests
  define and prove the supported concurrent-room capacity on the 4-vCPU,
  3.7-GiB VPS before any public capacity claim.
- SVG rendering must remain smooth for the complete board and counter set at
  desktop and tablet sizes. A measured failure is the trigger to evaluate PixiJS.

## Operations requirements

- `/healthz` reports process liveness without exposing internals. `/readyz` is
  mode-aware: Phase 1 in-memory mode verifies only configured application
  dependencies, while Phase 2 and production additionally require PostgreSQL
  connectivity and migration state. The response identifies no sensitive detail.
- Deploy application images by immutable digest and record both that digest and
  the reviewed source revision. Do not rely on mutable tags.
- Back up PostgreSQL and persistent application data on a schedule outside the
  live container storage. Encrypt off-host copies.
- Test a restore before production launch and at a documented recurring cadence.
- Keep the previous compatible image available for rollback. Back up before any
  schema migration and document whether rollback is schema-compatible.
- Use journald for service logs initially, with size limits and secret redaction.

## Non-goals

- Native desktop or mobile applications for the first release
- Three-dimensional rendering or real-time action gameplay
- An AI opponent in the initial roadmap
- Public matchmaking, payments, or a general scenario editor in the first release
- Exact VASSAL compatibility or dependence on a VASSAL module
- Public distribution of supplied source scans without a resolved rights basis
- Phone-layout support before it has its own acceptance pass

## Acceptance criteria

The first production release requires completed Phase 3 rules enforcement and
every Phase 4 exit criterion in `ROADMAP.md`, including production acceptance,
rights-safe assets, recovery/rollback evidence, accessibility/browser/security
checks, measured VPS capacity, and a complete 24-turn candidate game. It is
accepted when:

- Two independent browsers can create/join, occupy opposing seats, and complete
  a full 24-turn game with consistent state.
- Refresh, disconnect/reconnect, application restart, and VPS reboot preserve or
  restore the match without duplicate actions or lost confirmed commands.
- The complete approved map, units, reinforcement schedule, turn sequence,
  combat flow, night turns, objectives, and victory conditions match the final
  source interpretation and have automated rule tests.
- The server rejects unauthorized, stale, duplicate, and malformed commands in
  integration tests. Crash/retry tests return the stored result for an identical
  command and reject command-ID reuse with a different canonical request.
- Migration and duplicate-command tests persist `canonicalization_version` with
  every action, use that stored version to validate retries, and reject an
  unsupported canonicalization version without mutation.
- Integration tests prove invitation replay cannot take a claimed seat,
  mismatched requested game/side values are rejected without consuming the
  invitation, credential revocation blocks reconnect, operator recovery rotates
  credentials, and browser restart retains only the intended secure-cookie flow.
- Invitation tests allow the bearer secret only in the pre-redemption fragment.
  They prove the request-visible path/query, referrers, and access logs contain
  no secret; the fragment/code is redeemed once over HTTPS; and browser history
  is scrubbed synchronously before the redemption request.
- Command tests cover every `endPhase` table row, Phase 2 stacking capacity,
  atomic stack movement and retreat, combat loss thresholds, seat surrender,
  and operator-audit sequencing.
  Audit actions increment sequence without changing `Game.version`; gameplay
  actions increment both according to their defined invariant.
- HTTP/WebSocket integration tests verify invitation and command rate limits,
  exact WebSocket Origin enforcement, missing/untrusted Origin rejection, cookie
  attributes, HTTPS redirect, and rejection of non-TLS production connections.
- Log-capture tests exercise invitation, credential, command, error, and recovery
  paths and prove that full client IP addresses are absent and that secrets,
  database credentials, session data, and canonical sensitive payloads are absent
  or redacted.
- Supported browsers pass desktop and tablet manual workflows, keyboard access,
  contrast checks, and reduced-motion behavior.
- Backup and restore, health checks, deployment, schema migration, and rollback
  are exercised against production-like data.
- Performance and load budgets are measured on the target VPS.
- Exact-head CI, the executable security tests above, dependency review, and
  independent review pass.
- The rights decision permits every asset and rule explanation shipped publicly.

## Remaining decisions and acceptance

- Which remaining Battle Manual interpretations must be approved for complete
  Phase 3 enforcement?
- Complete gameplay acceptance of inferred movement edges and the painted-board
  scenario adaptations; all 253 terrain rows are already approved.
- Implement the owner-approved continuous-move UI: repeated drags of one
  unit/stack are allowed until a different unit moves; reconnect does not reset
  that boundary.
- Complete final production-candidate validation and obtain release approval.
- New assets and source-derived explanations require their own provenance;
  approval of current original presentation never permits publishing scans.
