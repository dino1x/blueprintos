import { defineAction, fail } from '@agent-native/core/action'
import { buildDeepLink } from '@agent-native/core/server'
import { z } from 'zod'

import {
  ensureWorkspace,
  geometryHashOf,
  nowIso,
  requireUser,
  validatePolygon,
} from '../server/compliance/desk.js'
import { doorSchema, pointSchema, zoneTypeSchema } from '../server/compliance/contracts.js'
import { getDb, schema } from '../server/db/index.js'

export default defineAction({
  description:
    'Import a floorplan JSON (the same shape the canvas exports) as a new sheet: title block plus zones with polygons in inches and doors. Run check-clearances afterwards.',
  schema: z.object({
    sheetNumber: z.string().min(1).max(20).describe('Sheet number, e.g. "A-301"'),
    title: z.string().min(1).max(120).describe('Drawing title'),
    projectCode: z.string().min(1).max(40).describe('Project code for the title block'),
    sprinklered: z.boolean().describe('Whether the building has an automatic sprinkler system (changes IBC 1017.2 limits)'),
    zones: z
      .array(
        z.object({
          label: z.string().min(1).describe('Room label'),
          zoneType: zoneTypeSchema.describe('corridor | office | assembly | restroom | exit_stair | lobby'),
          vertices: z.array(pointSchema).min(3).max(64).describe('Polygon in inches'),
          doors: z.array(doorSchema).max(12).describe('Doors owned by this zone'),
        }),
      )
      .min(1)
      .max(80)
      .describe('Zones in drawing order'),
  }),
  outputSchema: z.object({ id: z.string(), title: z.string(), zoneCount: z.number(), nextRequiredAction: z.string() }),
  link: ({ result }) => ({
    url: buildDeepLink({ view: 'sheet', to: `/sheets/${encodeURIComponent(result.id)}`, params: { sheetId: result.id } }),
    label: `Open ${result.title}`,
  }),
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  run: async (args, ctx) => {
    const { ownerEmail, orgId } = requireUser(ctx)
    await ensureWorkspace(ctx)
    const doorIds = args.zones.flatMap((z) => z.doors.map((d) => d.id))
    if (new Set(doorIds).size !== doorIds.length) fail('Door ids must be unique within the sheet.', { errorCode: 'duplicate_door' })
    args.zones.forEach((z) => validatePolygon(z.vertices))
    const sheetId = crypto.randomUUID()
    const zones = args.zones.map((z) => ({ id: crypto.randomUUID(), label: z.label, zoneType: z.zoneType, vertices: z.vertices, doors: z.doors }))
    const visibility = orgId ? ('org' as const) : ('private' as const)
    await getDb().transaction(async (tx) => {
      await tx.insert(schema.sheets).values({
        id: sheetId,
        sheetNumber: args.sheetNumber,
        title: args.title,
        projectCode: args.projectCode,
        sprinklered: args.sprinklered,
        geometryHash: geometryHashOf(args.sprinklered, zones),
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
    })
    return { id: sheetId, title: args.title, zoneCount: zones.length, nextRequiredAction: 'check-clearances' }
  },
})
