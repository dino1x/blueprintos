# BlueprintOS — Visual Design Contract

BlueprintOS is a drafting table, not a dashboard. The drawing owns the
screen; compliance lives in the margin the way a plan reviewer's redlines live
on a print. Every number on screen is a measurement, typeset like a dimension
string.

## Product mode

- Mode: `operate`
- Audience and cadence: architects, plan reviewers and accessibility
  consultants doing focused review sessions on one sheet at a time, often
  several hours long.
- Primary workflow: open a sheet → read the red pins → drag a wall or accept a
  cited redline from the agent → re-audit → seal.

## Visual direction

- Direction name: **Drafting Vellum**
- Feeling: a translucent sheet of vellum on a lit table — warm paper,
  graphite linework, and one hand-applied red pencil.
- Palette family: **Paper / charcoal** neutrals with a single
  **vermilion redline** accent.
  - `--bp-paper` warm vellum ground; `--bp-ink` graphite linework.
  - `--bp-redline` vermilion — violations, redline proposals, and the seal
    stamp only. Never decorative.
  - `--bp-pass` pencil green and `--bp-warn` trace amber, used only in
    severity marks.
  - `--bp-grid` faint 1-ft drafting grid; major lines every 10 ft.
- Dark theme: "night table" — graphite ground with vellum-colored linework; the
  redline brightens to stay legible.
- Type treatment: **editorial contrast**. `Geist` for
  sheet titles, the title block and clause headings; `Inter` and `IBM Plex Sans` for interface
  text (the light theme is the default); `IBM Plex Mono` for every dimension, hash, and coordinate, always with
  units (`34.0″`, `215.5′`, `880 sf`).
- Composition: **canvas + margin**. The SVG sheet fills the work area with a
  pannable/zoomable drafting grid; the right margin is the Compliance Desk
  (Pins · Code · Redlines · Seal). A drawn title block sits in the canvas'
  bottom-right corner exactly where it would on a printed sheet. The drawing
  register is a sheet index table, not cards.
- Shape language: square corners, hairline 1px rules, double rules for title
  blocks. Pins are circles with a leader line; the seal is a round stamp.
- Motion: none decorative. Pan/zoom via `translate3d`, vertex drag via direct
  SVG attribute writes on pointer move, transitions only on panel state.

## Anti-references

- No blueprint-blue gradients, glassmorphism, or "AI" glow.
- No feature cards, KPI strips, or hero copy. The sheet is the page.
- No sparkle/wand/robot iconography; agent hand-off is "Ask the agent" with
  `IconMessageForward`.
- No rounded pill chips for clause references — section numbers are set in
  mono like a code book margin note.

## States

- Loading: skeleton of the sheet frame, title block and margin rows.
- Stale audit: pins fade to outlines and the margin shows "geometry changed —
  re-audit" until check-clearances runs.
- Sealed: round vermilion stamp in the title block; a stale seal is struck
  through with "STALE — REQUIRES RE-AUDIT".
- Narrow width: margin stacks under the canvas; canvas keeps a fixed aspect
  frame.
