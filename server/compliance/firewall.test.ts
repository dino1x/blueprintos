import { describe, expect, it } from 'vitest'

import { STATUTORY_CORPUS } from '../seed/statutory-corpus'
import { checkCitation, clauseHashOf } from './firewall'

const seed = STATUTORY_CORPUS.find((c) => c.sectionRef === 'ADA-403.5.1')!
const clause = { ...seed, id: 'clause-1', clauseHash: clauseHashOf(seed) }
const geometry = 'a'.repeat(64)
const receipt = { zoneId: 'hall', clauseId: 'clause-1', clauseHash: clause.clauseHash, geometryHash: geometry }
const citation = { zoneId: 'hall', clauseId: 'clause-1', clauseHash: clause.clauseHash }

describe('clause hashes', () => {
  it('are SHA-256 digests that change when any word or threshold changes', () => {
    expect(clause.clauseHash).toMatch(/^[0-9a-f]{64}$/)
    expect(clauseHashOf({ ...seed, thresholdValue: 35 })).not.toBe(clause.clauseHash)
    expect(clauseHashOf({ ...seed, verbatimText: seed.verbatimText.replace('36', '32') })).not.toBe(clause.clauseHash)
    expect(clauseHashOf({ ...seed })).toBe(clause.clauseHash)
  })
})

describe('Cite-Before-Act firewall', () => {
  it('accepts a citation grounded in a current receipt and an intact clause', () => {
    expect(checkCitation(citation, receipt, clause, geometry)).toBeNull()
  })

  it('rejects a fabricated hash', () => {
    expect(checkCitation({ ...citation, clauseHash: 'not-a-hash' }, receipt, clause, geometry)).toMatch(/SHA-256/)
    expect(checkCitation({ ...citation, clauseHash: 'b'.repeat(64) }, receipt, clause, geometry)).toMatch(/does not match/)
  })

  it('rejects a receipt that check-clearances never produced', () => {
    expect(checkCitation(citation, null, clause, geometry)).toMatch(/not produced/)
  })

  it('rejects citing another zone or clause than the receipt covers', () => {
    expect(checkCitation({ ...citation, zoneId: 'study' }, receipt, clause, geometry)).toMatch(/different zone/)
    expect(checkCitation({ ...citation, clauseId: 'clause-2' }, receipt, clause, geometry)).toMatch(/clause_id/)
  })

  it('rejects a stale receipt once the geometry has moved', () => {
    expect(checkCitation(citation, receipt, clause, 'c'.repeat(64))).toMatch(/geometry changed/)
  })

  it('rejects a clause whose text was edited after it was hashed', () => {
    const tampered = { ...clause, verbatimText: 'Corridors may be any width.' }
    expect(checkCitation(citation, receipt, tampered, geometry)).toMatch(/no longer hash/)
  })
})
