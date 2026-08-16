# Source asset inventory

## Purpose and handling

These local-only files are the currently supplied reference material for the
digital adaptation. They are ignored by Git and must never be force-added or
uploaded to GitHub. Preserve the originals byte-for-byte. Derived data must
record its source filename and the interpretation used. The scans may contain
copyrighted Avalon Hill material, so they remain private reference inputs unless
the project owner confirms appropriate rights. A public release should default
to original clean-room board, counter, and explanatory presentation.

Any future binary or derived asset proposed for the repository requires manual
owner review before merge. Its pull request must identify the creator, source,
license or permission basis, required attribution, derivation method, and the
approving owner. A checksum denylist can block a known byte-for-byte regression;
it cannot establish provenance or permission for renamed, modified, or newly
created content.

## Approved repository artwork

The following clean-room presentation asset is intentionally tracked. It is not
a supplied scan and does not contain bytes copied from the local-only reference
files.

| File | Creator and derivation | Permission and attribution | Approval | Dimensions/bytes | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| `apps/web/src/assets/gettysburg-board-deluxe.png` | OpenAI built-in image generation, iteratively directed from the project's original procedural board and owner-authored terrain mock | Owner-approved for this project; no attribution requirement specified | ChrisTitusTech, 2026-08-16 | 1658 x 949 PNG; 2,988,216 bytes | `f3ce38715cf8d4f9b997635d4ecf70e283e20398f3d55be8c2c5c7857f52ab91` |

The approved revision supplies presentation only. Authoritative coordinates,
movement, combat, and future terrain modifiers remain typed independently of
the pixels.

### Artwork generation record

The owner directed an iterative built-in image-generation and editing process.
The visual brief called for a 231-hex, hand-painted Gettysburg landscape with
edge-to-edge roads and streams, rocky Round Tops, southern woods, named
landmarks, no Time Record Track, and no center-bottom A/B markers. The protected
`gameboard.jpg` was used as a private visual/geographic reference at the owner's
request; subsequent edits used generated board variants and the owner's
`mock.png` paint-over. Neither reference file is embedded in or tracked beside
the approved PNG. The final selected bytes came from the generated revision
named `exec-6d2c04a2-841a-46ff-aaec-61b75b54a6d3.png`, and the owner explicitly
approved that exact revision for the cleanup pull request on 2026-08-16.

The committed asset is original generated presentation artwork rather than a
reproduction of the scan. This is a project provenance record, not a legal
opinion about the underlying historical subject, place names, or game rules.

## Verified inventory

The source-scan metadata and hashes below were verified on 2026-08-15
(America/Chicago); `mock.png` was verified on 2026-08-16. The inventory
intentionally records only metadata and interpretation, not the binary files.

| File | Kind | Dimensions/pages | Bytes | SHA-256 |
| --- | --- | --- | ---: | --- |
| `gameboard.jpg` | Progressive JPEG, 300 DPI | 2189 x 3444 | 3,442,642 | `feb21385186ed2c94822dc7e23e4da53eff8d61b63e8f12e76717408467b0d4e` |
| `Rules1.pdf` | PDF 1.4 | 1 page, 612 x 1008 pt | 615,685 | `7901bb1f3551e4ca456e3beb8b07c8262dbf9ff79ae8bae08d68d569cf312ffe` |
| `Rules2.pdf` | PDF 1.4 | 1 page, 612 x 1008 pt | 756,254 | `a31a2db5dc39e98b199e6942546b1901d82cf0ccfe0865982de0a40ef4f19381` |
| `OOP-Union.pdf` | PDF 1.4 | 1 US Letter page | 290,844 | `9de209125c5c9c320a25f127f837b1f4ecbe045d27146e0014427e050c6cb681` |
| `OOP-Confederate.pdf` | PDF 1.4 | 1 US Letter page | 234,927 | `dc5ea54eb0a86fd7ef2131a20f6cfd1c00f97dad548e5b2b2d96f8b36ffcc290` |
| `gettysburg-battle-manual_OCR.pdf` | PDF 1.4 | 10 US Letter pages | 1,459,481 | `115f1d120aa6912847f7f2ffb694e86ec02f42f549f9341683ecfc3888162bbb` |
| `mock.png` | Owner paint-over PNG | 1658 x 949 | 2,917,458 | `a1203ab38885b702f0e2d2e5df1bd931ae3ae3bdde5a8cc8b7b5ac668123bd15` |

`OOP` is retained in the supplied filenames even though the documents function
as orders of battle. Renaming is deferred to avoid breaking provenance.

## Observed content

### Board

- Irregular hex field labelled A through U and 1 through 11
- Clear, hill, rough hill, woods, town, road, railroad, and stream features
- Named locations and objectives
- A 24-turn record track

The image is useful as a calibration and private-prototype underlay. Production
should store hex centers, terrain, edges, links, labels, and objectives as typed
data independent of the pixels.

### Rules pages

- Two-player Confederate/Union sequence
- Confederate movement and combat, then Union movement and combat
- Union phase completion advances the turn
- Night turns 8, 16, and 24
- Terrain, road, stream, zone-of-control, and general movement effects
- Reinforcement entry by scheduled turn and hex
- One combat unit per hex normally, or two when a general is present
- Adjacent combat grouping, d10 rolls with zero read as ten, modifiers capped at
  +10, defender winning ties, and loss thresholds by result margin
- Loss allocation, retreat, and advance after combat

This summary is not a replacement for source transcription or rule approval.

### Orders of battle

The Union and Confederate pages identify units, organizations, combat/movement
values, and scheduled entries used by the scenario. Phase 2 must transcribe them
to typed content, verify every record against the scan, and preserve provenance.
Counter back/reduced-state artwork is not fully represented by these pages. For
the Phase 2 rules-light model, the owner approved deriving each reduced combat
factor as half the front value rounded up. A combat-one counter instead has one
step and is eliminated by its first loss. This decision supplies game data, not
missing artwork.

### Battle Manual

The locally supplied OCR edition was rendered and visually checked page by page.
For Scenario Five, it confirms the Scenario One initial setup, all 24 turns,
night turns 8, 16, and 24, initial Union control of every objective, casualty and
objective scoring, Confederate automatic-victory checks after turns 8 and 16,
and the final turn-24 comparison. The eight printed board objectives were also
verified against `gameboard.jpg`: F6 (5), I11 (3), K6 (1), K7 (1), L6 (1), L7
(1), M7 (1), and M9 (3).

This transcription supports the rules-light Phase 2 state model. It does not
authorize public reproduction of the manual and does not supply the missing
counter backs.

## Missing or unresolved source inputs

- Complete counter sheets including every reduced-face artwork treatment
- Optional rules and whether they are in scope
- Reviewed per-hex terrain transcription for the irregular board
- Rights or licensing basis for any public use of the supplied scans, names,
  artwork, or wording

The approved formula may supply Phase 2 reduced combat data. Any remaining
fixture values must be visibly labelled and must not be presented as final game
content.

## Phase 1 interpretation and rights ledger

Phase 1 uses an algorithmically generated A-U/1-11 field, original counter
symbols, and two conspicuously labelled fixture units. It does not transcribe
scenario setup, rule wording, unit values, objectives, or supplied artwork. The
project owner remains responsible for closing the deferred source and rights
gates before the listed later phase can claim fidelity or public-release use.

| Input or decision | Phase 1 disposition | Owner | Required phase gate |
| --- | --- | --- | --- |
| Battle Manual | Supplied locally after Phase 1; remains ignored and private | ChrisTitusTech | Phase 2 may encode Scenario Five facts; approve exact interpretations before Phase 3 enforcement |
| Complete counter faces | Deferred; use two original fixture symbols only | ChrisTitusTech | Obtain, inventory, and approve before Phase 2 full order of battle |
| Scenario setup and variants | Deferred; use the explicit two-unit fixture only | ChrisTitusTech | Approve before Phase 2 scenario-fidelity claim |
| Objective scoring and victory | Deferred; Phase 1 has no victory calculation | ChrisTitusTech | Approve before Phase 2 complete-game claim |
| Optional rules | Deferred and out of Phase 1 scope | ChrisTitusTech | Decide scope before Phase 3 rule implementation |
| Public use of supplied art or wording | Prohibited by default; Phase 1 ships original presentation only | ChrisTitusTech | Record license or clean-room decision before any public release |

The existing approved Phase 1 direction permits these explicit fixture
deferrals. Continuing beyond the named gates requires a new owner decision; it
must not be inferred from this ledger.

## Reverification

Run:

```bash
set -euo pipefail
printf '%s  %s\n' \
  f3ce38715cf8d4f9b997635d4ecf70e283e20398f3d55be8c2c5c7857f52ab91 \
  apps/web/src/assets/gettysburg-board-deluxe.png | sha256sum --check --strict
git ls-files --error-unmatch \
  apps/web/src/assets/gettysburg-board-deluxe.png >/dev/null
file gameboard.jpg Rules1.pdf Rules2.pdf OOP-Union.pdf OOP-Confederate.pdf \
  gettysburg-battle-manual_OCR.pdf mock.png
sha256sum --check --strict <<'EOF'
feb21385186ed2c94822dc7e23e4da53eff8d61b63e8f12e76717408467b0d4e  gameboard.jpg
7901bb1f3551e4ca456e3beb8b07c8262dbf9ff79ae8bae08d68d569cf312ffe  Rules1.pdf
a31a2db5dc39e98b199e6942546b1901d82cf0ccfe0865982de0a40ef4f19381  Rules2.pdf
9de209125c5c9c320a25f127f837b1f4ecbe045d27146e0014427e050c6cb681  OOP-Union.pdf
dc5ea54eb0a86fd7ef2131a20f6cfd1c00f97dad548e5b2b2d96f8b36ffcc290  OOP-Confederate.pdf
115f1d120aa6912847f7f2ffb694e86ec02f42f549f9341683ecfc3888162bbb  gettysburg-battle-manual_OCR.pdf
a1203ab38885b702f0e2d2e5df1bd931ae3ae3bdde5a8cc8b7b5ac668123bd15  mock.png
EOF
identify gameboard.jpg
pdfinfo Rules1.pdf
pdfinfo Rules2.pdf
pdfinfo OOP-Union.pdf
pdfinfo OOP-Confederate.pdf
pdfinfo gettysburg-battle-manual_OCR.pdf
identify mock.png
for asset in \
  gameboard.jpg Rules1.pdf Rules2.pdf OOP-Union.pdf OOP-Confederate.pdf \
  gettysburg-battle-manual_OCR.pdf mock.png; do
  git check-ignore -q -- "$asset" || {
    echo "Not ignored: $asset" >&2
    exit 1
  }
  if git ls-files --error-unmatch -- "$asset" >/dev/null 2>&1; then
    echo "Tracked local-only asset: $asset" >&2
    exit 1
  fi
done
```

If an approved replacement is received, add it as a new source revision and
record its provenance rather than silently overwriting an existing file.
