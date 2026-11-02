import { fail } from '@agent-native/core/action'
import { accessFilter } from '@agent-native/core/sharing'
import { and, asc, eq } from 'drizzle-orm'

import { analyzeSheet, type ClauseRow, type SheetAnalysis } from '../../shared/spatial/analysis.js'
import type { Door, Point, Zone } from '../../shared/spatial/geometry.js'
import { getDb, schema } from '../db/index.js'
import { SEED_SHEETS } from '../seed/sheets.js'
import { clauseHashOf, sha256 } from './firewall.js'
import { STATUTORY_CORPUS } from '../seed/statutory-corpus.js'

export { clauseHashOf, sha256 }

export type Ctx = { userEmail?: string | null; orgId?: string | null } | undefined
export type SheetRow = typeof schema.sheets.$inferSelect
export type ZoneRow = typeof schema.spatialZones.$inferSelect
export type ClauseDbRow = typeof schema.codeClauses.$inferSelect

export function nowIso(): string {
  return new Date().toISOString()
}

export function requireUser(ctx: Ctx): { ownerEmail: string; orgId: string | null } {
  const ownerEmail =
    ctx?.userEmail ?? fail('Sign in to use BlueprintOS.', { statusCode: 401, errorCode: 'unauthenticated' })
  return { ownerEmail, orgId: ctx?.orgId ?? null }
}

export function geometryHashOf(sprinklered: boolean, zones: Zone[]): string {
  const canonical = [...zones]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((z) => ({
      id: z.id,
      t: z.zoneType,
      v: z.vertices.map((p) => [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100]),
      d: [...z.doors]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((d) => [d.id, d.hingeX, d.hingeY, d.widthIn, d.swingAngleDeg, d.swingSide, d.exterior]),
    }))
  return sha256(JSON.stringify({ sprinklered, zones: canonical }))
}

export function parseVertices(json: string): Point[] {
  const value = JSON.parse(json) as unknown
  return Array.isArray(value) ? (value as Point[]) : []
}

export function parseDoors(json: string): Door[] {
  const value = JSON.parse(json) as unknown
  return Array.isArray(value) ? (value as Door[]) : []
}

export function toZone(row: ZoneRow): Zone {
  return {
    id: row.id,
    label: row.label,
    zoneType: row.zoneType,
    vertices: parseVertices(row.verticesJson),
    doors: parseDoors(row.doorsJson),
  }
}

export function toClauseRow(row: ClauseDbRow): ClauseRow {
  return {
    id: row.id,
    sectionRef: row.sectionRef,
    thresholdMetric: row.thresholdMetric,
    thresholdOperator: row.thresholdOperator,
    thresholdValue: row.thresholdValue,
    sprinkleredThresholdValue: row.sprinkleredThresholdValue,
    perOccupantIn: row.perOccupantIn,
    latchSideIn: row.latchSideIn,
    unit: row.unit,
    clauseHash: row.clauseHash,
  }
}

const pendingSeeds = new Map<string, Promise<void>>()

export function ensureWorkspace(ctx: Ctx): Promise<void> {
  const { ownerEmail } = requireUser(ctx)
  const active = pendingSeeds.get(ownerEmail)
  if (active) return active
  const task = populateStarterSheets(ctx).finally(() => pendingSeeds.delete(ownerEmail))
  pendingSeeds.set(ownerEmail, task)
  return task
}

async function populateStarterSheets(ctx: Ctx): Promise<void> {
  const { ownerEmail, orgId } = requireUser(ctx)
  const db = getDb()
  const existing = await db
    .select({ id: schema.codeClauses.id })
    .from(schema.codeClauses)
    .where(eq(schema.codeClauses.ownerEmail, ownerEmail))
    .limit(1)
  if (existing.length) return
  const visibility = orgId ? ('org' as const) : ('private' as const)
  await db.transaction(async (tx) => {
    await tx.insert(schema.codeClauses).values(
      STATUTORY_CORPUS.map((c) => ({
        id: crypto.randomUUID(),
        ...c,
        clauseHash: clauseHashOf(c),
        ownerEmail,
        orgId,
        visibility,
      })),
    )
    for (const seed of SEED_SHEETS) {
      const sheetId = crypto.randomUUID()
      const zones: Zone[] = seed.zones.map((z) => ({
        id: crypto.randomUUID(),
        label: z.label,
        zoneType: z.zoneType,
        vertices: z.vertices,
        doors: z.doors.map((d) => ({ ...d, id: `${d.id}-${sheetId.slice(0, 6)}` })),
      }))
      await tx.insert(schema.sheets).values({
        id: sheetId,
        sheetNumber: seed.sheetNumber,
        title: seed.title,
        projectCode: seed.projectCode,
        sprinklered: seed.sprinklered,
        geometryHash: geometryHashOf(seed.sprinklered, zones),
        updatedAt: nowIso(),
        ownerEmail,
        orgId,
        visibility,
      })
      await tx.insert(schema.spatialZones).values(
        zones.map((z, i) => ({
          id: z.id,
          sheetId,
          label: z.label,
          zoneType: z.zoneType,
          verticesJson: JSON.stringify(z.vertices),
          doorsJson: JSON.stringify(z.doors),
          sortOrder: i,
          ownerEmail,
          orgId,
          visibility,
        })),
      )
    }
  })
}

export async function loadSheet(id: string): Promise<SheetRow> {
  const { sheets, sheetShares } = schema
  const [row] = await getDb()
    .select()
    .from(sheets)
    .where(and(eq(sheets.id, id), accessFilter(sheets, sheetShares)))
    .limit(1)
  if (!row) fail('Sheet not found.', { errorCode: 'not_found', statusCode: 404 })
  return row
}

export async function loadZoneRows(sheet: SheetRow): Promise<ZoneRow[]> {
  return getDb()
    .select()
    .from(schema.spatialZones)
    .where(and(eq(schema.spatialZones.sheetId, sheet.id), eq(schema.spatialZones.ownerEmail, sheet.ownerEmail)))
    .orderBy(asc(schema.spatialZones.sortOrder))
    .limit(200)
}

export async function loadClauses(ownerEmail: string): Promise<ClauseDbRow[]> {
  return getDb()
    .select()
    .from(schema.codeClauses)
    .where(eq(schema.codeClauses.ownerEmail, ownerEmail))
    .orderBy(asc(schema.codeClauses.sectionRef))
    .limit(100)
}

// Persist exact metrics on every zone and refresh the sheet's geometry hash.
// Any geometry change after a seal flips it to STALE_REQUIRES_REAUDIT.
export async function recomputeSheet(sheet: SheetRow): Promise<{ sheet: SheetRow; analysis: SheetAnalysis; zones: Zone[] }> {
  const rows = await loadZoneRows(sheet)
  const zones = rows.map(toZone)
  const clauses = (await loadClauses(sheet.ownerEmail)).map(toClauseRow)
  const analysis = analyzeSheet(zones, sheet.sprinklered, clauses)
  const geometryHash = geometryHashOf(sheet.sprinklered, zones)
  const db = getDb()
  for (const m of analysis.zones) {
    await db
      .update(schema.spatialZones)
      .set({
        computedAreaSqft: m.areaSqft,
        perimeterFt: m.perimeterFt,
        minDimensionIn: m.minDimensionIn,
        occupantLoad: m.occupantLoad,
        egressDistanceFt: m.egressDistanceFt,
        doorWidthIn: m.doorWidthIn,
        deadEndFt: m.deadEndFt,
      })
      .where(and(eq(schema.spatialZones.id, m.zoneId), eq(schema.spatialZones.ownerEmail, sheet.ownerEmail)))
  }
  const changed = geometryHash !== sheet.geometryHash
  const sealStatus =
    changed && sheet.sealStatus === 'SEALED' ? ('STALE_REQUIRES_REAUDIT' as const) : sheet.sealStatus
  const [updated] = await db
    .update(schema.sheets)
    .set({ geometryHash, sealStatus, updatedAt: changed ? nowIso() : sheet.updatedAt })
    .where(and(eq(schema.sheets.id, sheet.id), eq(schema.sheets.ownerEmail, sheet.ownerEmail)))
    .returning()
  return { sheet: updated ?? sheet, analysis, zones }
}

export type AuditSummary = {
  geometryHash: string
  critical: number
  warning: number
  pass: number
  receiptCount: number
}

// check-clearances: measure, then write one receipt per (clause, subject).
export async function runAudit(sheetIn: SheetRow): Promise<AuditSummary> {
  const { sheet, analysis } = await recomputeSheet(sheetIn)
  const createdAt = nowIso()
  const rows = analysis.evaluations.map((e) => ({
    id: crypto.randomUUID(),
    sheetId: sheet.id,
    zoneId: e.zoneId,
    clauseId: e.clauseId,
    clauseHash: e.clauseHash,
    sectionRef: e.sectionRef,
    geometryHash: sheet.geometryHash,
    subjectRef: e.subjectRef,
    measuredValue: e.measuredValue,
    requiredValue: e.requiredValue,
    severity: e.severity,
    detail: e.detail,
    pinX: e.pin.x,
    pinY: e.pin.y,
    createdAt,
    ownerEmail: sheet.ownerEmail,
    orgId: sheet.orgId,
    visibility: sheet.visibility,
  }))
  const db = getDb()
  const existing = await db
    .select({ id: schema.violationReceipts.id, clauseHash: schema.violationReceipts.clauseHash, severity: schema.violationReceipts.severity })
    .from(schema.violationReceipts)
    .where(
      and(
        eq(schema.violationReceipts.sheetId, sheet.id),
        eq(schema.violationReceipts.ownerEmail, sheet.ownerEmail),
        eq(schema.violationReceipts.geometryHash, sheet.geometryHash),
      ),
    )
    .limit(5000)
  // The engine is deterministic: the same geometry under the same clause
  // hashes yields the same receipts, so keep them (and any citations of them).
  const sameClauses =
    existing.length === rows.length &&
    [...new Set(existing.map((r) => r.clauseHash))].sort().join() === [...new Set(rows.map((r) => r.clauseHash))].sort().join()
  if (sameClauses) {
    await db
      .update(schema.sheets)
      .set({ auditedGeometryHash: sheet.geometryHash })
      .where(and(eq(schema.sheets.id, sheet.id), eq(schema.sheets.ownerEmail, sheet.ownerEmail)))
    return {
      geometryHash: sheet.geometryHash,
      critical: existing.filter((r) => r.severity === 'CRITICAL').length,
      warning: existing.filter((r) => r.severity === 'WARNING').length,
      pass: existing.filter((r) => r.severity === 'PASS').length,
      receiptCount: existing.length,
    }
  }
  await db.transaction(async (tx) => {
    // Older geometry generations remain so a stale citation is recognised as
    // stale rather than unknown; a changed corpus replaces this generation.
    await tx
      .delete(schema.violationReceipts)
      .where(
        and(
          eq(schema.violationReceipts.sheetId, sheet.id),
          eq(schema.violationReceipts.ownerEmail, sheet.ownerEmail),
          eq(schema.violationReceipts.geometryHash, sheet.geometryHash),
        ),
      )
    if (rows.length) await tx.insert(schema.violationReceipts).values(rows)
    await tx
      .update(schema.sheets)
      .set({ auditedGeometryHash: sheet.geometryHash })
      .where(and(eq(schema.sheets.id, sheet.id), eq(schema.sheets.ownerEmail, sheet.ownerEmail)))
  })
  return {
    geometryHash: sheet.geometryHash,
    critical: rows.filter((r) => r.severity === 'CRITICAL').length,
    warning: rows.filter((r) => r.severity === 'WARNING').length,
    pass: rows.filter((r) => r.severity === 'PASS').length,
    receiptCount: rows.length,
  }
}

export function validatePolygon(vertices: Point[]): void {
  if (vertices.length < 3) fail('A zone polygon needs at least 3 vertices.', { errorCode: 'invalid_polygon' })
  for (const p of vertices) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 100000 || Math.abs(p.y) > 100000) {
      fail('Vertices must be finite inches within ±100000.', { errorCode: 'invalid_polygon' })
    }
  }
}
