# Phase 1 browser evidence

The checked-in images were produced on 2026-08-15 with the repository's
`pnpm browser:acceptance` command against the built same-origin application.
The runner creates isolated host and opponent browser contexts, claims a
one-time invitation, verifies invitation replay rejection, synchronizes an
accepted move, rejects an occupied-hex move without changing state, recreates
the opponent context from its persistent browser credential, verifies the
restored position and action log, and synchronizes a second move.

The desktop run uses a 1440 x 900 viewport and keyboard counter selection and
submission. The tablet run uses a 1024 x 768 viewport with browser touch
emulation. Both runs also exercise pointer controls, require clean application
consoles, and capture the board at 65%, calibrated fit (100%), and 170% zoom.
Only the rights-safe board region is captured; invitation and session material
is excluded.

## Desktop

- [Minimum view](desktop-minimum.png)
- [Fit view](desktop-fit.png)
- [Zoomed view](desktop-zoomed.png)

## Tablet

- [Minimum view](tablet-minimum.png)
- [Fit view](tablet-fit.png)
- [Zoomed view](tablet-zoomed.png)

To regenerate these files locally after installing Chromium:

```bash
pnpm exec playwright install chromium
GETTYSBURG_EVIDENCE_DIR=docs/evidence/phase-1 pnpm browser:acceptance
```
