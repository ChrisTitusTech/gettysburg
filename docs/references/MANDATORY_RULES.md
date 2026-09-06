# First-release mandatory-rule contract

## Authority and scope

On 2026-09-06 the owner selected Scenario Five with mandatory rules only, plus
replay, spectators, and opt-in browser push notifications. Optional rules and
additional scenarios are excluded, not unfinished mandatory features. In
particular, nighttime reorganization uses optional rule 10c; it is not required
for this release. Core night withdrawal and combat restrictions remain required.

The local Rules1.pdf and Rules2.pdf sheets were visually inspected. The Battle
Manual supplies Scenario Five and worked examples. These private sources are
not distributed. This document paraphrases mechanics, not their printed prose.
The approved painted A-W board and typed terrain replace the source map's
coordinates. Existing owner terrain overrides (+2 woods, +4 rough heights,
connected-terrain cancellation) remain authoritative.

## Movement and positioning

| Rule | Required behavior | Source |
| --- | --- | --- |
| Normal movement | Follow adjacent hexes; do not exceed the available budget | Rules1 3a; Rules2 3b |
| Clear / ordinary hill / town | Enter for 1 point before other applicable costs | Rules2 3b |
| Road / railroad | A connected road or rail step costs 0.5 outside enemy ZOC, replacing terrain/stream costs | Rules2 3b1 |
| Town road movement | The town counts as road terrain, but use explicit connected edges, not arbitrary jumps | Rules2 3b1 |
| General accompaniment | A combat counter accompanied for its entire move receives +1 movement; the general retains its own printed budget | Rules2 3b2; Manual 8a |
| Woods | Add 1 on entry unless using eligible road movement | Rules2 3b3 |
| Rough hill | Add 1 on entry; wooded rough hills prohibit artillery in normal movement, retreat, and advance | Rules2 3b4 |
| Stream | Add 1 when crossing a marked stream side, unless using eligible road movement | Rules2 3b5 |
| Enemy ZOC | Add 1 on entry; normal moves cannot step directly from one enemy-ZOC hex to another | Rules2 3b6 |
| Combined costs | Woods, rough hill, stream, and ZOC surcharges add together | Rules2 note following 3b6 |
| Friendly transit | Counters may pass through friendly stacks but must end in a legal stack | Rules1 2e |
| Enemy occupancy | No movement into or through an enemy-occupied hex | Rules1 2e |
| Lone generals | A general without a friendly combat counter is eliminated in enemy ZOC; generals exert no ZOC | Rules1 2c-2d |
| Reinforcement | Enter on the scheduled turn or later; entry itself spends movement | Rules2 3c |
| Blocked entry | If the scheduled entry is enemy-occupied or in enemy ZOC, choose a nearest board-edge hex free of both | Rules2 3c |
| Leaving the board | An edge exit costs 1 during normal movement; the counter cannot return and is not an eliminated casualty | Rules2 3d |

The owner approved this UI translation on 2026-09-06: repeated drags of the same
unit/stack remain one continuous move until a different unit moves. Once another
unit begins moving, previous movers cannot resume normal movement that phase.
Retreat and advance remain separate, free actions. The server must persist this
activation boundary so reconnecting cannot reset it.

The painted map has more wooded rough heights than the original map. Apply the
artillery prohibition to the typed wooded-rough-hill terrain combination rather
than obsolete original-map coordinate literals. Road/rail/stream links use the
existing reproducible edge estimates in TERRAIN_CONNECTIONS.md; they remain
subject to gameplay review and can be corrected without changing the artwork.
Do not infer road links merely because both adjacent hexes contain a road.

## Combat, retreat, and turn completion

Mandatory contact grouping, separate d10 rolls, defender-wins-ties, the +10
modifier cap, losses, and basic advance are already implemented. Preserve the
owner-approved strongest-effective-defending-hex policy and independently
cancelled woods/hill components described in TERRAIN_ADJUSTMENTS.md.

Remaining retreat cases (Rules2 4d) must be explicit choices rather than deadlocks:

- Use a non-enemy-ZOC neighboring hex when one is legally available; otherwise
  enemy ZOC is allowed. An enemy-occupied hex is never a retreat destination.
- Counters from one original hex retreat together. Continue through friendly
  occupied hexes until reaching the first empty hex or a legal board exit.
- A completely enemy-surrounded stack stays and takes one extra loss.
- If neighbors are only enemies or the board edge, offer the printed choice of
  leaving the board or staying with one extra loss. Exited counters do not score
  as eliminated casualties and cannot re-enter.
- Artillery restrictions also apply to retreat and advance. Retreat and advance
  spend no normal movement points. Only a victorious attacker can advance into
  a vacated defender hex, with legal stacking.

Night turns remain 8, 16, and 24. Require withdrawal when a legal move exists,
forbid entry into enemy ZOC, and allow combat only for trapped active-side combat
counters (Rules1 2f). Integrate actual terrain cost and stack movement into the
withdrawal test so an impossible withdrawal never blocks ending movement.
Preserve Scenario Five scoring, objective ownership, and automatic-victory checks.

## Versioning and acceptance

Implement rule families in independently reviewed increments. A pure calculator
may land before activation; do not call a ruleset complete until the authoritative
reducer and browser previews both use it. Activate complete mandatory rules under
a new immutable rules/content pair, retaining existing game interpretation.
No silent migration or reinterpretation of old actions is permitted.

Tests must cover half-point budgets; cumulative terrain costs; connected versus
disconnected roads; enemy-ZOC transitions; general accompaniment; artillery;
blocked/edge entry; off-board status; trapped retreat choices; night withdrawal;
and deterministic replay of stored dice and ordered events. Test the same legal
route in server validation and browser preview. Finish desktop/tablet full games,
representative manual adjudications, exact-head CI, and independent review before
closing Phase 3. This contract is an implementation plan, not completed evidence.
