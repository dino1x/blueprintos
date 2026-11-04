import { defineAction, fail } from '@agent-native/core/action'
import { assertAccess } from '@agent-native/core/sharing'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import {
  loadSheet,
  loadZoneRows,
  parseDoors,
  parseVertices,
  recomputeSheet,
  validatePolygon,
} from '../server/compliance/desk.js'
import { pointSchema } from '../server/compliance/contracts.js'
import { getDb, schema } from '../server/db/index.js'

// Human-only geometry edit: the agent never moves walls directly; it stages cited changes through propose-redline.
export default defineAction({
  description:
    'Architect only. Edit geometry on a sheet: move one vertex (vertexIndex + x + y), replace a whole polygon (vertices), or change one door (door patch). Recomputes the zone metrics and the sheet geometry hash; a SEALED sheet becomes STALE_REQUIRES_REAUDIT. Existing violation receipts become stale — run check-clearances afterwards.',
  schema: z.object({
    sheetId: z.string().describe('Sheet id'),
    zoneId: z.string().describe('Zone id whose geometry changes'),
    vertexIndex: z.number().int().min(0).optional().describe('Index of the vertex to move (use with x and y)'),
    x: z.number().optional().describe('New X of the moved vertex, inches'),
    y: z.number().optional().describe('New Y of the moved vertex, inches'),
    vertices: z.array(pointSchema).min(3).max(64).optional().describe('Full replacement polygon in inches, in drawing order'),
    door: z
      .object({
        doorId: z.string().describe('Door id on this zone'),
        widthIn: z.number().positive().max(144).optional().describe('New clear width in inches'),
        hingeX: z.number().optional().describe('New hinge X in inches'),
        hingeY: z.number().optional().describe('New hinge Y in inches'),
        swingAngleDeg: z.number().optional().describe('New wall direction from hinge, degrees'),
        swingSide: z.union([z.literal(1), z.literal(-1)]).optional().describe('New swing side'),
      })
      .optional()
      .describe('Door parameter patch'),
  }),
  outputSchema: z.object({
    sheetId: z.string(),
    zoneId: z.string(),
    geometryHash: z.string(),
    sealStatus: z.string(),
    sealInvalidated: z.boolean(),
    areaSqft: z.number(),
    minDimensionIn: z.number(),
    egressDistanceFt: z.number().nullable(),
    nextRequiredAction: z.string(),
  }),
  mcpAnnotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  agentTool: false,
  uiOnly: true,
  changeResource: (input) => ({ resourceType: 'sheet', resourceId: input.sheetId }),
  run: async (args) => {
    await assertAccess('sheet', args.sheetId, 'editor')
    const sheet = await loadSheet(args.sheetId)
    const rows = await loadZoneRows(sheet)
    const zone = rows.find((r) => r.id === args.zoneId)
    if (!zone) fail('Zone not found on this sheet.', { errorCode: 'zone_not_found', statusCode: 404 })
    let vertices = parseVertices(zone.verticesJson)
    let doors = parseDoors(zone.doorsJson)
    let changed = false
    if (args.vertices) {
      vertices = args.vertices
      changed = true
    }
    if (args.vertexIndex !== undefined) {
      if (args.x === undefined || args.y === undefined) fail('Moving a vertex needs x and y.', { errorCode: 'invalid_move' })
      if (args.vertexIndex >= vertices.length) fail(`Vertex ${args.vertexIndex} does not exist (zone has ${vertices.length}).`, { errorCode: 'invalid_move' })
      vertices = vertices.map((p, i) => (i === args.vertexIndex ? { x: args.x!, y: args.y! } : p))
      changed = true
    }
    if (args.door) {
      const patch = args.door
      if (!doors.some((d) => d.id === patch.doorId)) fail('Door not found on this zone.', { errorCode: 'door_not_found', statusCode: 404 })
      doors = doors.map((d) =>
        d.id === patch.doorId
          ? {
              ...d,
              ...(patch.widthIn !== undefined ? { widthIn: patch.widthIn } : {}),
              ...(patch.hingeX !== undefined ? { hingeX: patch.hingeX } : {}),
              ...(patch.hingeY !== undefined ? { hingeY: patch.hingeY } : {}),
              ...(patch.swingAngleDeg !== undefined ? { swingAngleDeg: patch.swingAngleDeg } : {}),
              ...(patch.swingSide !== undefined ? { swingSide: patch.swingSide } : {}),
            }
          : d,
      )
      changed = true
    }
    if (!changed) fail('Nothing to change: pass vertexIndex+x+y, vertices, or door.', { errorCode: 'empty_edit' })
    validatePolygon(vertices)
    await getDb()
      .update(schema.spatialZones)
      .set({ verticesJson: JSON.stringify(vertices), doorsJson: JSON.stringify(doors) })
      .where(and(eq(schema.spatialZones.id, zone.id), eq(schema.spatialZones.ownerEmail, sheet.ownerEmail)))
    const wasSealed = sheet.sealStatus === 'SEALED'
    const { sheet: updated, analysis } = await recomputeSheet(sheet)
    const m = analysis.zones.find((z) => z.zoneId === zone.id)!
    return {
      sheetId: updated.id,
      zoneId: zone.id,
      geometryHash: updated.geometryHash,
      sealStatus: updated.sealStatus,
      sealInvalidated: wasSealed && updated.sealStatus === 'STALE_REQUIRES_REAUDIT',
      areaSqft: m.areaSqft,
      minDimensionIn: m.minDimensionIn,
      egressDistanceFt: m.egressDistanceFt,
      nextRequiredAction: 'check-clearances',
    }
  },
})
