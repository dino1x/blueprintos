import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { defineAction, fail } from '@agent-native/core/action'
import { assertAccess } from '@agent-native/core/sharing'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { centroid, minOpposingWidth, round, shoelaceArea, type Point } from '../shared/spatial/geometry.js'
import { loadSheet, loadZoneRows, nowIso, parseVertices } from '../server/compliance/desk.js'
import { getDb, schema } from '../server/db/index.js'

const SKILL_PATH = '.agents/skills/spatial-compliance-rules/SKILL.md'

const SKILL_HEADER = `---
name: spatial-compliance-rules
description: >-
  Architectural constraints learned from architects correcting agent redlines
  in BlueprintOS. Read before proposing any redline geometry.
scope: both
---

# Spatial Compliance Rules

Each entry was written by \`learn-compliance-rule\` from the measured difference
between an agent's draft polygon and the architect's hand-adjusted geometry
(and, when present, the architect's edit of the agent's redline note).

No rules below this line means none have been learned yet: draft from first principles.
`

// Word-level LCS diff for the redline note.
function wordDiff(before: string, after: string): { removed: string[]; added: string[] } {
  const a = before.split(/\s+/).filter(Boolean)
  const b = after.split(/\s+/).filter(Boolean)
  const t: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      t[i]![j] = a[i] === b[j] ? t[i + 1]![j + 1]! + 1 : Math.max(t[i + 1]![j]!, t[i]![j + 1]!)
    }
  }
  const removed: string[] = []
  const added: string[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++
      j++
    } else if (t[i + 1]![j]! >= t[i]![j + 1]!) removed.push(a[i++]!)
    else added.push(b[j++]!)
  }
  while (i < a.length) removed.push(a[i++]!)
  while (j < b.length) added.push(b[j++]!)
  return { removed, added }
}

function vertexDeltas(before: Point[], after: Point[]): { index: number; dx: number; dy: number }[] {
  if (before.length !== after.length) return []
  return before
    .map((p, index) => ({ index, dx: round(after[index]!.x - p.x, 2), dy: round(after[index]!.y - p.y, 2) }))
    .filter((d) => d.dx !== 0 || d.dy !== 0)
}

export default defineAction({
  description:
    "Hand-edit learning: diff the agent's draft polygon (agent_draft_vertices_json, set by an agent redline) against the architect's current geometry for that zone, plus the architect's edit of the agent's redline note, and append the measured constraint to .agents/skills/spatial-compliance-rules/SKILL.md for future redlines.",
  schema: z.object({
    sheetId: z.string().describe('Sheet id'),
    zoneId: z.string().describe('Zone with an agent draft that the architect then adjusted'),
    redlineId: z.string().optional().describe('Agent redline whose note the architect edited'),
    architectNote: z.string().max(2000).optional().describe("The architect's edited version of the agent's redline rationale"),
  }),
  outputSchema: z.object({
    zoneId: z.string(),
    areaDeltaSqft: z.number(),
    clearWidthDeltaIn: z.number(),
    vertexDeltas: z.array(z.object({ index: z.number(), dx: z.number(), dy: z.number() })),
    noteWordsAdded: z.array(z.string()),
    noteWordsRemoved: z.array(z.string()),
    rule: z.string(),
    ruleId: z.string(),
    skillPath: z.string(),
    skillFileWritten: z.boolean(),
  }),
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  changeResource: (input) => ({ resourceType: 'sheet', resourceId: input.sheetId }),
  run: async (args) => {
    await assertAccess('sheet', args.sheetId, 'editor')
    const sheet = await loadSheet(args.sheetId)
    const zone = (await loadZoneRows(sheet)).find((z) => z.id === args.zoneId)
    if (!zone) fail('Zone not found on this sheet.', { errorCode: 'zone_not_found', statusCode: 404 })
    if (!zone.agentDraftVerticesJson) {
      fail('This zone has no agent draft; an agent redline must exist first.', { errorCode: 'no_agent_draft', statusCode: 409 })
    }
    const draft = parseVertices(zone.agentDraftVerticesJson)
    const final = parseVertices(zone.verticesJson)
    const areaDraft = shoelaceArea(draft) / 144
    const areaFinal = shoelaceArea(final) / 144
    const widthDraft = minOpposingWidth(draft).widthIn
    const widthFinal = minOpposingWidth(final).widthIn
    const deltas = vertexDeltas(draft, final)
    const shift = { x: round(centroid(final).x - centroid(draft).x, 1), y: round(centroid(final).y - centroid(draft).y, 1) }

    let noteDiff = { removed: [] as string[], added: [] as string[] }
    let originalNote = ''
    if (args.redlineId) {
      const [redline] = await getDb()
        .select()
        .from(schema.redlineProposals)
        .where(and(eq(schema.redlineProposals.id, args.redlineId), eq(schema.redlineProposals.ownerEmail, sheet.ownerEmail)))
        .limit(1)
      if (!redline) fail('Redline not found.', { errorCode: 'not_found', statusCode: 404 })
      originalNote = redline.rationale
      if (args.architectNote) {
        noteDiff = wordDiff(redline.rationale, args.architectNote)
        await getDb()
          .update(schema.redlineProposals)
          .set({ architectNote: args.architectNote })
          .where(and(eq(schema.redlineProposals.id, redline.id), eq(schema.redlineProposals.ownerEmail, sheet.ownerEmail)))
      }
    }
    const geometryChanged = deltas.length > 0 || draft.length !== final.length
    if (!geometryChanged && !noteDiff.added.length && !noteDiff.removed.length) {
      fail("The architect's geometry and note match the agent draft; nothing to learn.", { errorCode: 'no_hand_edit', statusCode: 409 })
    }
    const widthDelta = round(widthFinal - widthDraft, 1)
    const areaDelta = round(areaFinal - areaDraft, 2)
    const lines = [
      `- Zone type \`${zone.zoneType}\` ("${zone.label}"): agent draft clear width ${round(widthDraft, 1)} in → architect ${round(widthFinal, 1)} in (${widthDelta >= 0 ? '+' : ''}${widthDelta} in); area ${round(areaDraft, 1)} → ${round(areaFinal, 1)} sq ft (${areaDelta >= 0 ? '+' : ''}${areaDelta}).`,
    ]
    if (widthDelta > 0) {
      lines.push(`- When proposing ${zone.zoneType} geometry, target at least ${round(widthFinal, 1)} in clear width, not the bare code minimum the agent drafted.`)
    } else if (widthDelta < 0) {
      lines.push(`- The architect gave back ${Math.abs(widthDelta)} in of clear width: do not over-widen ${zone.zoneType} zones beyond what the cited clause requires; neighbouring rooms lose area.`)
    }
    if (deltas.length) {
      lines.push(`- Vertex moves (inches): ${deltas.map((d) => `#${d.index} (${d.dx >= 0 ? '+' : ''}${d.dx}, ${d.dy >= 0 ? '+' : ''}${d.dy})`).join(', ')}; centroid shift (${shift.x}, ${shift.y}).`)
      const onlyY = deltas.every((d) => d.dx === 0)
      const onlyX = deltas.every((d) => d.dy === 0)
      if (onlyY || onlyX) lines.push(`- The architect moved walls only along ${onlyY ? 'Y' : 'X'}; keep the opposite axis fixed (structural grid).`)
    } else if (draft.length !== final.length) {
      lines.push(`- Vertex count changed ${draft.length} → ${final.length}: the architect reshaped the outline rather than nudging walls.`)
    }
    if (noteDiff.added.length || noteDiff.removed.length) {
      lines.push(`- Redline note edits — removed: "${noteDiff.removed.join(' ')}"; added: "${noteDiff.added.join(' ')}".`)
    }
    const rule = lines.join('\n')

    const ruleId = crypto.randomUUID()
    await getDb().insert(schema.learnedSpatialRules).values({
      id: ruleId,
      sheetId: sheet.id,
      zoneId: zone.id,
      zoneType: zone.zoneType,
      ruleMd: rule,
      createdAt: nowIso(),
      ownerEmail: sheet.ownerEmail,
      orgId: sheet.orgId,
      visibility: sheet.visibility,
    })

    let skillFileWritten = false
    try {
      const targetFile = path.resolve(process.cwd(), SKILL_PATH)
      await mkdir(path.dirname(targetFile), { recursive: true })
      const priorContent = await readFile(targetFile, 'utf8').catch(() => '')
      if (!priorContent) await writeFile(targetFile, SKILL_HEADER, 'utf8')
      const entry = [
        '',
        `## ${sheet.sheetNumber} ${sheet.title} — ${zone.label} (${nowIso().slice(0, 10)})`,
        '',
        rule,
        ...(originalNote && args.architectNote ? ['', `> Agent note: ${originalNote}`, `> Architect note: ${args.architectNote}`] : []),
        '',
      ].join('\n')
      await appendFile(targetFile, entry, 'utf8')
      skillFileWritten = true
    } catch {
      skillFileWritten = false
    }
    return {
      zoneId: zone.id,
      areaDeltaSqft: areaDelta,
      clearWidthDeltaIn: widthDelta,
      vertexDeltas: deltas,
      noteWordsAdded: noteDiff.added,
      noteWordsRemoved: noteDiff.removed,
      rule,
      ruleId,
      skillPath: SKILL_PATH,
      skillFileWritten,
    }
  },
})
