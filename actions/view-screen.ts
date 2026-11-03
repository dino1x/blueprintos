import { defineAction } from '@agent-native/core/action'
import { readAppState } from '@agent-native/core/application-state'
import { assertAccess } from '@agent-native/core/sharing'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { loadClauses, loadSheet, loadZoneRows, toZone } from '../server/compliance/desk.js'
import { getDb, schema } from '../server/db/index.js'

type Navigation = {
  view?: string
  sheetId?: string
  selectedZoneId?: string
  selectedViolationId?: string
  activeClauseId?: string
  cursorX?: number
  cursorY?: number
}

export default defineAction({
  description:
    "Read what the architect is looking at: the open sheet (title block, geometry hash, seal status), the selected zone polygon with its vertices, the selected violation pin (receipt id, clause, measured vs required, pin coordinates), and the active statutory clause with its hash. Use the receipt id and clause hash shown here when citing in propose-redline.",
  schema: z.object({}),
  outputSchema: z.object({
    navigation: z.record(z.string(), z.unknown()).nullable(),
    sheet: z.record(z.string(), z.unknown()).nullable(),
    selectedZone: z.record(z.string(), z.unknown()).nullable(),
    selectedViolation: z.record(z.string(), z.unknown()).nullable(),
    activeClause: z.record(z.string(), z.unknown()).nullable(),
  }),
  http: false,
  readOnly: true,
  run: async () => {
    const navigation = (await readAppState('navigation')) as Navigation | null
    const base = { navigation: (navigation as Record<string, unknown> | null) ?? null, sheet: null, selectedZone: null, selectedViolation: null, activeClause: null }
    if (!navigation?.sheetId) return base
    try {
      await assertAccess('sheet', navigation.sheetId, 'viewer')
    } catch {
      return base
    }
    const sheet = await loadSheet(navigation.sheetId)
    const zones = (await loadZoneRows(sheet)).map(toZone)
    const zone = zones.find((z) => z.id === navigation.selectedZoneId) ?? null
    const [receipt] = navigation.selectedViolationId
      ? await getDb()
          .select()
          .from(schema.violationReceipts)
          .where(and(eq(schema.violationReceipts.id, navigation.selectedViolationId), eq(schema.violationReceipts.ownerEmail, sheet.ownerEmail)))
          .limit(1)
      : []
    const clauses = await loadClauses(sheet.ownerEmail)
    const clauseId = receipt?.clauseId ?? navigation.activeClauseId
    const clause = clauses.find((c) => c.id === clauseId) ?? null
    return {
      navigation: navigation as Record<string, unknown>,
      sheet: {
        id: sheet.id,
        sheetNumber: sheet.sheetNumber,
        title: sheet.title,
        sprinklered: sheet.sprinklered,
        geometryHash: sheet.geometryHash,
        auditCurrent: sheet.auditedGeometryHash === sheet.geometryHash,
        sealStatus: sheet.sealStatus,
        zones: zones.map((z) => ({ id: z.id, label: z.label, zoneType: z.zoneType })),
      },
      selectedZone: zone ? { id: zone.id, label: zone.label, zoneType: zone.zoneType, vertices: zone.vertices, doors: zone.doors } : null,
      selectedViolation: receipt
        ? {
            receiptId: receipt.id,
            zoneId: receipt.zoneId,
            clauseId: receipt.clauseId,
            clauseHash: receipt.clauseHash,
            sectionRef: receipt.sectionRef,
            subjectRef: receipt.subjectRef,
            measuredValue: receipt.measuredValue,
            requiredValue: receipt.requiredValue,
            severity: receipt.severity,
            pin: { x: receipt.pinX, y: receipt.pinY },
            isStale: receipt.geometryHash !== sheet.geometryHash,
            detail: receipt.detail,
          }
        : null,
      activeClause: clause
        ? { id: clause.id, sectionRef: clause.sectionRef, title: clause.title, verbatimText: clause.verbatimText, clauseHash: clause.clauseHash, threshold: `${clause.thresholdOperator} ${clause.thresholdValue} ${clause.unit}` }
        : null,
    }
  },
})
