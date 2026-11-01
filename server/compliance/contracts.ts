import { z } from 'zod'

import { ZONE_TYPES } from '../../shared/spatial/geometry.js'

export const pointSchema = z.object({
  x: z.number().describe('X in inches, sheet space (right is positive)'),
  y: z.number().describe('Y in inches, sheet space (down is positive)'),
})

export const doorSchema = z.object({
  id: z.string().min(1).describe('Stable door id, unique within the sheet'),
  label: z.string().describe('Door label, e.g. "Bedroom door"'),
  hingeX: z.number().describe('Hinge point X in inches'),
  hingeY: z.number().describe('Hinge point Y in inches'),
  widthIn: z.number().positive().describe('Clear opening width in inches'),
  swingAngleDeg: z.number().describe('Direction of the door opening along the wall from the hinge, degrees (0 = +x, 90 = +y)'),
  swingSide: z.union([z.literal(1), z.literal(-1)]).describe('Which side of the wall the leaf swings into: 1 = left normal of the wall direction, -1 = right'),
  exterior: z.boolean().describe('True when the door discharges to the exterior (an exit)'),
})

export const zoneTypeSchema = z.enum(ZONE_TYPES)

export const severitySchema = z.enum(['CRITICAL', 'WARNING', 'PASS'])

export const receiptSchema = z.object({
  id: z.string(),
  zoneId: z.string(),
  clauseId: z.string(),
  clauseHash: z.string(),
  sectionRef: z.string(),
  geometryHash: z.string(),
  subjectRef: z.string(),
  measuredValue: z.number(),
  requiredValue: z.number(),
  severity: severitySchema,
  detail: z.string(),
  pinX: z.number(),
  pinY: z.number(),
  createdAt: z.string(),
})

export const auditSummarySchema = z.object({
  geometryHash: z.string(),
  critical: z.number(),
  warning: z.number(),
  pass: z.number(),
  receiptCount: z.number(),
})
