import { createHash } from 'node:crypto'

// The Cite-Before-Act firewall as pure functions, so the rule that decides
// whether a redline is grounded can be tested without a database.

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export type HashableClause = {
  codeStandard: string
  sectionRef: string
  verbatimText: string
  thresholdMetric: string
  thresholdOperator: string
  thresholdValue: number
  sprinkleredThresholdValue: number | null
  perOccupantIn: number | null
  latchSideIn: number | null
  unit: string
}

// The hash covers every field that decides compliance, so editing a single
// threshold or a word of the provision changes it.
export function clauseHashOf(c: HashableClause): string {
  return sha256(
    JSON.stringify([
      c.codeStandard,
      c.sectionRef,
      c.verbatimText,
      c.thresholdMetric,
      c.thresholdOperator,
      c.thresholdValue,
      c.sprinkleredThresholdValue,
      c.perOccupantIn,
      c.latchSideIn,
      c.unit,
    ]),
  )
}

export type Citation = { zoneId: string; clauseId: string; clauseHash: string }
export type CitedReceipt = { zoneId: string; clauseId: string; clauseHash: string; geometryHash: string }
export type CitedClause = HashableClause & { id: string; clauseHash: string }

// Returns why a citation is ungrounded, or null when it is grounded.
export function checkCitation(
  citation: Citation,
  receipt: CitedReceipt | null,
  clause: CitedClause | null,
  currentGeometryHash: string,
): string | null {
  if (!/^[0-9a-f]{64}$/.test(citation.clauseHash)) return 'clause_hash is not a SHA-256 hex digest'
  if (!receipt) return 'violation_receipt_id was not produced by check-clearances on this sheet'
  if (receipt.zoneId !== citation.zoneId) return 'receipt belongs to a different zone'
  if (receipt.clauseId !== citation.clauseId) return 'clause_id does not match the receipt'
  if (receipt.clauseHash !== citation.clauseHash) return 'clause_hash does not match the receipt'
  if (receipt.geometryHash !== currentGeometryHash) return 'geometry changed after the audit; re-run check-clearances'
  if (!clause) return 'clause_id is not in the statutory corpus'
  if (clause.clauseHash !== citation.clauseHash || clauseHashOf(clause) !== clause.clauseHash) {
    return 'clause text or thresholds no longer hash to clause_hash'
  }
  return null
}
