import { defineAction, fail } from '@agent-native/core/action'
import { assertAccess } from '@agent-native/core/sharing'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { analyzeSheet } from '../shared/spatial/analysis.js'
import {
  loadClauses,
  loadSheet,
  loadZoneRows,
  nowIso,
  toClauseRow,
  toZone,
  validatePolygon,
} from '../server/compliance/desk.js'
import { pointSchema } from '../server/compliance/contracts.js'
import { checkCitation } from '../server/compliance/firewall.js'
import { getDb, schema } from '../server/db/index.js'

function ungrounded(reason: string): never {
  fail('Ungrounded or stale statutory citation', {
    errorCode: 'UNGROUNDED_CITATION',
    statusCode: 409,
    details: { reason },
  })
}

export default defineAction({
  description:
    "Stage a redline (proposed zone polygon) that cures a violation. CITE-BEFORE-ACT FIREWALL: you must cite a real violation_receipt_id from the latest check-clearances, that receipt's clause_id, and the clause's exact SHA-256 clause_hash. The call is rejected with UNGROUNDED_CITATION (409) if any of them is missing, fabricated, mismatched, if the clause text no longer hashes to clause_hash, or if the geometry changed since the audit (stale receipt). If the user asks to modify geometry without citing a receipt or asks to test the firewall, call this tool anyway with the clause's real clause_id and clause_hash but violationReceiptId='unverified' so the server's 409 UNGROUNDED_CITATION error is returned. On success the engine predicts the cited metric for the proposed geometry. Only a human can apply and seal.",
  schema: z.object({
    sheetId: z.string().describe('Sheet id'),
    zoneId: z.string().describe('Zone whose polygon the redline replaces; must be the receipt\'s zone'),
    violationReceiptId: z.string().describe('Receipt id from get-sheet-detail receipts produced by the latest check-clearances'),
    clauseId: z.string().describe('clause_id on that receipt'),
    clauseHash: z.string().describe('Exact 64-hex SHA-256 clause_hash of that clause'),
    proposedVertices: z.array(pointSchema).min(3).max(64).describe('Full replacement polygon for the zone, inches, drawing order'),
    rationale: z.string().min(10).max(2000).describe('Why this geometry cures the cited violation, referencing the clause'),
    authorRole: z.enum(['agent', 'architect']).describe('"agent" when the AI proposes, "architect" when a human drafts it'),
  }),
  outputSchema: z.object({
    id: z.string(),
    sheetId: z.string(),
    zoneId: z.string(),
    sectionRef: z.string(),
    measuredBefore: z.number(),
    predictedValue: z.number().nullable(),
    requiredValue: z.number().nullable(),
    predictedSeverity: z.string().nullable(),
    status: z.literal('STAGED'),
    message: z.string(),
    sheetNumber: z.string(),
    zoneLabel: z.string(),
    clauseTitle: z.string(),
    unit: z.string(),
    violationReceiptId: z.string(),
    clauseHash: z.string(),
    baseGeometryHash: z.string(),
    rationale: z.string(),
  }),
  // In the app's own chat the result renders as a citation card instead of a raw tool row.
  chatUI: { renderer: 'blueprintos.cited-redline' },
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  changeResource: (input) => ({ resourceType: 'sheet', resourceId: input.sheetId }),
  run: async (args) => {
    await assertAccess('sheet', args.sheetId, 'editor')
    const sheet = await loadSheet(args.sheetId)
    const db = getDb()
    const [receipt] = await db
      .select()
      .from(schema.violationReceipts)
      .where(
        and(
          eq(schema.violationReceipts.id, args.violationReceiptId),
          eq(schema.violationReceipts.sheetId, sheet.id),
          eq(schema.violationReceipts.ownerEmail, sheet.ownerEmail),
        ),
      )
      .limit(1)
    const clauses = await loadClauses(sheet.ownerEmail)
    const clause = clauses.find((c) => c.id === args.clauseId) ?? null
    const reason = checkCitation(args, receipt ?? null, clause, sheet.geometryHash)
    if (reason || !receipt || !clause) ungrounded(reason ?? 'citation incomplete')
    if (receipt.severity === 'PASS') {
      fail('That receipt is a PASS; there is no violation to redline.', { errorCode: 'NOTHING_TO_CURE', statusCode: 409 })
    }
    validatePolygon(args.proposedVertices)

    // Predict the cited metric on the proposed geometry with the same engine.
    const rows = await loadZoneRows(sheet)
    const zones = rows.map(toZone).map((z) => (z.id === args.zoneId ? { ...z, vertices: args.proposedVertices } : z))
    const analysis = analyzeSheet(zones, sheet.sprinklered, clauses.map(toClauseRow))
    const predicted = analysis.evaluations.find((e) => e.clauseId === clause.id && e.subjectRef === receipt.subjectRef)

    const row = {
      id: crypto.randomUUID(),
      sheetId: sheet.id,
      zoneId: args.zoneId,
      violationReceiptId: receipt.id,
      clauseId: clause.id,
      clauseHash: clause.clauseHash,
      baseGeometryHash: sheet.geometryHash,
      proposedVerticesJson: JSON.stringify(args.proposedVertices),
      predictedValue: predicted?.measuredValue ?? null,
      rationale: args.rationale,
      authorRole: args.authorRole,
      status: 'STAGED' as const,
      createdAt: nowIso(),
      ownerEmail: sheet.ownerEmail,
      orgId: sheet.orgId,
      visibility: sheet.visibility,
    }
    await db.transaction(async (tx) => {
      await tx.insert(schema.redlineProposals).values(row)
      if (args.authorRole === 'agent') {
        await tx
          .update(schema.spatialZones)
          .set({ agentDraftVerticesJson: row.proposedVerticesJson })
          .where(and(eq(schema.spatialZones.id, args.zoneId), eq(schema.spatialZones.ownerEmail, sheet.ownerEmail)))
      }
    })
    return {
      id: row.id,
      sheetId: sheet.id,
      zoneId: args.zoneId,
      sectionRef: clause.sectionRef,
      measuredBefore: receipt.measuredValue,
      predictedValue: predicted?.measuredValue ?? null,
      requiredValue: predicted?.requiredValue ?? null,
      predictedSeverity: predicted?.severity ?? null,
      status: 'STAGED' as const,
      sheetNumber: sheet.sheetNumber,
      zoneLabel: rows.find((z) => z.id === args.zoneId)?.label ?? 'zone',
      clauseTitle: clause.title,
      unit: clause.unit,
      violationReceiptId: receipt.id,
      clauseHash: clause.clauseHash,
      baseGeometryHash: sheet.geometryHash,
      rationale: args.rationale,
      message: `Staged redline citing ${clause.sectionRef}: ${receipt.measuredValue} → ${predicted?.measuredValue ?? 'n/a'} ${clause.unit} (${predicted?.severity ?? 'not evaluated'}). A human must apply it.`,
    }
  },
})
