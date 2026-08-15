# Gettysburg

Gettysburg is a browser-native, two-player adaptation of a turn-based hex-grid
battle game. The project is intended to preserve the tabletop flow while adding
modern multiplayer, saved games, server-authoritative state, and a clean user
interface that can be self-hosted on the dedicated Gettysburg VPS.

The local project workspace contains supplied board, rules, and order-of-battle
references that are deliberately ignored by Git. The repository contains only
the approved implementation plan and rights-safe project work. Application
development begins with the Phase 1 vertical slice in `ROADMAP.md`.

## Project documents

- `PLAN.md` - product direction, decisions, delivery strategy, and gates
- `SPEC.md` - required behavior, architecture, security, and acceptance criteria
- `ROADMAP.md` - ordered implementation phases and exit criteria
- `TASKS.md` - current reviewable work and validation status
- `docs/references/SOURCE_ASSETS.md` - local-only source inventory and missing inputs
- `docs/operations/VPS.md` - verified deployment target and operating model

## Current technical direction

- React, TypeScript, and Vite for the browser client
- SVG for the first board renderer
- Colyseus for authoritative multiplayer rooms
- shared pure TypeScript rules and data packages
- PostgreSQL for durable games and action logs
- Caddy in front of rootless Podman Quadlet services on the VPS

No application scaffold has been committed yet. Phase 1 will establish the
workspace, automated checks, and first playable multiplayer slice.
Before merging Phase 1, complete an independent review and verify exact-head CI.
