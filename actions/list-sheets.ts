import { defineAction } from '@agent-native/core/action'
import { buildDeepLink } from '@agent-native/core/server'
import { accessFilter } from '@agent-native/core/sharing'
import { and, asc, inArray } from 'drizzle-orm'
import { z } from 'zod'

import { ensureWorkspace } from '../server/compliance/desk.js'
import { getDb, schema } from '../server/db/index.js'

export default defineAction({
  description:
    'List the drawing register: every floorplan sheet the user can open, with its seal status and the CRITICAL/WARNING counts from its latest clearance audit. Seeds the statutory corpus and two starter sheets on first visit.',
  schema: z.object({}),
  outputSchema: z.object({
    sheets: z.array(
      z.object({
        id: z.string(),
        sheetNumber: z.string(),
        title: z.string(),
        projectCode: z.string(),
        sprinklered: z.boolean(),
        sealStatus: z.string(),
        sealedBy: z.string().nullable(),
        auditCurrent: z.boolean(),
        critical: z.number(),
        warning: z.number(),
        zoneCount: z.number(),
        outline: z
          .array(z.array(z.object({ x: z.number(), y: z.number() })))
          .describe('Zone polygons in inches, for the register thumbnail'),
        updatedAt: z.string(),
      }),
    ),
  }),
  http: { method: 'GET' },
  readOnly: true,
  link: () => ({ url: buildDeepLink({ view: 'sheets', to: '/sheets' }), label: 'Open the drawing register' }),
  run: async (_args, ctx) => {
    await ensureWorkspace(ctx)
    const { sheets, sheetShares, violationReceipts, spatialZones } = schema
    const db = getDb()
    const rows = await db
      .select()
      .from(sheets)
      .where(accessFilter(sheets, sheetShares))
      .orderBy(asc(sheets.sheetNumber))
      .limit(100)
    const ids = rows.map((r) => r.id)
    const receipts = ids.length
      ? await db
          .select({ sheetId: violationReceipts.sheetId, geometryHash: violationReceipts.geometryHash, severity: violationReceipts.severity, ownerEmail: violationReceipts.ownerEmail })
          .from(violationReceipts)
          .where(and(inArray(violationReceipts.sheetId, ids), inArray(violationReceipts.ownerEmail, rows.map((r) => r.ownerEmail))))
          .limit(5000)
      : []
    const zones = ids.length
      ? await db
          .select({ sheetId: spatialZones.sheetId, verticesJson: spatialZones.verticesJson })
          .from(spatialZones)
          .where(and(inArray(spatialZones.sheetId, ids), inArray(spatialZones.ownerEmail, rows.map((r) => r.ownerEmail))))
          .limit(5000)
      : []
    return {
      sheets: rows.map((s) => {
        const audited = s.auditedGeometryHash ?? ''
        const current = receipts.filter((r) => r.sheetId === s.id && r.geometryHash === audited)
        return {
          id: s.id,
          sheetNumber: s.sheetNumber,
          title: s.title,
          projectCode: s.projectCode,
          sprinklered: s.sprinklered,
          sealStatus: s.sealStatus,
          sealedBy: s.sealedBy,
          auditCurrent: s.auditedGeometryHash === s.geometryHash,
          critical: current.filter((r) => r.severity === 'CRITICAL').length,
          warning: current.filter((r) => r.severity === 'WARNING').length,
          zoneCount: zones.filter((z) => z.sheetId === s.id).length,
          outline: zones
            .filter((z) => z.sheetId === s.id)
            .map((z) => JSON.parse(z.verticesJson) as { x: number; y: number }[]),
          updatedAt: s.updatedAt,
        }
      }),
    }
  },
})
