import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { defineAction } from '@agent-native/core/action'
import { eq, inArray } from 'drizzle-orm'
import { z } from 'zod'

import { ensureWorkspace, requireUser } from '../server/compliance/desk.js'
import { getDb, schema } from '../server/db/index.js'

const SPATIAL_SKILL_FILE = '.agents/skills/spatial-compliance-rules/SKILL.md'

// Rebuilds the architect's drawing register from the canonical A-101 and A-201
// floorplan seeds while optionally preserving learned spatial conventions.
export default defineAction({
  description: 'Restore the drawing register to baseline A-101 and A-201 floorplans, clearing receipts, redlines, and seals.',
  schema: z.object({
    keepLearnedRules: z.boolean().optional().describe('Preserve learned spatial compliance rules across the restore'),
  }),
  outputSchema: z.object({ sheets: z.number(), skillFileReset: z.boolean() }),
  agentTool: false,
  uiOnly: true,
  mcpAnnotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  run: async ({ keepLearnedRules = false }, ctx) => {
    const { ownerEmail } = requireUser(ctx)
    const db = getDb()
    const existingSheets = await db.select({ id: schema.sheets.id }).from(schema.sheets).where(eq(schema.sheets.ownerEmail, ownerEmail))
    const sheetIds = existingSheets.map((r) => r.id)
    await db.transaction(async (tx) => {
      if (sheetIds.length) await tx.delete(schema.sheetShares).where(inArray(schema.sheetShares.resourceId, sheetIds))
      const tablesToClear = [
        ...(keepLearnedRules ? [] : [schema.learnedSpatialRules]),
        schema.redlineProposals,
        schema.violationReceipts,
        schema.spatialZones,
        schema.codeClauses,
        schema.sheets,
      ]
      for (const tbl of tablesToClear) {
        await tx.delete(tbl).where(eq(tbl.ownerEmail, ownerEmail))
      }
    })
    await ensureWorkspace(ctx)

    let skillFileReset = false
    if (!keepLearnedRules) {
      try {
        const targetPath = path.join(process.cwd(), SPATIAL_SKILL_FILE)
        const raw = await readFile(targetPath, 'utf8')
        const markerIdx = raw.indexOf('\n## ')
        if (markerIdx >= 0) await writeFile(targetPath, raw.slice(0, markerIdx + 1), 'utf8')
        skillFileReset = true
      } catch {
        skillFileReset = false
      }
    }
    const reseeded = await db.select({ id: schema.sheets.id }).from(schema.sheets).where(eq(schema.sheets.ownerEmail, ownerEmail))
    return { sheets: reseeded.length, skillFileReset }
  },
})
