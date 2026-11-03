import { defineAction } from '@agent-native/core/action'
import { assertAccess } from '@agent-native/core/sharing'
import { z } from 'zod'

import { loadSheet, runAudit } from '../server/compliance/desk.js'
import { auditSummarySchema } from '../server/compliance/contracts.js'

export default defineAction({
  description:
    "Run the clearance audit on a sheet: Shoelace area, opposing-wall clear width, Dijkstra egress distance over the door/visibility graph, occupant load (IBC Table 1004.5), door capacity at 0.2 in per occupant served, dead-end runs, and pull-side door maneuvering depth — evaluated against every clause in code_clauses. Writes one violation receipt per (clause, zone/door) stamped with the sheet's SHA-256 geometry hash. Receipt ids from this audit are what propose-redline must cite.",
  schema: z.object({ id: z.string().describe('Sheet id to audit') }),
  outputSchema: auditSummarySchema.extend({ id: z.string(), message: z.string() }),
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  changeResource: (input) => ({ resourceType: 'sheet', resourceId: input.id }),
  run: async ({ id }) => {
    await assertAccess('sheet', id, 'viewer')
    const sheet = await loadSheet(id)
    const summary = await runAudit(sheet)
    return {
      id: sheet.id,
      ...summary,
      message: `${summary.critical} CRITICAL, ${summary.warning} WARNING, ${summary.pass} PASS on geometry ${summary.geometryHash.slice(0, 12)}`,
    }
  },
})
