# Terrain connections and scenario mapping

## Status and authority

The owner approved all 253 terrain hexes, corrected B-2 and F-11 to woods +2,
and authorized best-guess forest connections on 2026-09-06. The owner also
confirmed no in-progress game compatibility is required for this development
change. No production deployment or saved-game deletion is part of this work.

The approved `gettysburg-board-deluxe.png` is the visual source. Terrain types
and totals are transcribed in [the approved worksheet](TERRAIN_ADJUSTMENTS.md).
The links below are assistant-inferred, not individually owner-checked.
They can be corrected independently without redoing the terrain inventory.

## Inference method and limitations

Forest footprints were visually grouped into the northwestern copse, western
forest, northern band, southern band, and eastern edge patch. Only explicit
neighbor pairs within those footprints are linked. Isolated adjacent patches
remain separate, including B-1/B-2, C-8/C-9, and V-8/V-9. The rocky western
forest edges and thin canopy gaps are lower-confidence guesses. Roads and
streams do not automatically split a forest; a painted canopy gap does.

Hill links use contiguous painted elevation groups: the Round Tops/Devil's Den,
Cemetery Hill, the northern ridge, two small eastern hills, and Culp's Hill.
The +4 wooded-height total is split into +2 hill and +2 woods so independent
cancellation works. The strongest effective defending hex supplies the skirmish
terrain adjustment; repeated or mixed defending hexes do not sum bonuses.

Road/rail centerlines were sampled along the visible painted routes and mapped
to successive adjacent hexes. A stream-crossing side means that the segment
between the two hex centers intersects a sampled blue stream centerline.
These are estimates, especially near vertices; they do not establish bridge
construction or historical road identity. Their checked-in pairs, not pixel
sampling at runtime, are the reproducible transcription.

The 5 estimated road/rail stream-crossing sides are:
`O10-O11`, `Q3-Q4`, `Q4-R3`, `Q10-Q11`, `S10-T10`.
Treat these as crossing candidates, not individually verified bridges.

## Runtime boundary

Forest and hill regions feed current terrain combat. The server initializes
the approved terrain bundle in each new game's authoritative snapshot; the
client cannot supply or edit it through gameplay commands. Combat preview,
automatic dice resolution, and confirmation use the same pure calculation.
The overall unit-plus-terrain modifier remains capped at +10.

Road, rail, and stream edge data are transcribed and tested for adjacency and
uniqueness, but variable movement costs are NOT enabled by this terrain-defense
change. The existing one-point-per-hex movement remains. Complete road movement,
stream costs, rough-hill/artillery restrictions, generals, and remaining ZOC
rules are the separate Phase 3 movement task; these edge estimates are inputs
to that task, not a claim that it is already complete.

## Mandatory movement bundle (not yet enabled)

`packages/content/src/mandatory.ts` pins the complete new Scenario Five opening
under `gettysburg-mandatory-v4` / `gettysburg-mandatory-board-v1`. It includes
all 253 approved terrain records, the existing 70 road / 15 rail / 58 stream
pairs, 82 counters with unchanged schedules, eight objectives worth 16 points,
and empty continuous-movement activation. The first active phase is Union
movement, turn 1. Each constructor call returns an isolated snapshot; a content
fingerprint guards against silently changing this revision's interpretation.
The server registers this exact pair for saved-state interpretation but does
not yet create it by default. It requires the complete pinned terrain/edge
bundle, unit metadata/schedules, objective values, and explicit movement/step
state. Missing or changed data fails readiness and gameplay with
`version_unavailable`; it is never filled from today's defaults. JSON object
key ordering does not matter. This handler preserves saved mandatory state
without running the older opening/retreat/advance repair routines.

Off-board road/rail links were separately estimated from the approved PNG on
2026-09-06. The explicit inventory is A2, A7, H11, O11, Q11, S1, U1, W7,
and W11. A route merely passing through an edge hex is not an off-board link.
Only these listed boundary crossings supply the half-point entry discount,
including when the nearest-safe-entry rule sends a reinforcement there.
They do not make an otherwise illegal entry legal or let artillery enter wooded
rough hills. Normal voluntary exit still costs one full movement point.

| Boundary location | Inferred hex | Basis / limitation |
| --- | --- | --- |
| Upper western road | A2 | Painted road crosses the western boundary |
| Middle western road | A7 | Painted road crosses the western boundary |
| Southwestern road | H11 | Southern exit is in H11; I11 only contains an on-board segment |
| South-central road | O11 | Vertical road continues to the outer boundary |
| Southern railroad | Q11 | Rail continuation at the southern boundary is near a hex vertex; lower confidence |
| Northern railroad | S1 | Rail crosses the top boundary |
| Northeastern road | U1 | Road reaches the upper-right boundary, not every adjacent top-row hex |
| Middle eastern road | W7 | Road crosses the eastern boundary |
| Lower eastern road | W11 | Painted road is below W10 at the boundary |

No scheduled arrival is relocated to fit these estimates. On an enemy-free,
uncongested board the scheduled infantry entry costs are A1 = 2, A8 = 1,
I11 = 2, S1 = 0.5, W7 = 0.5, and W10 = 2. A8 remains owner-verified clear
terrain, despite nearby painted woods. The owner-approved worksheet is unchanged.
These border estimates, especially the southern rail vertex and I11/W10
adaptations, remain explicit owner gameplay acceptance checks before release.

## Scenario adaptation

| Item | Previous key | Painted-board key | Treatment |
| --- | --- | --- | --- |
| Culp's Hill objective | M9 | R10 | Preserve 3 points; use the named painted hill |
| Right-edge road entry | U7 | W7 | Preserve arrival schedule; use actual eastern edge |
| Right-edge lower entry | U10 | W10 | Preserve arrival schedule; use actual eastern edge |
| Other seven objectives | F6, I11, K6, K7, L6, L7, M7 | Same | Preserve 13 combined points |
| Other entries | A1, A8, I11, S1 | Same | Still on a painted board edge |
| Initial Union setup | D3, O5, Q7 | Same | Preserve source keys; no invented setup relocation |

The original source map cannot define a unique spatial transformation onto the
generated artwork. This explicit minimal adaptation preserves all 82 units,
arrival turns, strength factors, and the 16-point objective total. Inspect these
locations during the next owner gameplay session; this is not a claim of
historical map equivalence.

## Acceptance and rollback

Automated checks compare every worksheet row against typed terrain, require
unique adjacent links, verify forest separation and transitive connectivity,
check entry bounds and objective totals, and exercise independent hill/woods
cancellation, mixed forests, repeated defenders, and the +10 cap.
Desktop/tablet browser checks must verify the expanded board and primary game
flow before release. See TASKS.md for actual results and remaining gates.

This uses ruleset `gettysburg-terrain-v3` and content revision
`gettysburg-painted-board-v2`. Old development saves are not migrated. Keep the
previous code revision if old data needs inspection; do not delete a database
merely to make readiness pass. Revert this change to restore the prior board
and rules. Deployment remains a separate explicit action.

## Explicit inferred edge inventory

Each pair is undirected. Missing pairs do not connect. Forest/hill pairs are in
`packages/content/src/terrain.ts`; road/rail/stream pairs are in
`packages/content/src/terrain-edges.ts`.

### Forest links

| Hex | Neighbor |
| --- | --- |
| A1 | B1 |
| B1 | C1 |
| A4 | A5 |
| A4 | B4 |
| A5 | A6 |
| A5 | B4 |
| A5 | B5 |
| A6 | A7 |
| A6 | B5 |
| A6 | B6 |
| A7 | B6 |
| B4 | B5 |
| B4 | C4 |
| B4 | C5 |
| B5 | B6 |
| B5 | C5 |
| B5 | C6 |
| B6 | C6 |
| B6 | C7 |
| C4 | C5 |
| C4 | D3 |
| C5 | C6 |
| C5 | D5 |
| C6 | C7 |
| C6 | D5 |
| C6 | D6 |
| C7 | D6 |
| D3 | E3 |
| D3 | E4 |
| D5 | D6 |
| D5 | E5 |
| E3 | E4 |
| E3 | F3 |
| E4 | E5 |
| E4 | F3 |
| E4 | F4 |
| E5 | F4 |
| E5 | F5 |
| F3 | F4 |
| F4 | F5 |
| F4 | G5 |
| F5 | F6 |
| F5 | G5 |
| F6 | F7 |
| H1 | H2 |
| H1 | I2 |
| H2 | I2 |
| I2 | J1 |
| J1 | K2 |
| K2 | L2 |
| L2 | M2 |
| M2 | N2 |
| N2 | O2 |
| O2 | P2 |
| P2 | Q2 |
| D11 | E11 |
| E11 | F11 |
| F11 | G11 |
| G11 | H11 |
| H11 | I11 |
| I11 | J10 |
| I11 | J11 |
| J10 | J11 |
| J10 | K10 |
| J10 | K11 |
| J11 | K11 |
| K10 | K11 |
| K10 | L10 |
| K11 | L10 |
| K11 | L11 |
| L10 | L11 |
| L10 | M10 |
| L10 | M11 |
| L11 | M11 |
| M10 | M11 |
| M10 | N10 |
| M11 | N10 |
| M11 | N11 |
| N10 | N11 |
| N10 | O10 |
| N10 | O11 |
| N11 | O11 |
| O10 | O11 |
| O10 | P9 |
| O10 | P10 |
| O11 | P10 |
| O11 | P11 |
| P9 | P10 |
| P9 | Q9 |
| P9 | Q10 |
| P10 | P11 |
| P10 | Q10 |
| P10 | Q11 |
| P11 | Q11 |
| Q9 | Q10 |
| Q9 | R9 |
| Q10 | Q11 |
| Q10 | R9 |
| Q10 | R10 |
| Q11 | R10 |
| Q11 | R11 |
| R9 | R10 |
| R9 | S10 |
| R10 | R11 |
| R10 | S10 |
| R10 | S11 |
| R11 | S11 |
| S10 | S11 |
| S10 | T9 |
| S10 | T10 |
| S11 | T10 |
| S11 | T11 |
| T9 | T10 |
| T9 | U9 |
| T9 | U10 |
| T10 | T11 |
| T10 | U10 |
| T10 | U11 |
| T11 | U11 |
| U9 | U10 |
| U9 | V9 |
| U10 | U11 |
| U10 | V9 |
| U10 | V10 |
| U11 | V10 |
| U11 | V11 |
| V9 | V10 |
| V9 | W9 |
| V9 | W10 |
| V10 | V11 |
| V10 | W10 |
| V10 | W11 |
| V11 | W11 |
| W9 | W10 |
| W10 | W11 |
| V5 | W5 |
| V5 | W6 |
| W5 | W6 |

### Hill links

| Hex | Neighbor |
| --- | --- |
| E6 | E7 |
| E6 | F5 |
| E6 | F6 |
| E7 | F6 |
| E7 | F7 |
| F5 | F6 |
| F5 | G6 |
| F6 | F7 |
| F6 | G6 |
| F6 | G7 |
| F7 | G7 |
| F7 | G8 |
| G6 | G7 |
| G6 | H6 |
| G7 | G8 |
| G7 | H6 |
| G7 | H7 |
| G8 | H7 |
| H6 | H7 |
| J6 | K6 |
| J6 | K7 |
| K6 | K7 |
| K6 | L6 |
| K7 | L6 |
| K7 | L7 |
| L6 | L7 |
| L6 | M7 |
| L7 | M7 |
| R1 | R2 |
| R1 | S1 |
| R1 | S2 |
| R2 | S2 |
| S1 | S2 |
| S5 | T4 |
| S8 | T8 |
| R9 | R10 |

### Road links

| Hex | Neighbor |
| --- | --- |
| A2 | B2 |
| A7 | B7 |
| B2 | C3 |
| B7 | C7 |
| C3 | D3 |
| C7 | D7 |
| D3 | E4 |
| D7 | E7 |
| E4 | F4 |
| E7 | E8 |
| E8 | F7 |
| F4 | G5 |
| F7 | G8 |
| G5 | H5 |
| G8 | H7 |
| H11 | I11 |
| H5 | I6 |
| H7 | H8 |
| H8 | I8 |
| I11 | J10 |
| I6 | J5 |
| I8 | J8 |
| J10 | J9 |
| J5 | K6 |
| J8 | K8 |
| J9 | K10 |
| K10 | K9 |
| K6 | L6 |
| K8 | L8 |
| K9 | L8 |
| L6 | M6 |
| L7 | L8 |
| L7 | M8 |
| L8 | M8 |
| M6 | N6 |
| M8 | N7 |
| N11 | O11 |
| N6 | O7 |
| N7 | O7 |
| O10 | O11 |
| O10 | O9 |
| O6 | O7 |
| O6 | P5 |
| O7 | O8 |
| O7 | P7 |
| O8 | O9 |
| P4 | P5 |
| P4 | Q4 |
| P7 | P8 |
| P7 | Q7 |
| P8 | Q8 |
| Q3 | Q4 |
| Q3 | R2 |
| Q7 | R7 |
| Q8 | Q9 |
| Q9 | R9 |
| R2 | S2 |
| R7 | S7 |
| R9 | S10 |
| S10 | T10 |
| S2 | T1 |
| S7 | T7 |
| T1 | U1 |
| T10 | U10 |
| T7 | U7 |
| U10 | V10 |
| U7 | V7 |
| V10 | W11 |
| V6 | V7 |
| V6 | W7 |

### Rail links

| Hex | Neighbor |
| --- | --- |
| O8 | P7 |
| O8 | P8 |
| P5 | P6 |
| P5 | Q5 |
| P6 | P7 |
| P8 | P9 |
| P9 | Q10 |
| Q10 | Q11 |
| Q11 | R11 |
| Q4 | Q5 |
| Q4 | R3 |
| R1 | S1 |
| R1 | S2 |
| R2 | R3 |
| R2 | S2 |

### Stream-crossing sides

| Hex | Neighbor |
| --- | --- |
| D1 | E1 |
| E1 | E2 |
| E2 | F1 |
| F1 | F2 |
| F2 | G2 |
| G2 | G3 |
| G3 | H2 |
| H2 | H3 |
| H2 | I3 |
| I2 | I3 |
| I2 | J2 |
| J1 | J2 |
| J2 | K2 |
| K2 | K3 |
| K3 | L2 |
| L2 | L3 |
| L3 | M3 |
| M3 | M4 |
| M4 | N3 |
| M11 | N11 |
| N3 | N4 |
| N4 | O4 |
| N10 | N11 |
| N10 | O11 |
| O4 | O5 |
| O4 | P4 |
| O10 | O11 |
| O11 | P10 |
| P3 | P4 |
| P3 | Q4 |
| P10 | P11 |
| P10 | Q11 |
| Q3 | Q4 |
| Q4 | R3 |
| Q10 | Q11 |
| Q11 | R10 |
| R3 | R4 |
| R3 | S4 |
| R10 | R11 |
| R10 | S11 |
| S3 | S4 |
| S3 | T3 |
| S10 | S11 |
| S10 | T10 |
| T2 | T3 |
| T2 | U3 |
| T9 | T10 |
| T9 | U10 |
| U2 | U3 |
| U3 | V2 |
| U9 | U10 |
| U9 | V9 |
| V2 | V3 |
| V2 | W3 |
| V8 | V9 |
| V8 | W9 |
| W2 | W3 |
| W8 | W9 |
