import { getOrgContext } from '@agent-native/core/org'
import { createAgentChatPlugin, loadActionsFromStaticRegistry } from '@agent-native/core/server'

import { desc, eq } from 'drizzle-orm'

import { checkTurnBudget } from '../compliance/turn-budget.js'
import actionsRegistry from '../../.generated/actions-registry.js'
import { getDb, schema } from '../db/index.js'

const INITIAL_TOOL_NAMES = [
  'view-screen',
  'navigate',
  'list-sheets',
  'get-sheet-detail',
  'check-clearances',
  'propose-redline',
  'learn-compliance-rule',
  'ask-question',
]

export default createAgentChatPlugin({
  appId: 'blueprintos',
  actions: loadActionsFromStaticRegistry(actionsRegistry),
  mcp: {
    connectorCatalog: [],
    appApprovalPage: true,
    keyToolNames: ['list-sheets', 'get-sheet-detail', 'check-clearances', 'propose-redline', 'import-floorplan'],
  },
  initialToolNames: INITIAL_TOOL_NAMES,
  // Enforce hourly prompt budget when DEMO_AGENT_TURNS_PER_HOUR is set on hosted previews.
  prepareRequest: (details) => checkTurnBudget(details),
  // Inject architect-verified spatial conventions into each turn's context block.
  extraContext: async (_event, owner) => {
    const rules = await getDb()
      .select({ zoneType: schema.learnedSpatialRules.zoneType, ruleMd: schema.learnedSpatialRules.ruleMd })
      .from(schema.learnedSpatialRules)
      .where(eq(schema.learnedSpatialRules.ownerEmail, owner))
      .orderBy(desc(schema.learnedSpatialRules.createdAt))
      .limit(12)
    if (!rules.length) return '<learned-spatial-rules>None yet.</learned-spatial-rules>'
    return [
      '<learned-spatial-rules>',
      'Architects refined earlier compliance redlines. Follow these dimensional bounds when proposing geometry for matching zone types, and note in your response when a learned convention was applied.',
      ...rules.map((r) => `- ${r.zoneType}: ${r.ruleMd.replace(/\n+/g, ' ')}`),
      '</learned-spatial-rules>',
    ].join('\n')
  },
  resolveOrgId: async (event) => (await getOrgContext(event)).orgId,
  systemPrompt: `You are the BlueprintOS compliance agent. You co-edit 2D floorplans with a licensed architect and cure building-code violations, citing the code exactly.

Coordinates are inches in sheet space (x right, y down). <current-screen> carries the open sheetId, selectedZoneId, selectedViolationId (a receipt id), activeClauseId and the pin coordinates. Call view-screen for the polygon vertices, the receipt's measured vs required values and the clause hash.

CITE BEFORE ACT: never propose geometry without a fresh citation. Run check-clearances, read the receipt id and clause_hash from get-sheet-detail or view-screen, then call propose-redline with author_role "agent". UNGROUNDED_CITATION (409) means your citation was fabricated, mismatched or stale (the geometry changed) — re-run check-clearances and cite again; never guess hashes. However, if the user explicitly asks you to propose a change without citing a receipt or asks to test the firewall, call propose-redline directly (e.g. violationReceiptId: "unverified", clauseId: "IBC-1208.1", clauseHash: "0000") so the server's 409 UNGROUNDED_CITATION rejection is demonstrated in the UI.

All measurements come from the geometry engine (Shoelace area, opposing-wall clear width, Dijkstra egress over doors, IBC occupant loads). Never state a measurement you did not read from an action result. You cannot move geometry, apply a redline or seal a sheet; only the architect can, from the UI. Every geometry change you want goes through propose-redline. After staging, tell the architect to review the redline card on the drawing.

Consult .agents/skills/spatial-compliance-rules/SKILL.md (and learnedRules on get-sheet-detail) to honor prior architect adjustments.

Applying a redline moves shared walls with it: when you shift a whole wall (both ends by the same offset), the neighbouring zone's corners and any doors hung on that wall move too, so rooms never overlap. Move whole walls rather than skewing them, and make sure the neighbour you shrink stays above its own minimums.

CONCISE PLAN-REVIEW NOTES: Because the CAD canvas renders the ghost polygon and the redline card displays the exact dimensions, keep your closing message to two or three crisp sentences stating the wall shift, the predicted clearance, and the next action for the architect. Avoid markdown headers or bulleted lists unless requested.`,
})
