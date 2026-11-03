import { defineAction, fail } from '@agent-native/core/action'
import { writeAppStateForCurrentTab } from '@agent-native/core/application-state'
import { z } from 'zod'

export default defineAction({
  description:
    "Move the architect's view: open the drawing register (view \"sheets\"), open a sheet, select a zone polygon, select a violation pin, or focus a statutory clause. Also accepts a raw path or chat thread.",
  schema: z.object({
    view: z.enum(['sheets', 'chat', 'home', 'settings']).optional().describe('Named view'),
    path: z.string().optional().describe('Explicit in-app path, e.g. /sheets/<id>?zone=<zoneId>'),
    sheetId: z.string().optional().describe('Sheet to open'),
    zoneId: z.string().optional().describe('Zone polygon to select on the canvas'),
    violationId: z.string().optional().describe('Violation receipt id whose pin to select'),
    clauseId: z.string().optional().describe('Clause id to open in the code panel'),
    threadId: z.string().optional().describe('Chat thread id when view is chat'),
  }),
  outputSchema: z.object({ path: z.string(), message: z.string() }),
  http: false,
  run: async (args) => {
    let path = args.path ?? ''
    if (!path && args.sheetId) {
      const q = new URLSearchParams()
      if (args.zoneId) q.set('zone', args.zoneId)
      if (args.violationId) q.set('violation', args.violationId)
      if (args.clauseId) q.set('clause', args.clauseId)
      const query = q.toString()
      path = `/sheets/${encodeURIComponent(args.sheetId)}${query ? `?${query}` : ''}`
    }
    if (!path && args.view === 'sheets') path = '/sheets'
    if (!path && !args.view) fail('Pass a view, path, or sheetId.', { errorCode: 'missing_target' })
    const nav: Record<string, string> = { _writeId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }
    if (args.view) nav.view = args.view
    if (path) nav.path = path
    if (args.threadId) nav.threadId = args.threadId
    await writeAppStateForCurrentTab('navigate', nav)
    return { path: path || `view:${args.view}`, message: `Navigating to ${path || args.view}` }
  },
})
