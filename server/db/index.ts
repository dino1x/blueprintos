import { createGetDb } from '@agent-native/core/db'
import { registerShareableResource } from '@agent-native/core/sharing'

import * as schema from './schema.js'

export const getDb = createGetDb(schema)
export { schema }

registerShareableResource({
  type: 'sheet',
  resourceTable: schema.sheets,
  sharesTable: schema.sheetShares,
  displayName: 'Sheet',
  titleColumn: 'title',
  getResourcePath: (sheet) => `/sheets/${sheet.id}`,
  getDb,
})
