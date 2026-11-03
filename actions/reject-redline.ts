import { defineAction, fail } from '@agent-native/core/action'
import { assertAccess } from '@agent-native/core/sharing'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { loadSheet } from '../server/compliance/desk.js'
import { getDb, schema } from '../server/db/index.js'

export default defineAction({
  description: 'Reject a STAGED redline proposal, optionally recording the architect\'s note explaining why.',
  schema: z.object({
    sheetId: z.string().describe('Sheet id'),
    redlineId: z.string().describe('Redline proposal id (status STAGED)'),
    architectNote: z.string().max(2000).optional().describe('Reviewer note recorded on the redline'),
  }),
  outputSchema: z.object({ id: z.string(), status: z.literal('REJECTED') }),
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  changeResource: (input) => ({ resourceType: 'sheet', resourceId: input.sheetId }),
  run: async ({ sheetId, redlineId, architectNote }) => {
    await assertAccess('sheet', sheetId, 'editor')
    const sheet = await loadSheet(sheetId)
    const [row] = await getDb()
      .update(schema.redlineProposals)
      .set({ status: 'REJECTED', ...(architectNote ? { architectNote } : {}) })
      .where(
        and(
          eq(schema.redlineProposals.id, redlineId),
          eq(schema.redlineProposals.sheetId, sheet.id),
          eq(schema.redlineProposals.ownerEmail, sheet.ownerEmail),
          eq(schema.redlineProposals.status, 'STAGED'),
        ),
      )
      .returning({ id: schema.redlineProposals.id })
    if (!row) fail('No staged redline with that id.', { errorCode: 'not_staged', statusCode: 409 })
    return { id: row.id, status: 'REJECTED' as const }
  },
})
