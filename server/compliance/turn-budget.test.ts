import { afterEach, describe, expect, it } from 'vitest'

import { checkTurnBudget, clearTurnBudget } from './turn-budget'

afterEach(() => {
  clearTurnBudget()
})

describe('plan-review hourly turn budget', () => {
  it('permits unlimited prompts when no budget is set', () => {
    for (let idx = 0; idx < 80; idx++) {
      expect(() => checkTurnBudget({}, Date.now(), null)).not.toThrow()
    }
  })

  it('blocks prompts once the hourly ceiling is reached and recovers after 60 minutes', () => {
    const start = 5_000_000
    checkTurnBudget({}, start, 2)
    checkTurnBudget({}, start + 500, 2)
    expect(() => checkTurnBudget({}, start + 1_500, 2)).toThrow(/allows 2 agent turns per hour/)
    expect(() => checkTurnBudget({}, start + 3_600_001, 2)).not.toThrow()
  })

  it('exempts multi-step tool continuations and background workers', () => {
    checkTurnBudget({}, Date.now(), 1)
    expect(() => checkTurnBudget({ internalContinuation: true }, Date.now(), 1)).not.toThrow()
    expect(() => checkTurnBudget({ isBackgroundWorker: true }, Date.now(), 1)).not.toThrow()
  })
})
