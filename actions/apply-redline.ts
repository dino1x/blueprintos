import { defineAction, fail } from '@agent-native/core/action'
import { assertAccess } from '@agent-native/core/sharing'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { loadSheet, loadZoneRows, parseVertices, runAudit, toZone } from '../server/compliance/desk.js'
import { auditSummarySchema } from '../server/compliance/contracts.js'
import { getDb, schema } from '../server/db/index.js'
import { moveSharedWalls } from '../shared/spatial/walls.js'

// Human-only, like seal-sheet: the agent stages cited redlines, the architect decides which ones change the drawing.
export default defineAction({
  description:
    "Architect only. Apply a STAGED redline: replace the zone polygon with the proposed geometry, move any shared wall with it (neighbouring corners and the doors hung on that wall), mark the redline APPLIED, invalidate any seal, and re-run check-clearances. Fails with STALE_REDLINE (409) if the sheet geometry changed after the redline was proposed. Returns the fresh audit and whether the cited violation is cured.",
  schema: z.object({
    sheetId: z.string().describe('Sheet id'),
    redlineId: z.string().describe('Redline proposal id (status STAGED)'),
  }),
  outputSchema: auditSummarySchema.extend({
    redlineId: z.string(),
    status: z.literal('APPLIED'),
    citedSubjectCured: z.boolean(),
    adjustedZones: z.array(z.string()).describe('Labels of neighbouring zones whose shared wall moved with the redline'),
  }),
  mcpAnnotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  agentTool: false,
  uiOnly: true,
  changeResource: (input) => ({ resourceType: 'sheet', resourceId: input.sheetId }),
  run: async ({ sheetId, redlineId }) => {
    await assertAccess('sheet', sheetId, 'editor')
    const sheet = await loadSheet(sheetId)
    const db = getDb()
    const { redlineProposals, spatialZones, violationReceipts } = schema
    const [redline] = await db
      .select()
      .from(redlineProposals)
      .where(and(eq(redlineProposals.id, redlineId), eq(redlineProposals.sheetId, sheet.id), eq(redlineProposals.ownerEmail, sheet.ownerEmail)))
      .limit(1)
    if (!redline) fail('Redline not found.', { errorCode: 'not_found', statusCode: 404 })
    if (redline.status !== 'STAGED') fail(`Redline is already ${redline.status}.`, { errorCode: 'not_staged', statusCode: 409 })
    if (redline.baseGeometryHash !== sheet.geometryHash) {
      fail('The sheet changed after this redline was proposed; re-audit and propose again.', { errorCode: 'STALE_REDLINE', statusCode: 409 })
    }
    const [cited] = await db
      .select({ subjectRef: violationReceipts.subjectRef })
      .from(violationReceipts)
      .where(and(eq(violationReceipts.id, redline.violationReceiptId), eq(violationReceipts.ownerEmail, sheet.ownerEmail)))
      .limit(1)
    const zones = (await loadZoneRows(sheet)).map(toZone)
    const own = zones.find((z) => z.id === redline.zoneId)
    const walls = own
      ? moveSharedWalls(redline.zoneId, own.vertices, parseVertices(redline.proposedVerticesJson), zones)
      : { ownDoors: [], neighbours: [] }
    await db.transaction(async (tx) => {
      await tx
        .update(spatialZones)
        .set({ verticesJson: redline.proposedVerticesJson, ...(own ? { doorsJson: JSON.stringify(walls.ownDoors) } : {}) })
        .where(and(eq(spatialZones.id, redline.zoneId), eq(spatialZones.ownerEmail, sheet.ownerEmail)))
      for (const n of walls.neighbours) {
        await tx
          .update(spatialZones)
          .set({ verticesJson: JSON.stringify(n.vertices), doorsJson: JSON.stringify(n.doors) })
          .where(and(eq(spatialZones.id, n.id), eq(spatialZones.sheetId, sheet.id), eq(spatialZones.ownerEmail, sheet.ownerEmail)))
      }
      await tx
        .update(redlineProposals)
        .set({ status: 'APPLIED' })
        .where(and(eq(redlineProposals.id, redline.id), eq(redlineProposals.ownerEmail, sheet.ownerEmail)))
    })
    const summary = await runAudit(sheet)
    const [after] = cited
      ? await db
          .select({ severity: violationReceipts.severity })
          .from(violationReceipts)
          .where(
            and(
              eq(violationReceipts.sheetId, sheet.id),
              eq(violationReceipts.ownerEmail, sheet.ownerEmail),
              eq(violationReceipts.geometryHash, summary.geometryHash),
              eq(violationReceipts.clauseId, redline.clauseId),
              eq(violationReceipts.subjectRef, cited.subjectRef),
            ),
          )
          .limit(1)
      : []
    return {
      ...summary,
      redlineId: redline.id,
      status: 'APPLIED' as const,
      citedSubjectCured: after ? after.severity !== 'CRITICAL' : false,
      adjustedZones: walls.neighbours.map((n) => n.label),
    }
  },
})
