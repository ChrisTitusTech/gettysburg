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

## Verified inventory

The metadata and hashes below were verified on 2026-08-14 (America/Chicago).
The inventory intentionally records only metadata and interpretation, not the
binary files.

| File | Kind | Dimensions/pages | Bytes | SHA-256 |
| --- | --- | --- | ---: | --- |
| `gameboard.jpg` | Progressive JPEG, 300 DPI | 2189 x 3444 | 3,442,642 | `feb21385186ed2c94822dc7e23e4da53eff8d61b63e8f12e76717408467b0d4e` |
| `Rules1.pdf` | PDF 1.4 | 1 page, 612 x 1008 pt | 615,685 | `7901bb1f3551e4ca456e3beb8b07c8262dbf9ff79ae8bae08d68d569cf312ffe` |
| `Rules2.pdf` | PDF 1.4 | 1 page, 612 x 1008 pt | 756,254 | `a31a2db5dc39e98b199e6942546b1901d82cf0ccfe0865982de0a40ef4f19381` |
| `OOP-Union.pdf` | PDF 1.4 | 1 US Letter page | 290,844 | `9de209125c5c9c320a25f127f837b1f4ecbe045d27146e0014427e050c6cb681` |
| `OOP-Confederate.pdf` | PDF 1.4 | 1 US Letter page | 234,927 | `dc5ea54eb0a86fd7ef2131a20f6cfd1c00f97dad548e5b2b2d96f8b36ffcc290` |

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
Counter back/reduced-state artwork is not fully represented by these pages.

## Missing or unresolved source inputs

- The Battle Manual referenced by the rules pages
- Complete counter sheets including every full and reduced face
- Exact starting setup and any scenario variants
- Objective scoring and victory conditions
- Optional rules and whether they are in scope
- Rights or licensing basis for any public use of the supplied scans, names,
  artwork, or wording

Fixture values may support the Phase 1 architecture slice, but must be visibly
labelled and must not be presented as final game content.

## Reverification

Run:

```bash
file gameboard.jpg Rules1.pdf Rules2.pdf OOP-Union.pdf OOP-Confederate.pdf
sha256sum gameboard.jpg Rules1.pdf Rules2.pdf OOP-Union.pdf OOP-Confederate.pdf
identify gameboard.jpg
pdfinfo Rules1.pdf
pdfinfo Rules2.pdf
pdfinfo OOP-Union.pdf
pdfinfo OOP-Confederate.pdf
for asset in \
  gameboard.jpg Rules1.pdf Rules2.pdf OOP-Union.pdf OOP-Confederate.pdf; do
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
