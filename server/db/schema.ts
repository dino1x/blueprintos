import { createSharesTable, ownableColumns } from '@agent-native/core/db/schema'
import { sql } from 'drizzle-orm'
import { boolean, doublePrecision, integer, pgTable, text } from 'drizzle-orm/pg-core'

// A sheet is the shareable drawing. Zones, receipts and redlines are its
// children and copy the sheet's owner/org; the statutory corpus is
// per-workspace so each tenant can verify the hashes it cites.

export const sheets = pgTable('sheets', {
  id: text('id').primaryKey(),
  sheetNumber: text('sheet_number').notNull(),
  title: text('title').notNull(),
  projectCode: text('project_code').notNull(),
  scaleUnit: text('scale_unit').notNull().default('in'),
  sprinklered: boolean('sprinklered').notNull().default(false),
  geometryHash: text('geometry_hash').notNull(),
  auditedGeometryHash: text('audited_geometry_hash'),
  sealStatus: text('seal_status', { enum: ['UNSEALED', 'SEALED', 'STALE_REQUIRES_REAUDIT'] })
    .notNull()
    .default('UNSEALED'),
  sealedBy: text('sealed_by'),
  sealedAt: text('sealed_at'),
  sealedGeometryHash: text('sealed_geometry_hash'),
  updatedAt: text('updated_at').notNull().default(sql`now()`),
  ...ownableColumns(),
})
export const sheetShares = createSharesTable('sheet_shares')

export const spatialZones = pgTable('spatial_zones', {
  id: text('id').primaryKey(),
  sheetId: text('sheet_id').notNull(),
  label: text('label').notNull(),
  zoneType: text('zone_type', {
    enum: ['corridor', 'office', 'assembly', 'restroom', 'exit_stair', 'lobby'],
  }).notNull(),
  verticesJson: text('vertices_json').notNull(),
  doorsJson: text('doors_json').notNull().default('[]'),
  computedAreaSqft: doublePrecision('computed_area_sqft'),
  perimeterFt: doublePrecision('perimeter_ft'),
  minDimensionIn: doublePrecision('min_dimension_in'),
  occupantLoad: integer('occupant_load'),
  egressDistanceFt: doublePrecision('egress_distance_ft'),
  doorWidthIn: doublePrecision('door_width_in'),
  deadEndFt: doublePrecision('dead_end_ft'),
  agentDraftVerticesJson: text('agent_draft_vertices_json'),
  sortOrder: integer('sort_order').notNull().default(0),
  ...ownableColumns(),
})

export const codeClauses = pgTable('code_clauses', {
  id: text('id').primaryKey(),
  codeStandard: text('code_standard').notNull(),
  sectionRef: text('section_ref').notNull(),
  title: text('title').notNull(),
  verbatimText: text('verbatim_text').notNull(),
  thresholdMetric: text('threshold_metric').notNull(),
  thresholdOperator: text('threshold_operator', { enum: ['>=', '<='] }).notNull(),
  thresholdValue: doublePrecision('threshold_value').notNull(),
  sprinkleredThresholdValue: doublePrecision('sprinklered_threshold_value'),
  perOccupantIn: doublePrecision('per_occupant_in'),
  latchSideIn: doublePrecision('latch_side_in'),
  unit: text('unit').notNull(),
  clauseHash: text('clause_hash').notNull(),
  ...ownableColumns(),
})

export const violationReceipts = pgTable('violation_receipts', {
  id: text('id').primaryKey(),
  sheetId: text('sheet_id').notNull(),
  zoneId: text('zone_id').notNull(),
  clauseId: text('clause_id').notNull(),
  clauseHash: text('clause_hash').notNull(),
  sectionRef: text('section_ref').notNull(),
  geometryHash: text('geometry_hash').notNull(),
  subjectRef: text('subject_ref').notNull(),
  measuredValue: doublePrecision('measured_value').notNull(),
  requiredValue: doublePrecision('required_value').notNull(),
  severity: text('severity', { enum: ['CRITICAL', 'WARNING', 'PASS'] }).notNull(),
  detail: text('detail').notNull(),
  pinX: doublePrecision('pin_x').notNull(),
  pinY: doublePrecision('pin_y').notNull(),
  createdAt: text('created_at').notNull().default(sql`now()`),
  ...ownableColumns(),
})

export const redlineProposals = pgTable('redline_proposals', {
  id: text('id').primaryKey(),
  sheetId: text('sheet_id').notNull(),
  zoneId: text('zone_id').notNull(),
  violationReceiptId: text('violation_receipt_id').notNull(),
  clauseId: text('clause_id').notNull(),
  clauseHash: text('clause_hash').notNull(),
  baseGeometryHash: text('base_geometry_hash').notNull(),
  proposedVerticesJson: text('proposed_vertices_json').notNull(),
  predictedValue: doublePrecision('predicted_value'),
  rationale: text('rationale').notNull(),
  architectNote: text('architect_note'),
  authorRole: text('author_role', { enum: ['agent', 'architect'] }).notNull(),
  status: text('status', { enum: ['STAGED', 'APPLIED', 'REJECTED'] }).notNull().default('STAGED'),
  createdAt: text('created_at').notNull().default(sql`now()`),
  ...ownableColumns(),
})

// Constraints learned from architect hand edits. SQL is the durable copy; the skill file mirrors it when writable.
export const learnedSpatialRules = pgTable('learned_spatial_rules', {
  id: text('id').primaryKey(),
  sheetId: text('sheet_id').notNull(),
  zoneId: text('zone_id').notNull(),
  zoneType: text('zone_type').notNull(),
  ruleMd: text('rule_md').notNull(),
  createdAt: text('created_at').notNull(),
  ...ownableColumns(),
})
