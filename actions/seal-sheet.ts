import { defineAction, fail } from '@agent-native/core/action'
import { assertAccess } from '@agent-native/core/sharing'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { loadSheet, nowIso, requireUser } from '../server/compliance/desk.js'
import { getDb, schema } from '../server/db/index.js'

// Human-only: not an agent tool, and the HTTP route accepts it only from the
// signed-in app UI. The agent can prepare a sheet but never certify it.
export default defineAction({
  description:
    "Architect's seal. Requires an audit of the current geometry hash with zero CRITICAL receipts (UNRESOLVED_VIOLATIONS 409 otherwise). Any later geometry change flips the sheet to STALE_REQUIRES_REAUDIT.",
  schema: z.object({
    sheetId: z.string().describe('Sheet id to seal'),
    attestation: z.literal(true).describe('The architect attests they reviewed the current drawing'),
  }),
  outputSchema: z.object({
    id: z.string(),
    sealStatus: z.literal('SEALED'),
    sealedBy: z.string(),
    sealedAt: z.string(),
    geometryHash: z.string(),
  }),
  agentTool: false,
  uiOnly: true,
  changeResource: (input) => ({ resourceType: 'sheet', resourceId: input.sheetId }),
  run: async ({ sheetId }, ctx) => {
    const { ownerEmail: architect } = requireUser(ctx)
    await assertAccess('sheet', sheetId, 'editor')
    const sheet = await loadSheet(sheetId)
    if (sheet.auditedGeometryHash !== sheet.geometryHash) {
      fail('The current geometry has not been audited; run check-clearances first.', { errorCode: 'AUDIT_REQUIRED', statusCode: 409 })
    }
    const critical = await getDb()
      .select({ id: schema.violationReceipts.id, sectionRef: schema.violationReceipts.sectionRef })
      .from(schema.violationReceipts)
      .where(
        and(
          eq(schema.violationReceipts.sheetId, sheet.id),
          eq(schema.violationReceipts.ownerEmail, sheet.ownerEmail),
          eq(schema.violationReceipts.geometryHash, sheet.geometryHash),
          eq(schema.violationReceipts.severity, 'CRITICAL'),
        ),
      )
      .limit(50)
    if (critical.length) {
      fail(`${critical.length} CRITICAL violations remain on the current geometry.`, {
        errorCode: 'UNRESOLVED_VIOLATIONS',
        statusCode: 409,
        details: { sections: [...new Set(critical.map((c) => c.sectionRef))] },
      })
    }
    const sealedAt = nowIso()
    await getDb()
      .update(schema.sheets)
      .set({ sealStatus: 'SEALED', sealedBy: architect, sealedAt, sealedGeometryHash: sheet.geometryHash })
      .where(and(eq(schema.sheets.id, sheet.id), eq(schema.sheets.ownerEmail, sheet.ownerEmail)))
    return { id: sheet.id, sealStatus: 'SEALED' as const, sealedBy: architect, sealedAt, geometryHash: sheet.geometryHash }
  },
})
