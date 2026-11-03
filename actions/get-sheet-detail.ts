import { defineAction } from '@agent-native/core/action'
import { buildDeepLink } from '@agent-native/core/server'
import { assertAccess } from '@agent-native/core/sharing'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { analyzeSheet } from '../shared/spatial/analysis.js'
import {
  loadClauses,
  loadSheet,
  loadZoneRows,
  toClauseRow,
  toZone,
} from '../server/compliance/desk.js'
import { doorSchema, pointSchema, receiptSchema, zoneTypeSchema } from '../server/compliance/contracts.js'
import { getDb, schema } from '../server/db/index.js'

export default defineAction({
  description:
    'Read one sheet in full: title block, every zone polygon with its exact metrics (area, perimeter, min dimension, occupant load, egress distance and path, dead end), doors with served load and maneuvering depth, the statutory clauses with their SHA-256 hashes, the violation receipts of the current audit (with receipt ids you must cite in propose-redline), and redline proposals.',
  schema: z.object({ id: z.string().describe('Sheet id from list-sheets') }),
  outputSchema: z.object({
    sheet: z.object({
      id: z.string(),
      sheetNumber: z.string(),
      title: z.string(),
      projectCode: z.string(),
      scaleUnit: z.string(),
      sprinklered: z.boolean(),
      geometryHash: z.string(),
      auditedGeometryHash: z.string().nullable(),
      auditCurrent: z.boolean(),
      sealStatus: z.enum(['UNSEALED', 'SEALED', 'STALE_REQUIRES_REAUDIT']),
      sealedBy: z.string().nullable(),
      sealedAt: z.string().nullable(),
      updatedAt: z.string(),
    }),
    zones: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        zoneType: zoneTypeSchema,
        vertices: z.array(pointSchema),
        doors: z.array(doorSchema),
        areaSqft: z.number(),
        perimeterFt: z.number(),
        minDimensionIn: z.number(),
        occupantLoad: z.number(),
        egressDistanceFt: z.number().nullable(),
        egressPath: z.array(pointSchema),
        deadEndFt: z.number().nullable(),
        agentDraftVertices: z.array(pointSchema).nullable(),
      }),
    ),
    doors: z.array(
      z.object({
        doorId: z.string(),
        zoneId: z.string(),
        label: z.string(),
        clearWidthIn: z.number(),
        servedLoad: z.number(),
        maneuveringDepthIn: z.number().nullable(),
        isExit: z.boolean(),
      }),
    ),
    clauses: z.array(
      z.object({
        id: z.string(),
        codeStandard: z.string(),
        sectionRef: z.string(),
        title: z.string(),
        verbatimText: z.string(),
        thresholdMetric: z.string(),
        thresholdOperator: z.string(),
        thresholdValue: z.number(),
        sprinkleredThresholdValue: z.number().nullable(),
        unit: z.string(),
        clauseHash: z.string(),
      }),
    ),
    receipts: z.array(receiptSchema),
    redlines: z.array(
      z.object({
        id: z.string(),
        zoneId: z.string(),
        violationReceiptId: z.string(),
        clauseId: z.string(),
        proposedVertices: z.array(pointSchema),
        predictedValue: z.number().nullable(),
        rationale: z.string(),
        architectNote: z.string().nullable(),
        authorRole: z.enum(['agent', 'architect']),
        status: z.enum(['STAGED', 'APPLIED', 'REJECTED']),
        isStale: z.boolean(),
        createdAt: z.string(),
      }),
    ),
    learnedRules: z.array(
      z.object({ id: z.string(), zoneType: z.string(), rule: z.string(), createdAt: z.string() }),
    ),
  }),
  http: { method: 'GET' },
  readOnly: true,
  link: ({ args }) => ({
    url: buildDeepLink({ view: 'sheet', to: `/sheets/${encodeURIComponent(args.id)}`, params: { sheetId: args.id } }),
    label: 'Open sheet',
  }),
  run: async ({ id }) => {
    await assertAccess('sheet', id, 'viewer')
    const sheet = await loadSheet(id)
    const zoneRows = await loadZoneRows(sheet)
    const zones = zoneRows.map(toZone)
    const clauseRows = await loadClauses(sheet.ownerEmail)
    const analysis = analyzeSheet(zones, sheet.sprinklered, clauseRows.map(toClauseRow))
    const db = getDb()
    const receipts = sheet.auditedGeometryHash
      ? await db
          .select()
          .from(schema.violationReceipts)
          .where(
            and(
              eq(schema.violationReceipts.sheetId, sheet.id),
              eq(schema.violationReceipts.ownerEmail, sheet.ownerEmail),
              eq(schema.violationReceipts.geometryHash, sheet.auditedGeometryHash),
            ),
          )
          .limit(1000)
      : []
    const redlines = await db
      .select()
      .from(schema.redlineProposals)
      .where(and(eq(schema.redlineProposals.sheetId, sheet.id), eq(schema.redlineProposals.ownerEmail, sheet.ownerEmail)))
      .orderBy(desc(schema.redlineProposals.createdAt))
      .limit(40)
    const learned = await db
      .select()
      .from(schema.learnedSpatialRules)
      .where(eq(schema.learnedSpatialRules.ownerEmail, sheet.ownerEmail))
      .orderBy(desc(schema.learnedSpatialRules.createdAt))
      .limit(20)
    const metricOf = new Map(analysis.zones.map((m) => [m.zoneId, m]))
    return {
      sheet: {
        id: sheet.id,
        sheetNumber: sheet.sheetNumber,
        title: sheet.title,
        projectCode: sheet.projectCode,
        scaleUnit: sheet.scaleUnit,
        sprinklered: sheet.sprinklered,
        geometryHash: sheet.geometryHash,
        auditedGeometryHash: sheet.auditedGeometryHash,
        auditCurrent: sheet.auditedGeometryHash === sheet.geometryHash,
        sealStatus: sheet.sealStatus,
        sealedBy: sheet.sealedBy,
        sealedAt: sheet.sealedAt,
        updatedAt: sheet.updatedAt,
      },
      zones: zoneRows.map((row, i) => {
        const zone = zones[i]!
        const m = metricOf.get(zone.id)!
        return {
          id: zone.id,
          label: zone.label,
          zoneType: zone.zoneType,
          vertices: zone.vertices,
          doors: zone.doors,
          areaSqft: m.areaSqft,
          perimeterFt: m.perimeterFt,
          minDimensionIn: m.minDimensionIn,
          occupantLoad: m.occupantLoad,
          egressDistanceFt: m.egressDistanceFt,
          egressPath: m.egressPath,
          deadEndFt: m.deadEndFt,
          agentDraftVertices: row.agentDraftVerticesJson ? (JSON.parse(row.agentDraftVerticesJson) as { x: number; y: number }[]) : null,
        }
      }),
      doors: analysis.doors.map((d) => ({
        doorId: d.doorId,
        zoneId: d.zoneId,
        label: d.label,
        clearWidthIn: d.clearWidthIn,
        servedLoad: d.servedLoad,
        maneuveringDepthIn: d.maneuveringDepthIn,
        isExit: d.isExit,
      })),
      clauses: clauseRows.map((c) => ({
        id: c.id,
        codeStandard: c.codeStandard,
        sectionRef: c.sectionRef,
        title: c.title,
        verbatimText: c.verbatimText,
        thresholdMetric: c.thresholdMetric,
        thresholdOperator: c.thresholdOperator,
        thresholdValue: c.thresholdValue,
        sprinkleredThresholdValue: c.sprinkleredThresholdValue,
        unit: c.unit,
        clauseHash: c.clauseHash,
      })),
      receipts: receipts.map((r) => ({
        id: r.id,
        zoneId: r.zoneId,
        clauseId: r.clauseId,
        clauseHash: r.clauseHash,
        sectionRef: r.sectionRef,
        geometryHash: r.geometryHash,
        subjectRef: r.subjectRef,
        measuredValue: r.measuredValue,
        requiredValue: r.requiredValue,
        severity: r.severity,
        detail: r.detail,
        pinX: r.pinX,
        pinY: r.pinY,
        createdAt: r.createdAt,
      })),
      redlines: redlines.map((r) => ({
        id: r.id,
        zoneId: r.zoneId,
        violationReceiptId: r.violationReceiptId,
        clauseId: r.clauseId,
        proposedVertices: JSON.parse(r.proposedVerticesJson) as { x: number; y: number }[],
        predictedValue: r.predictedValue,
        rationale: r.rationale,
        architectNote: r.architectNote,
        authorRole: r.authorRole,
        status: r.status,
        isStale: r.status === 'STAGED' && r.baseGeometryHash !== sheet.geometryHash,
        createdAt: r.createdAt,
      })),
      learnedRules: learned.map((r) => ({ id: r.id, zoneType: r.zoneType, rule: r.ruleMd, createdAt: r.createdAt })),
    }
  },
})
