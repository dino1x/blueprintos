# BlueprintOS — Agent Guide

BlueprintOS is built on the chat-first agent-native starter. `/` redirects to shared sign-in, then `/home`, the editable Get started page. Chat lives at `/chat`; new chats start there. Actions carry capabilities; screens exist only for durable workflows.

## Skills

Search with `rg --hidden --follow`; read the exact linked guide before deeper work. `.agents/skills/build-an-app/SKILL.md` — start here for vague requests to create a domain app. `.agents/skills/adding-a-feature/SKILL.md` — cross-area feature checklist. Data/integrations: `.agents/skills/actions/SKILL.md`, `.agents/skills/storing-data/SKILL.md`, `.agents/skills/security/SKILL.md`, `.agents/skills/secrets/SKILL.md`, `.agents/skills/sharing/SKILL.md`. UI: `.agents/skills/frontend-design/SKILL.md`, `.agents/skills/shadcn-ui/SKILL.md`, `.agents/skills/client-side-routing/SKILL.md`. Agent context/workflows: `.agents/skills/context-awareness/SKILL.md`, `.agents/skills/real-time-sync/SKILL.md`, `.agents/skills/reliable-mutations/SKILL.md`, `.agents/skills/performance/SKILL.md`, `.agents/skills/delegate-to-agent/SKILL.md`. Framework: `.agents/skills/agent-native-docs/SKILL.md`, `.agents/skills/agent-native-toolkit/SKILL.md`, `.agents/skills/customizing-agent-native/SKILL.md`.

Use local docs only (no web research): `pnpm action docs-search --query "<topic>"`, `pnpm action docs-search --slug "<slug>"`, `pnpm action docs-search --list`, `pnpm action source-search --query "<pattern>"`, `pnpm action source-search --path <path>`, or `pnpm action source-search --list`. For external-agent integrations, read `pnpm action docs-search --slug "external-agents"`.

## Core rules

- UI feedback: target 100 ms, never exceed 400 ms; acknowledge before network work.
- Normal app data must flow through actions. Keep actions deterministic and focused; use agent chat/AgentSidebar for AI work and follow-ups in the same thread. Keep structured state in SQL and large files in configured storage; persist references only.
- For external integrations, inspect the workspace/provider connection catalog first; reuse its scoped resolver. Never hardcode credentials, webhook URLs, or private/customer data.
- Never fabricate. Report failures and recover; verify writes by reading the row or screen. Navigation is in `<current-screen>`; use `view-screen` for fresh visible-record details.

For custom branding, keep `server/plugins/agent-native-email-branding.ts` aligned: `app.name` appears in transactional email and optional `app.logoUrl` must be an absolute HTTPS URL.

## Application state

- `navigation` describes the view and selected ids. Chat is `chat` at `/chat` and `/chat/<threadId>`; the Get started page is `home` at `/home`; `/` opens shared sign-in/signup.
- Use `navigate` when supported and `view-screen` for a fresh read of visible details; basic navigation is already in `<current-screen>`.

- Guarded verification: run `pnpm agent-native:doctor`; fix findings before done.

## BlueprintOS compliance desk

2D floorplan CAD with a proof-carrying code desk. `/sheets` is the drawing register; `/sheets/:sheetId?zone=&violation=&clause=&px=&py=` is the workbench. `navigation` adds `sheetId`, `selectedZoneId`, `selectedViolationId`, `activeClauseId`, `pinX`, `pinY`.

### Operating protocol
1. **Coordinate system & engine:** Coordinates are in inches (`x` right, `y` down). All measurements come from `shared/spatial/` (`check-clearances`): Shoelace polygon area, opposing-wall clear width, Dijkstra visibility-graph egress, IBC Table 1004.5 occupant loads, 0.2 in/occupant door capacity, dead-end corridor projections, and pull-side maneuvering clearance.
2. **Citation firewall (`propose-redline`):** Requires an active `violation_receipt_id`, its `clause_id`, and the matching SHA-256 `clause_hash`. Throws `UNGROUNDED_CITATION` (409) when a receipt is missing, mismatched, or invalidated by a subsequent geometry edit (`move-vertex`). Always re-run `check-clearances` after geometry changes before proposing a new redline.
3. **Human seal boundary:** `seal-sheet` is strictly UI-only; agents cannot stamp a sheet. Any post-seal edit reverts the sheet status to `STALE_REQUIRES_REAUDIT`.
4. **Spatial rule memory:** Consult `.agents/skills/spatial-compliance-rules/SKILL.md` (and `learnedRules` from `get-sheet-detail`) before proposing geometry. `learn-compliance-rule` records architect adjustments to agent drafts.
5. **Browser WebMCP & generative views:** On an open sheet, `window.__agentNativeWebMcp` exposes `focus-violation-pin` and `export-sheet-svg`. Use `render-inline-extension` for Alpine before/after redline comparison tables and `save-data-program` (`appAction("list-sheets")`) for register-wide critical violation summaries.

### Domain actions (`actions/`)
- `list-sheets` / `get-sheet-detail` — read the drawing register, zones, doors, clauses+hashes, receipts, redlines, and learned rules.
- `check-clearances` — run the spatial compliance engine and emit cryptographic violation receipts.
- `move-vertex` — architect-only (UI, not an agent tool): update vertex coordinates, zone polygons, or door widths. The agent changes geometry only through `propose-redline`.
- `propose-redline` / `reject-redline` — stage a cited redline through the firewall, or withdraw it. `apply-redline` is architect-only (UI), like `seal-sheet`. Applying a redline moves shared walls with it: when you shift a whole wall (both ends by the same offset), the neighbouring zone's corners and any doors hung on that wall move too, so rooms never overlap. Move whole walls rather than skewing them, and make sure the neighbour you shrink stays above its own minimums.
- `learn-compliance-rule` / `import-floorplan` — extract spatial rules from architect edits or import a floorplan JSON sheet.
