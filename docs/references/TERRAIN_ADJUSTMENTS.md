# Terrain adjustment review worksheet

## Purpose

This is the owner-review worksheet for the 231 board coordinates from `A-1`
through `U-11`. It records proposed terrain and defensive combat adjustments
without changing authoritative game data. The protected `gameboard.jpg` remains
the visual source; it must stay ignored and outside Git.

The display syntax requested for review is:

```text
A-1 = hill; defense +2
```

Runtime content uses the compact key `A1`. The table records both forms so an
approved row can later be transcribed without coordinate ambiguity.

## Status and approval boundary

Every row is unverified until the project owner checks its box and replaces any
non-exact value - including `TBD`, a minimum, an inequality, or a range - with
one exact integer. The three named landmark rows are a visual draft from the
protected board, not approved rules data. This pull request does not change
`packages/content`, combat calculations, saved games, or the deployed service.

A checked box in the priority landmark table confirms only the landmark's
coordinate and rough-hill/woods identification. It does not approve a
non-exact modifier. Final terrain approval occurs only in the coordinate review
table after one exact integer replaces the placeholder and the row is checked.

The standard hill and woods entries below are visual drafts transcribed from the
protected board. The presentation-only coordinate inventory in
`apps/web/src/BoardTerrain.tsx` was used as a comparison aid, not as source fact.
The protected board and explicit coordinate examples in
`gettysburg-battle-manual_OCR.pdf` control when the two disagree. Those examples
confirm woods in `D4`, `E3`, `E5`, `F2`, `F3`, `F4`, and `H4`; they also confirm
both hill and woods in `P3`. Where a standard hill and woods share a hex, the
worksheet records both features but applies one non-additive `+2` draft. Rough
hills and prominent landmarks keep their separate owner-review values.

After owner review, a separate implementation change must:

1. Transcribe only checked rows into typed content.
2. Record forest connections, stream crossings, and road/rail links at each hex
   side separately from hex terrain.
3. Add table-driven content and combat tests.
4. Assign a new immutable rules/content version before enforcement.
5. Keep existing games on their starting version.

## Proposed defensive-adjustment legend

These values are review proposals based on the owner's direction. They do not
become authoritative merely by appearing here.

| Terrain or feature | Proposed defense adjustment | Review note |
| --- | ---: | --- |
| Clear | +0 | Confirm that no other feature changes defense |
| Standard hill | +2 | Owner-provided baseline |
| Woods/forest | +2 | Owner-provided baseline |
| Standard wooded hill | +2 | Non-additive draft; owner confirms the terrain combination |
| Rough hill or prominent rocky/wooded height | +3 minimum | Owner sets the exact value; Culp's Hill and the Round Tops are priority reviews |
| Town | TBD | Confirm the Battle Manual interpretation |
| Road or railroad | No standalone defense value proposed | Record the underlying hex terrain and link separately |
| Stream | No hex value proposed | Record the crossed hexside and its rule separately |

Feature values are not automatically additive. A wooded hill does not become
`+4` unless the owner explicitly approves that total. Each row receives one
reviewed defensive adjustment, subject to the existing overall combat-modifier
cap.

Connected or adjacent hexes of the same terrain do not multiply that adjustment.
Within one combat skirmish, repeated standard hill or woods/forest terrain on
participating defending hexes contributes its `+2` adjustment only once, not
once per hex or unit. Matching terrain in an adjacent hex outside the skirmish
provides no adjustment. Separate skirmishes calculate their terrain adjustment
independently. How different terrain types interact in one multi-hex defense
remains an owner-review decision.

A forest is one continuous region of woods-containing hexes linked only across a
shared hex side where the reviewed map artwork shows the woods continuing through
that side. Adjacent woods hexes without that visual connection belong to
different forests. Wooded-hill and rough-hill-plus-woods hexes participate only
across sides where their woods artwork connects. These links require a separate
owner-reviewed hex-side transcription; the coordinate table alone cannot infer
them. Evaluate each participating defending woods hex: it is eligible for woods
defense only when no participating attacker occupies the same connected forest.
The defending side receives its single woods/forest `+2` only when at least one
participating defending woods hex remains eligible. Thus, an attacker cancels
woods protection for every defender in that same forest but not for a defender
in a disconnected forest. If no defending woods hex remains eligible, the
skirmish receives no woods adjustment. This cancellation affects only woods; a
standard or rough hill may still supply its approved adjustment.

## Priority landmark review

| Display coordinate | Runtime key | Visual draft | Proposed defense | Owner landmark confirmation |
| --- | --- | --- | ---: | --- |
| `E-6` | `E6` | Big Round Top candidate; rough hill and woods | +3 minimum | [x] Coordinate/terrain confirmed; exact integer pending |
| `F-6` | `F6` | Little Round Top objective; rough hill and woods | +3 minimum | [x] Coordinate/terrain confirmed; exact integer pending |
| `M-9` | `M9` | Culp's Hill objective; rough hill and woods | +3 minimum | [x] Coordinate/terrain confirmed; exact integer pending |

## Coordinate review table

| Display coordinate | Runtime key | Terrain draft | Defense adjustment | Feature or review note | Owner verified |
| --- | --- | --- | ---: | --- | :---: |
| `A-1` | `A1` | standard wooded hill (map draft) | +2 | Protected board visual draft; non-additive; owner verify | [ ] |
| `A-2` | `A2` | unverified | TBD | - | [ ] |
| `A-3` | `A3` | unverified | TBD | - | [ ] |
| `A-4` | `A4` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `A-5` | `A5` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `A-6` | `A6` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `A-7` | `A7` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `A-8` | `A8` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `A-9` | `A9` | unverified | TBD | - | [ ] |
| `A-10` | `A10` | unverified | TBD | - | [ ] |
| `A-11` | `A11` | unverified | TBD | - | [ ] |
| `B-1` | `B1` | standard wooded hill (map draft) | +2 | Protected board visual draft; non-additive; owner verify | [ ] |
| `B-2` | `B2` | unverified | TBD | - | [ ] |
| `B-3` | `B3` | unverified | TBD | - | [ ] |
| `B-4` | `B4` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `B-5` | `B5` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `B-6` | `B6` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `B-7` | `B7` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `B-8` | `B8` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `B-9` | `B9` | unverified | TBD | - | [ ] |
| `B-10` | `B10` | unverified | TBD | - | [ ] |
| `B-11` | `B11` | unverified | TBD | - | [ ] |
| `C-1` | `C1` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `C-2` | `C2` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `C-3` | `C3` | unverified | TBD | - | [ ] |
| `C-4` | `C4` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `C-5` | `C5` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `C-6` | `C6` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `C-7` | `C7` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `C-8` | `C8` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `C-9` | `C9` | unverified | TBD | - | [ ] |
| `C-10` | `C10` | unverified | TBD | - | [ ] |
| `C-11` | `C11` | unverified | TBD | - | [ ] |
| `D-1` | `D1` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `D-2` | `D2` | unverified | TBD | - | [ ] |
| `D-3` | `D3` | standard wooded hill (map draft) | +2 | Protected board visual draft; non-additive; owner verify | [ ] |
| `D-4` | `D4` | woods (map draft) | +2 | Source example confirms woods; owner verify | [ ] |
| `D-5` | `D5` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `D-6` | `D6` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `D-7` | `D7` | unverified | TBD | - | [ ] |
| `D-8` | `D8` | unverified | TBD | - | [ ] |
| `D-9` | `D9` | unverified | TBD | - | [ ] |
| `D-10` | `D10` | unverified | TBD | - | [ ] |
| `D-11` | `D11` | unverified | TBD | - | [ ] |
| `E-1` | `E1` | unverified | TBD | - | [ ] |
| `E-2` | `E2` | unverified | TBD | - | [ ] |
| `E-3` | `E3` | woods (map draft) | +2 | Source example confirms woods; owner verify | [ ] |
| `E-4` | `E4` | standard wooded hill (map draft) | +2 | Protected board visual draft; non-additive; owner verify | [ ] |
| `E-5` | `E5` | woods (map draft) | +2 | Source example confirms woods; owner verify | [ ] |
| `E-6` | `E6` | rough hill + woods (map draft) | >= +3 | Big Round Top candidate; exact integer pending | [ ] |
| `E-7` | `E7` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `E-8` | `E8` | unverified | TBD | - | [ ] |
| `E-9` | `E9` | unverified | TBD | - | [ ] |
| `E-10` | `E10` | unverified | TBD | - | [ ] |
| `E-11` | `E11` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `F-1` | `F1` | unverified | TBD | - | [ ] |
| `F-2` | `F2` | woods (map draft) | +2 | Source example confirms woods; owner verify | [ ] |
| `F-3` | `F3` | standard wooded hill (map draft) | +2 | Source example confirms woods; owner verify | [ ] |
| `F-4` | `F4` | woods (map draft) | +2 | Source example confirms woods; owner verify | [ ] |
| `F-5` | `F5` | rough hill + woods (map draft) | >= +3 | Devil's Den rocky/wooded area; exact integer pending | [ ] |
| `F-6` | `F6` | rough hill + woods (map draft) | >= +3 | Little Round Top objective; exact integer pending | [ ] |
| `F-7` | `F7` | unverified | TBD | - | [ ] |
| `F-8` | `F8` | unverified | TBD | - | [ ] |
| `F-9` | `F9` | unverified | TBD | - | [ ] |
| `F-10` | `F10` | unverified | TBD | - | [ ] |
| `F-11` | `F11` | unverified | TBD | - | [ ] |
| `G-1` | `G1` | unverified | TBD | - | [ ] |
| `G-2` | `G2` | unverified | TBD | - | [ ] |
| `G-3` | `G3` | standard wooded hill (map draft) | +2 | Protected board visual draft; non-additive; owner verify | [ ] |
| `G-4` | `G4` | standard hill (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `G-5` | `G5` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `G-6` | `G6` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `G-7` | `G7` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `G-8` | `G8` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `G-9` | `G9` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `G-10` | `G10` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `G-11` | `G11` | unverified | TBD | - | [ ] |
| `H-1` | `H1` | unverified | TBD | - | [ ] |
| `H-2` | `H2` | unverified | TBD | - | [ ] |
| `H-3` | `H3` | standard wooded hill (map draft) | +2 | Protected board visual draft; non-additive; owner verify | [ ] |
| `H-4` | `H4` | standard wooded hill (map draft) | +2 | Source example confirms woods; map shows hill | [ ] |
| `H-5` | `H5` | standard hill (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `H-6` | `H6` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `H-7` | `H7` | standard wooded hill (map draft) | +2 | Protected board visual draft; non-additive; owner verify | [ ] |
| `H-8` | `H8` | unverified | TBD | - | [ ] |
| `H-9` | `H9` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `H-10` | `H10` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `H-11` | `H11` | unverified | TBD | - | [ ] |
| `I-1` | `I1` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `I-2` | `I2` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `I-3` | `I3` | standard wooded hill (map draft) | +2 | Protected board visual draft; non-additive; owner verify | [ ] |
| `I-4` | `I4` | unverified | TBD | - | [ ] |
| `I-5` | `I5` | unverified | TBD | - | [ ] |
| `I-6` | `I6` | unverified | TBD | - | [ ] |
| `I-7` | `I7` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `I-8` | `I8` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `I-9` | `I9` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `I-10` | `I10` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `I-11` | `I11` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `J-1` | `J1` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `J-2` | `J2` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `J-3` | `J3` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `J-4` | `J4` | unverified | TBD | - | [ ] |
| `J-5` | `J5` | unverified | TBD | - | [ ] |
| `J-6` | `J6` | unverified | TBD | - | [ ] |
| `J-7` | `J7` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `J-8` | `J8` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `J-9` | `J9` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `J-10` | `J10` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `J-11` | `J11` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `K-1` | `K1` | unverified | TBD | - | [ ] |
| `K-2` | `K2` | unverified | TBD | - | [ ] |
| `K-3` | `K3` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `K-4` | `K4` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `K-5` | `K5` | unverified | TBD | - | [ ] |
| `K-6` | `K6` | standard hill (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `K-7` | `K7` | standard hill (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `K-8` | `K8` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `K-9` | `K9` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `K-10` | `K10` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `K-11` | `K11` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `L-1` | `L1` | unverified | TBD | - | [ ] |
| `L-2` | `L2` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `L-3` | `L3` | unverified | TBD | - | [ ] |
| `L-4` | `L4` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `L-5` | `L5` | unverified | TBD | - | [ ] |
| `L-6` | `L6` | standard hill (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `L-7` | `L7` | standard hill (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `L-8` | `L8` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `L-9` | `L9` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `L-10` | `L10` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `L-11` | `L11` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `M-1` | `M1` | unverified | TBD | - | [ ] |
| `M-2` | `M2` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `M-3` | `M3` | unverified | TBD | - | [ ] |
| `M-4` | `M4` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `M-5` | `M5` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `M-6` | `M6` | unverified | TBD | - | [ ] |
| `M-7` | `M7` | standard hill (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `M-8` | `M8` | unverified | TBD | - | [ ] |
| `M-9` | `M9` | rough hill + woods (map draft) | >= +3 | Culp's Hill objective; exact integer pending | [ ] |
| `M-10` | `M10` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `M-11` | `M11` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `N-1` | `N1` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `N-2` | `N2` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `N-3` | `N3` | unverified | TBD | - | [ ] |
| `N-4` | `N4` | unverified | TBD | - | [ ] |
| `N-5` | `N5` | unverified | TBD | - | [ ] |
| `N-6` | `N6` | unverified | TBD | - | [ ] |
| `N-7` | `N7` | unverified | TBD | - | [ ] |
| `N-8` | `N8` | unverified | TBD | - | [ ] |
| `N-9` | `N9` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `N-10` | `N10` | unverified | TBD | - | [ ] |
| `N-11` | `N11` | unverified | TBD | - | [ ] |
| `O-1` | `O1` | unverified | TBD | - | [ ] |
| `O-2` | `O2` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `O-3` | `O3` | unverified | TBD | - | [ ] |
| `O-4` | `O4` | unverified | TBD | - | [ ] |
| `O-5` | `O5` | unverified | TBD | - | [ ] |
| `O-6` | `O6` | unverified | TBD | - | [ ] |
| `O-7` | `O7` | unverified | TBD | - | [ ] |
| `O-8` | `O8` | unverified | TBD | - | [ ] |
| `O-9` | `O9` | unverified | TBD | - | [ ] |
| `O-10` | `O10` | unverified | TBD | - | [ ] |
| `O-11` | `O11` | unverified | TBD | - | [ ] |
| `P-1` | `P1` | standard wooded hill (map draft) | +2 | Protected board visual draft; non-additive; owner verify | [ ] |
| `P-2` | `P2` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `P-3` | `P3` | standard wooded hill (map draft) | +2 | Source example confirms hill and woods; owner verify | [ ] |
| `P-4` | `P4` | unverified | TBD | - | [ ] |
| `P-5` | `P5` | unverified | TBD | - | [ ] |
| `P-6` | `P6` | unverified | TBD | - | [ ] |
| `P-7` | `P7` | unverified | TBD | - | [ ] |
| `P-8` | `P8` | unverified | TBD | - | [ ] |
| `P-9` | `P9` | unverified | TBD | - | [ ] |
| `P-10` | `P10` | unverified | TBD | - | [ ] |
| `P-11` | `P11` | unverified | TBD | - | [ ] |
| `Q-1` | `Q1` | standard wooded hill (map draft) | +2 | Protected board visual draft; non-additive; owner verify | [ ] |
| `Q-2` | `Q2` | standard wooded hill (map draft) | +2 | Protected board visual draft; non-additive; owner verify | [ ] |
| `Q-3` | `Q3` | unverified | TBD | - | [ ] |
| `Q-4` | `Q4` | unverified | TBD | - | [ ] |
| `Q-5` | `Q5` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `Q-6` | `Q6` | unverified | TBD | - | [ ] |
| `Q-7` | `Q7` | unverified | TBD | - | [ ] |
| `Q-8` | `Q8` | unverified | TBD | - | [ ] |
| `Q-9` | `Q9` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `Q-10` | `Q10` | unverified | TBD | - | [ ] |
| `Q-11` | `Q11` | unverified | TBD | - | [ ] |
| `R-1` | `R1` | standard hill (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `R-2` | `R2` | standard hill (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `R-3` | `R3` | unverified | TBD | - | [ ] |
| `R-4` | `R4` | unverified | TBD | - | [ ] |
| `R-5` | `R5` | standard hill (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `R-6` | `R6` | unverified | TBD | - | [ ] |
| `R-7` | `R7` | unverified | TBD | - | [ ] |
| `R-8` | `R8` | unverified | TBD | - | [ ] |
| `R-9` | `R9` | unverified | TBD | - | [ ] |
| `R-10` | `R10` | unverified | TBD | - | [ ] |
| `R-11` | `R11` | unverified | TBD | - | [ ] |
| `S-1` | `S1` | unverified | TBD | - | [ ] |
| `S-2` | `S2` | standard hill (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `S-3` | `S3` | unverified | TBD | - | [ ] |
| `S-4` | `S4` | unverified | TBD | - | [ ] |
| `S-5` | `S5` | standard hill (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `S-6` | `S6` | unverified | TBD | - | [ ] |
| `S-7` | `S7` | unverified | TBD | - | [ ] |
| `S-8` | `S8` | standard wooded hill (map draft) | +2 | Protected board visual draft; non-additive; owner verify | [ ] |
| `S-9` | `S9` | unverified | TBD | - | [ ] |
| `S-10` | `S10` | unverified | TBD | - | [ ] |
| `S-11` | `S11` | unverified | TBD | - | [ ] |
| `T-1` | `T1` | unverified | TBD | - | [ ] |
| `T-2` | `T2` | unverified | TBD | - | [ ] |
| `T-3` | `T3` | unverified | TBD | - | [ ] |
| `T-4` | `T4` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `T-5` | `T5` | standard wooded hill (map draft) | +2 | Oak Ridge wooded height; non-additive; owner verify | [ ] |
| `T-6` | `T6` | unverified | TBD | - | [ ] |
| `T-7` | `T7` | unverified | TBD | - | [ ] |
| `T-8` | `T8` | unverified | TBD | - | [ ] |
| `T-9` | `T9` | unverified | TBD | - | [ ] |
| `T-10` | `T10` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `T-11` | `T11` | unverified | TBD | - | [ ] |
| `U-1` | `U1` | unverified | TBD | - | [ ] |
| `U-2` | `U2` | unverified | TBD | - | [ ] |
| `U-3` | `U3` | unverified | TBD | - | [ ] |
| `U-4` | `U4` | unverified | TBD | - | [ ] |
| `U-5` | `U5` | standard wooded hill (map draft) | +2 | Protected board visual draft; non-additive; owner verify | [ ] |
| `U-6` | `U6` | unverified | TBD | - | [ ] |
| `U-7` | `U7` | unverified | TBD | - | [ ] |
| `U-8` | `U8` | unverified | TBD | - | [ ] |
| `U-9` | `U9` | unverified | TBD | - | [ ] |
| `U-10` | `U10` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
| `U-11` | `U11` | woods (map draft) | +2 | Protected board visual draft; owner verify | [ ] |
