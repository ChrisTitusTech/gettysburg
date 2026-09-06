# Terrain adjustment review worksheet

## Approval and scope

ChrisTitusTech confirmed all painted terrain hexes on 2026-09-06 and authorized
best-guess forest connections and completion of the remaining terrain work.
B-2 and F-11 are explicitly corrected to woods, defense +2. All other A-H
coordinate rows are preserved exactly, including their original formatting.

The 253 painted hexes A-W / 1-11 replace the stretched 231-hex A-U grid for new
development games. Runtime keys now match the painted-column names, including
V and W. The owner confirmed that preserving in-progress games is unnecessary;
this is not a live or production rollout. No saved data is deleted or migrated.

The source is the approved tracked artwork
`apps/web/src/assets/gettysburg-board-deluxe.png`. The older
`gettysburg-board-deluxe-with-hexvalues.png` has displaced A-U labels and is
obsolete for coordinate verification. Count painted columns from the left and
rows from the top of each column, or use the corrected interactive A-W board.
The protected `gameboard.jpg` remains ignored and is not the terrain authority.

`packages/content/src/terrain.ts` transcribes this table and explicitly lists
inferred forest and hill links. Region membership is derived only from those
links, never from woods adjacency alone. See [terrain connections and scenario
mapping](TERRAIN_CONNECTIONS.md) for the assumptions and remaining movement work.

## Defense interpretation

| Terrain | Defense | Basis |
| --- | ---: | --- |
| Plains | 0 | No terrain protection |
| Woods | +2 | Owner override of the printed +1 woods rule |
| Standard hill | +2 | Owner baseline and Rules2.pdf rule 4b2 |
| Standard wooded hill | +2 maximum | Approved non-additive total |
| Rough hill without woods | +4 | Owner-verified values |
| Rough hill with woods | +4 maximum | +2 hill component and +2 woods component |
| Town | +1 | Rules2.pdf rule 4b4, applied to all mapped town hexes |

The printed rules supply town +1; the image identifies its footprint at O-7,
O-8, and P-7. Roads, rails, bridges, and streams provide no additional hex-defense
bonus in this pass.

Within one skirmish, a participating attacker in the same connected forest
cancels the woods +2 for each defender in that forest. Defenders in a disconnected
forest remain eligible. The same connected-hill test independently cancels hill
protection (Rules2.pdf rule 4b2). A connected region can span multiple hexes;
only participating attackers trigger cancellation.

For a +4 wooded rough hill, sharing only its forest leaves +2 hill protection;
sharing only its hill leaves +2 woods protection; sharing both leaves 0.
A standard wooded hill never exceeds its approved +2 total. Each defending hex
uses its eligible components up to its approved total, and the skirmish takes
the highest such adjustment. Different defending hexes do not stack bonuses.
This strongest-hex interpretation resolves the previously open mixed-terrain
case conservatively. Unit factors plus terrain are capped together at +10.

The +4 split, strongest-hex interpretation, and inferred links are implementation
assumptions under the owner's instruction to finish the remaining work, not
claims that every new detail was individually manually verified.

## Scenario alignment

The Culp's Hill objective moves from old M9 to painted R10 with its value of 3.
The other seven objective keys and values remain, totaling 16 points.
Right-edge reinforcement entries U7/U10 move to W7/W10. The S1 railroad entry,
A1/A8/I11 entries, initial D3/O5/Q7 setup, unit counts, and schedules remain.
These are explicit development-map adaptations, not a retranscription of the
original source board. The corrected board must receive desktop/tablet gameplay
acceptance before any release claim.

## Coordinate review table

The table preserves the owner's original A-H spacing. Only its table-spacing
lint rule is disabled; the terrain values remain covered by executable tests.

<!-- markdownlint-disable MD060 -->

| Display coordinate | Runtime key | Terrain | Defense adjustment | Feature or review note | Owner verified |
| --- | --- | --- | ---: | --- | :---: |
| `A-1` | `A1` | standard wooded hill  | +2 |  | [x] |
| `A-2` | `A2` | plains | 0 | - | [x] |
| `A-3` | `A3` | plains | 0 | - | [x] |
| `A-4` | `A4` | woods | +2 |  | [x] |
| `A-5` | `A5` | woods  | +2 |  | [x] |
| `A-6` | `A6` | woods  | +2 |  | [x] |
| `A-7` | `A7` | woods  | +2 |  | [x] |
| `A-8` | `A8` | plains | 0 |  | [x ] |
| `A-9` | `A9` | plains | 0 | - | [x] |
| `A-10` | `A10` | plains  | 0 | - | [x] |
| `A-11` | `A11` | plains | 0 | - | [x] |
| `B-1` | `B1` | woods | +2 |  | [x] |
| `B-2` | `B2` | woods | +2 | Owner correction, 2026-09-06 | [x] |
| `B-3` | `B3` | plains | 0 | - | [x] |
| `B-4` | `B4` | woods  | +2 |  | [x] |
| `B-5` | `B5` | woods  | +2 |  | [x] |
| `B-6` | `B6` | woods  | +2 |  | [x] |
| `B-7` | `B7` | plains | 0 |  | [x] |
| `B-8` | `B8` | plains | 0 |  | [x] |
| `B-9` | `B9` | plains | 0 |  | [x] |
| `B-10` | `B10` | plains | 0 |  | [x] |
| `B-11` | `B11` | plains | 0 |  | [x] |
| `C-1` | `C1` | woods  | +2 |  | [x] |
| `C-2` | `C2` | plains  | 0 |  | [x] |
| `C-3` | `C3` | hill | +2 | - | [x] |
| `C-4` | `C4` | woods  | +2 |  | [x] |
| `C-5` | `C5` | woods  | +2 |  | [x] |
| `C-6` | `C6` | woods  | +2 |  | [x] |
| `C-7` | `C7` | woods  | +2 |  | [x] |
| `C-8` | `C8` | woods  | +2 |  | [x] |
| `C-9` | `C9` | woods | +2 | - | [x] |
| `C-10` | `C10` | woods | +2 | - | [x] |
| `C-11` | `C11` | woods | +2 | - | [x] |
| `D-1` | `D1` | plains  | 0 |  | [x] |
| `D-2` | `D2` | plains | 0 | - | [x] |
| `D-3` | `D3` | woods  | +2 |  | [x] |
| `D-4` | `D4` | plains | 0 |  | [x] |
| `D-5` | `D5` | woods  | +2 |  | [x] |
| `D-6` | `D6` | woods  | +2 |  | [x] |
| `D-7` | `D7` | plains | 0 | - | [x] |
| `D-8` | `D8` | woods | +2 | - | [x] |
| `D-9` | `D9` | woods | +2 | - | [x] |
| `D-10` | `D10` | woods | +2 | - | [x] |
| `D-11` | `D11` | woods | +2 | - | [x] |
| `E-1` | `E1` | plains | 0 | - | [x] |
| `E-2` | `E2` | plains | 0 | - | [x] |
| `E-3` | `E3` | woods  | +2 | Battle Manual woods example;  | [x] |
| `E-4` | `E4` | woods  | +2 |  | [x] |
| `E-5` | `E5` | woods  | +2 | Battle Manual woods example;  | [x] |
| `E-6` | `E6` | rough hill  | +4 | Big Round Top | [x] |
| `E-7` | `E7` | rough hill | +4 |  | [x] |
| `E-8` | `E8` | plains | 0 | - | [x] |
| `E-9` | `E9` | woods | +2 | - | [x] |
| `E-10` | `E10` | plains | 0 | - | [x] |
| `E-11` | `E11` | woods  | +2 |  | [x] |
| `F-1` | `F1` | plains | 0 | - | [x] |
| `F-2` | `F2` | plains | 0 | Battle Manual woods example;  | [x] |
| `F-3` | `F3` | woods  | +2 | Battle Manual woods example;  | [x] |
| `F-4` | `F4` | woods  | +2 | Battle Manual woods example;  | [x] |
| `F-5` | `F5` | rough hill + woods  | +4 | Devil's Den rocky/wooded area | [x] |
| `F-6` | `F6` | rough hill + woods  | +4 | Little Round Top objective | [x] |
| `F-7` | `F7` | rough hill + woods  | +4 | Little Round Top objective | [x] |
| `F-8` | `F8` | plains | 0 | - | [x] |
| `F-9` | `F9` | plains | 0 | - | [x] |
| `F-10` | `F10` | plains | 0 | - | [x] |
| `F-11` | `F11` | woods | +2 | Owner correction, 2026-09-06 | [x] |
| `G-1` | `G1` | plains | 0 | - | [x] |
| `G-2` | `G2` | plains | 0 | - | [x] |
| `G-3` | `G3` | plains | 0 |  | [x] |
| `G-4` | `G4` | standard hill  | +2 |  | [x] |
| `G-5` | `G5` | woods  | +2 |  | [x] |
| `G-6` | `G6` | rough hill | +4 |  | [x] |
| `G-7` | `G7` | rough hill | +4 |  | [x] |
| `G-8` | `G8` | rough hill | +4 |  | [x] |
| `G-9` | `G9` | plains | 0 |  | [x] |
| `G-10` | `G10` | plains | 0 |  | [x] |
| `G-11` | `G11` | woods | +2 | - | [x] |
| `H-1` | `H1` | woods | +2 | - | [x] |
| `H-2` | `H2` | woods | +2 | - | [x] |
| `H-3` | `H3` | plains  | 0 |  | [x] |
| `H-4` | `H4` | plains  | 0 |  | [x] |
| `H-5` | `H5` | plains  | 0 |  | [x] |
| `H-6` | `H6` | rough hill  | +4 |  | [x] |
| `H-7` | `H7` | rough hill  | +4 |  | [x] |
| `H-8` | `H8` | plains | 0 | - | [x] |
| `H-9` | `H9` | plains | 0 |  | [x] |
| `H-10` | `H10` | plains | 0 |  | [x] |
| `H-11` | `H11` | woods | +2 | - | [x] |
| `I-1` | `I1` | plains | 0 | - | [x] |
| `I-2` | `I2` | woods | +2 | Northern forest band | [x] |
| `I-3` | `I3` | plains | 0 | - | [x] |
| `I-4` | `I4` | plains | 0 | Sparse brush, not dense woods | [x] |
| `I-5` | `I5` | plains | 0 | - | [x] |
| `I-6` | `I6` | plains | 0 | - | [x] |
| `I-7` | `I7` | plains | 0 | - | [x] |
| `I-8` | `I8` | plains | 0 | - | [x] |
| `I-9` | `I9` | plains | 0 | - | [x] |
| `I-10` | `I10` | plains | 0 | - | [x] |
| `I-11` | `I11` | woods | +2 | Southern forest band | [x] |
| `J-1` | `J1` | woods | +2 | Northern forest band | [x] |
| `J-2` | `J2` | plains | 0 | Stream along forest edge; mostly open | [x] |
| `J-3` | `J3` | plains | 0 | Sparse brush | [x] |
| `J-4` | `J4` | plains | 0 | - | [x] |
| `J-5` | `J5` | plains | 0 | - | [x] |
| `J-6` | `J6` | standard hill | +2 | Cemetery Hill, western lobe | [x] |
| `J-7` | `J7` | plains | 0 | - | [x] |
| `J-8` | `J8` | plains | 0 | - | [x] |
| `J-9` | `J9` | plains | 0 | - | [x] |
| `J-10` | `J10` | woods | +2 | Forest fringe | [x] |
| `J-11` | `J11` | woods | +2 | - | [x] |
| `K-1` | `K1` | plains | 0 | - | [x] |
| `K-2` | `K2` | woods | +2 | Northern forest band | [x] |
| `K-3` | `K3` | plains | 0 | - | [x] |
| `K-4` | `K4` | plains | 0 | Sparse brush | [x] |
| `K-5` | `K5` | plains | 0 | - | [x] |
| `K-6` | `K6` | standard hill | +2 | Cemetery Hill, northern edge | [x] |
| `K-7` | `K7` | standard hill | +2 | Cemetery Hill | [x] |
| `K-8` | `K8` | plains | 0 | - | [x] |
| `K-9` | `K9` | plains | 0 | - | [x] |
| `K-10` | `K10` | woods | +2 | - | [x] |
| `K-11` | `K11` | woods | +2 | - | [x] |
| `L-1` | `L1` | plains | 0 | Small canopy fringe at lower edge | [x] |
| `L-2` | `L2` | woods | +2 | Northern forest band | [x] |
| `L-3` | `L3` | plains | 0 | Isolated trees by stream | [x] |
| `L-4` | `L4` | plains | 0 | Sparse brush | [x] |
| `L-5` | `L5` | plains | 0 | - | [x] |
| `L-6` | `L6` | standard hill | +2 | Cemetery Hill | [x] |
| `L-7` | `L7` | standard hill | +2 | Cemetery Hill, southern slope | [x] |
| `L-8` | `L8` | plains | 0 | - | [x] |
| `L-9` | `L9` | plains | 0 | - | [x] |
| `L-10` | `L10` | woods | +2 | - | [x] |
| `L-11` | `L11` | woods | +2 | - | [x] |
| `M-1` | `M1` | plains | 0 | - | [x] |
| `M-2` | `M2` | woods | +2 | Northern forest band | [x] |
| `M-3` | `M3` | plains | 0 | - | [x] |
| `M-4` | `M4` | plains | 0 | Sparse brush; stream nearby | [x] |
| `M-5` | `M5` | plains | 0 | Sparse brush | [x] |
| `M-6` | `M6` | plains | 0 | Cemetery Hill touches southern edge | [x] |
| `M-7` | `M7` | standard hill | +2 | Cemetery Hill, eastern lobe | [x] |
| `M-8` | `M8` | plains | 0 | - | [x] |
| `M-9` | `M9` | plains | 0 | Open ground; Culp's Hill objective relocated to R-10 | [x] |
| `M-10` | `M10` | woods | +2 | - | [x] |
| `M-11` | `M11` | woods | +2 | - | [x] |
| `N-1` | `N1` | plains | 0 | - | [x] |
| `N-2` | `N2` | woods | +2 | Northern forest band | [x] |
| `N-3` | `N3` | plains | 0 | - | [x] |
| `N-4` | `N4` | plains | 0 | - | [x] |
| `N-5` | `N5` | plains | 0 | Sparse brush | [x] |
| `N-6` | `N6` | plains | 0 | Gettysburg buildings near eastern edge | [x] |
| `N-7` | `N7` | plains | 0 | Gettysburg buildings near eastern edge | [x] |
| `N-8` | `N8` | plains | 0 | - | [x] |
| `N-9` | `N9` | plains | 0 | - | [x] |
| `N-10` | `N10` | woods | +2 | - | [x] |
| `N-11` | `N11` | woods | +2 | - | [x] |
| `O-1` | `O1` | plains | 0 | - | [x] |
| `O-2` | `O2` | woods | +2 | Northern forest band | [x] |
| `O-3` | `O3` | plains | 0 | Sparse brush below forest | [x] |
| `O-4` | `O4` | plains | 0 | Stream and woodland fringe to east | [x] |
| `O-5` | `O5` | plains | 0 | Woodland fringe to northeast | [x] |
| `O-6` | `O6` | plains | 0 | - | [x] |
| `O-7` | `O7` | town | +1 | Rules2.pdf, rule 4b4; applied to mapped town footprint | [x] |
| `O-8` | `O8` | town | +1 | Rules2.pdf, rule 4b4; applied to mapped town footprint | [x] |
| `O-9` | `O9` | plains | 0 | Forest reaches southern edge | [x] |
| `O-10` | `O10` | woods | +2 | - | [x] |
| `O-11` | `O11` | woods | +2 | - | [x] |
| `P-1` | `P1` | plains | 0 | - | [x] |
| `P-2` | `P2` | woods | +2 | Northern forest band | [x] |
| `P-3` | `P3` | plains | 0 | - | [x] |
| `P-4` | `P4` | woods | +2 | Woods beside road and stream | [x] |
| `P-5` | `P5` | plains | 0 | - | [x] |
| `P-6` | `P6` | plains | 0 | Buildings reach southern edge | [x] |
| `P-7` | `P7` | town | +1 | Rules2.pdf, rule 4b4; applied to mapped town footprint | [x] |
| `P-8` | `P8` | plains | 0 | - | [x] |
| `P-9` | `P9` | woods | +2 | Southern forest band | [x] |
| `P-10` | `P10` | woods | +2 | - | [x] |
| `P-11` | `P11` | woods | +2 | - | [x] |
| `Q-1` | `Q1` | plains | 0 | - | [x] |
| `Q-2` | `Q2` | woods | +2 | Northern forest band | [x] |
| `Q-3` | `Q3` | plains | 0 | - | [x] |
| `Q-4` | `Q4` | plains | 0 | Sparse brush beside railroad | [x] |
| `Q-5` | `Q5` | plains | 0 | - | [x] |
| `Q-6` | `Q6` | plains | 0 | - | [x] |
| `Q-7` | `Q7` | plains | 0 | - | [x] |
| `Q-8` | `Q8` | plains | 0 | - | [x] |
| `Q-9` | `Q9` | woods | +2 | Northern forest fringe | [x] |
| `Q-10` | `Q10` | woods | +2 | - | [x] |
| `Q-11` | `Q11` | woods | +2 | - | [x] |
| `R-1` | `R1` | standard hill | +2 | Northern ridge | [x] |
| `R-2` | `R2` | standard hill | +2 | Northern ridge | [x] |
| `R-3` | `R3` | plains | 0 | Stream/rail crossing; underlying open ground | [x] |
| `R-4` | `R4` | woods | +2 | Isolated dense woodland | [x] |
| `R-5` | `R5` | plains | 0 | - | [x] |
| `R-6` | `R6` | plains | 0 | Sparse brush | [x] |
| `R-7` | `R7` | plains | 0 | - | [x] |
| `R-8` | `R8` | plains | 0 | - | [x] |
| `R-9` | `R9` | rough hill + woods | +4 | Culp's Hill, wooded northern shoulder | [x] |
| `R-10` | `R10` | rough hill + woods | +4 | Culp's Hill, wooded height | [x] |
| `R-11` | `R11` | woods | +2 | - | [x] |
| `S-1` | `S1` | standard hill | +2 | Northern ridge beside railroad | [x] |
| `S-2` | `S2` | standard hill | +2 | Northern ridge, eastern slope | [x] |
| `S-3` | `S3` | plains | 0 | - | [x] |
| `S-4` | `S4` | plains | 0 | Sparse brush | [x] |
| `S-5` | `S5` | standard hill | +2 | Small brown hill with sparse brush | [x] |
| `S-6` | `S6` | plains | 0 | - | [x] |
| `S-7` | `S7` | plains | 0 | - | [x] |
| `S-8` | `S8` | standard hill | +2 | Isolated southern hill | [x] |
| `S-9` | `S9` | plains | 0 | Hill fringe at northern edge | [x] |
| `S-10` | `S10` | woods | +2 | Woods east of Culp's Hill | [x] |
| `S-11` | `S11` | woods | +2 | - | [x] |
| `T-1` | `T1` | plains | 0 | - | [x] |
| `T-2` | `T2` | plains | 0 | - | [x] |
| `T-3` | `T3` | plains | 0 | Sparse brush by stream | [x] |
| `T-4` | `T4` | standard hill | +2 | Small hill fringe at southwest edge | [x] |
| `T-5` | `T5` | plains | 0 | - | [x] |
| `T-6` | `T6` | plains | 0 | - | [x] |
| `T-7` | `T7` | plains | 0 | Sparse brush | [x] |
| `T-8` | `T8` | standard hill | +2 | Isolated hill, eastern fringe | [x] |
| `T-9` | `T9` | woods | +2 | Woods along stream | [x] |
| `T-10` | `T10` | woods | +2 | - | [x] |
| `T-11` | `T11` | woods | +2 | - | [x] |
| `U-1` | `U1` | standard hill | +2 | Small northern hill crossed by road | [x] |
| `U-2` | `U2` | plains | 0 | - | [x] |
| `U-3` | `U3` | plains | 0 | - | [x] |
| `U-4` | `U4` | plains | 0 | - | [x] |
| `U-5` | `U5` | woods | +2 | Isolated dense woodland | [x] |
| `U-6` | `U6` | plains | 0 | - | [x] |
| `U-7` | `U7` | plains | 0 | - | [x] |
| `U-8` | `U8` | plains | 0 | - | [x] |
| `U-9` | `U9` | woods | +2 | Woods beside stream | [x] |
| `U-10` | `U10` | woods | +2 | - | [x] |
| `U-11` | `U11` | woods | +2 | - | [x] |
| `V-1` | `V1` | plains | 0 | Sparse brush | [x] |
| `V-2` | `V2` | plains | 0 | - | [x] |
| `V-3` | `V3` | plains | 0 | - | [x] |
| `V-4` | `V4` | plains | 0 | - | [x] |
| `V-5` | `V5` | woods | +2 | Eastern woodland fringe | [x] |
| `V-6` | `V6` | plains | 0 | - | [x] |
| `V-7` | `V7` | plains | 0 | - | [x] |
| `V-8` | `V8` | woods | +2 | Isolated woods beside stream | [x] |
| `V-9` | `V9` | woods | +2 | Southern forest band | [x] |
| `V-10` | `V10` | woods | +2 | - | [x] |
| `V-11` | `V11` | woods | +2 | - | [x] |
| `W-1` | `W1` | woods | +2 | Northeastern woods | [x] |
| `W-2` | `W2` | plains | 0 | - | [x] |
| `W-3` | `W3` | plains | 0 | - | [x] |
| `W-4` | `W4` | plains | 0 | - | [x] |
| `W-5` | `W5` | woods | +2 | Eastern woods | [x] |
| `W-6` | `W6` | woods | +2 | Woodland tapering into sparse brush | [x] |
| `W-7` | `W7` | plains | 0 | - | [x] |
| `W-8` | `W8` | plains | 0 | - | [x] |
| `W-9` | `W9` | woods | +2 | Southern forest fringe | [x] |
| `W-10` | `W10` | woods | +2 | - | [x] |
| `W-11` | `W11` | woods | +2 | - | [x] |

<!-- markdownlint-enable MD060 -->
