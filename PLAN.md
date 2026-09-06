# Gettysburg project plan

## Goal

Deliver the easiest credible digital version of the supplied tabletop design: a
modern web application that runs in a browser, keeps the physical game's
turn-based character, and lets two people play through a self-hosted server
without installing a desktop client.

Success means a player can open `https://gettysburg.christitus.com`, create or
join a private game, take the Union or Confederate seat, play a complete saved
match on the hex board, and recover cleanly from a disconnected browser.

## Product strategy

Start as a rules-light digital tabletop and add rules enforcement in layers.
This gets the real board, counters, multiplayer synchronization, and save/resume
flow in players' hands before every historical rule has been encoded.

The delivery order is:

1. Resolve source, scenario, and rights gates while creating a vertical slice.
2. Deliver the complete board and order of battle as a playable digital tabletop.
3. Add rule assistance and validation behind tested server commands.
4. Harden the experience for production, asynchronous play, and replay.

Each phase is a separately reviewable outcome with automated validation, manual
browser evidence, and an explicit pause point. `ROADMAP.md` defines the gates.

## Current delivery status

The 2026-09-06 approved terrain follow-up expands the development board to A-W,
records best-guess connections, and implements terrain defense. The owner
confirmed no live/production games require compatibility. This bounded Phase 3
increment does not complete movement-rule enforcement or authorize deployment.
Current evidence and remaining gates are in `TASKS.md`.

Phase 0 is complete. Phase 1 implementation is merged but awaits the owner's
recorded interpretation/rights-ledger review. Phase 2 implementation and its
post-merge battle cleanup are merged through PR #3. PR #4's validated
implementation head has green Application and Documentation CI for the
operational repair, but the final PR head and resulting `main` commit must each
pass their workflows. The final PR head also needs a non-rate-limited
independent review before merge. Operational closeout requires a healthy
deployment of the reviewed current revision. Phase 3 rules assistance and Phase
4 production release work have not started as complete phases. `TASKS.md` is the
authoritative current evidence ledger.

## Approved decisions

| Area | Decision | Reason |
| --- | --- | --- |
| Client | React, TypeScript, Vite | Familiar browser stack with fast iteration and static typing |
| Board | SVG first | Hexes, paths, labels, hit targets, and zoom remain inspectable and accessible |
| Multiplayer | Colyseus authoritative rooms | Provides room lifecycle, reconnection, and synchronized schema state |
| Rules | Pure shared TypeScript package | Keeps command validation deterministic and easy to test |
| Storage | PostgreSQL | Durable matches, actions, invitations, and future replay queries |
| Hosting | One self-hosted VPS | Lowest operational complexity for the current scale |
| Edge | Caddy with same-origin routing | Automatic HTTPS and no cross-origin client configuration |
| Runtime | Rootless Podman Quadlets | Reproducible containers managed by the existing user systemd service |
| Presentation | Original web UI | Avoid a dated virtual-tabletop shell and support a rights-safe release path |

PixiJS is deferred. It may replace or complement SVG only if measured board
performance, animation volume, or mobile interaction proves SVG insufficient.

## Initial game model

The server-owned state contains:

- scenario identity and Union/Confederate seat assignment
- turn number 1 through 24 and the current side/phase
- units, reinforcement schedules, locations, strength steps, and status
- declared combats, pending loss/retreat/advance choices, and results
- objectives, victory state, server-generated die results, and an action log

The initial command vocabulary is:

- `moveUnit`
- `enterReinforcement`
- `declareCombat`
- `rollCombat`
- `confirmCombatResult`
- `allocateLoss`
- `retreatUnit`
- `advanceAfterCombat`
- `endPhase`
- `surrenderSeat`
- `issueInvitation`
- `revokeInvitation`
- `deleteGame`

Every client gameplay or host-management command includes a client-generated
command ID, game identifier, expected state version, and command payload. The
server derives the acting `SeatBinding` or `HostBinding` from the authenticated
session; clients never supply actor identity. Operator audit actions use the
server-generated `operator_request_id` contract. The server stores command IDs
with resulting actions so retries are idempotent and rejects stale, unauthorized,
or illegal commands without mutation.

## Delivery and deployment shape

The browser bundle and Node.js game server ship as one web service bound only to
`127.0.0.1:3000` on the VPS. Caddy proxies the public domain to that service.
The public routes remain same-origin:

- `/` - browser application
- `/healthz` - unauthenticated process liveness with no internal detail
- `/readyz` - deployment readiness, including required dependencies
- `/api/` - other HTTP API endpoints
- `/ws/` - multiplayer WebSocket transport

PostgreSQL is reachable only on the private container network. Persistent data,
secrets, images, and backups remain outside the Git checkout. Production rollout
deploys an immutable image digest recorded with the reviewed source revision,
uses a health/readiness gate, and retains the previous compatible digest for
rollback. Mutable tags are not deployment identities. The verified host baseline
is in `docs/operations/VPS.md`.

## Key risks and controls

| Risk | Control |
| --- | --- |
| Incomplete rules and scenario information | Treat missing inputs as explicit gates; do not invent rule behavior |
| Copyrighted board and counter artwork | Keep source scans local and Git-ignored; decide licensed use versus original clean-room presentation before public release |
| Desynchronized multiplayer state | Server authority, versioned commands, deterministic tests, and reconnect integration tests |
| Rule implementation slows delivery | Ship rules-light tabletop milestones before full enforcement |
| Single-VPS failure | Automated database and volume backups, restore tests, health checks, and rollback tags |
| Database migration loss | Back up first, test migrations on a copy, and require explicit production approval |
| Mobile board complexity | Target desktop and tablet first; validate touch interactions before claiming phone support |

## Decision gates before full content implementation

- Complete the production counter treatment. All available source-card fronts
  and the owner-approved Phase 2 reduced-value rule are encoded; reduced-face
  artwork remains a later presentation input.
- Complete movement-edge and gameplay acceptance for the approved per-hex
  terrain transcription. Forest links use authorized best guesses. Use supplied
  rules and explicit owner decisions for terrain effects and numeric modifiers;
  terrain defense is enabled in the new development terrain ruleset.
- Decide whether optional rules are in scope.
- Decide whether the supplied scans may be used beyond a private prototype or
  whether the release must use entirely original art and wording.

The locally supplied Battle Manual now answers the Scenario Five setup, turn,
night, objective, scoring, and victory questions for the rules-light Phase 2
model. The owner-approved reduced-value derivation closes the Phase 2 counter-
state rule gate. Phase 2 does not claim reduced-face artwork or per-hex terrain
fidelity; those remain later-phase inputs.

## Planning ranges

After the decision gates are answered, the expected effort is approximately:

- Phase 1 vertical slice: 3 to 5 focused development days
- Phase 2 digital-tabletop MVP: 2 to 4 weeks
- Phase 3 rules-assisted game: 4 to 8 additional weeks

These are planning ranges, not release commitments. Scope, asset cleanup, rules
ambiguity, and the amount of original presentation work can materially change
them.

## Definition of done

The project is done for its first production release only when all Phase 4 exit
criteria pass, deployment and restore procedures have been exercised, the
public presentation has a resolved rights basis, exact-head CI and independent
review are clear, and two players have completed a full 24-turn acceptance game.
