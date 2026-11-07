import { createError } from 'h3'

// Sliding-window hourly budget for hosted plan-review previews. When
// DEMO_AGENT_TURNS_PER_HOUR is set to a positive integer, new user prompts
// beyond that count are rejected before invoking the language model.
const HOUR_WINDOW_MS = 3_600_000
const recordedTurnTimestamps: number[] = []

export function hourlyTurnBudget(): number | null {
  const parsed = Number(process.env.DEMO_AGENT_TURNS_PER_HOUR) // guard:allow-env-credential — numeric rate ceiling
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null
}

export function checkTurnBudget(
  opts: { internalContinuation?: boolean; isBackgroundWorker?: boolean },
  currentTimeMs = Date.now(),
  maxTurns = hourlyTurnBudget(),
): void {
  if (!maxTurns || opts.internalContinuation || opts.isBackgroundWorker) return
  while (recordedTurnTimestamps.length && currentTimeMs - recordedTurnTimestamps[0]! > HOUR_WINDOW_MS) {
    recordedTurnTimestamps.shift()
  }
  if (recordedTurnTimestamps.length >= maxTurns) {
    const minutesRemaining = Math.max(1, Math.ceil((HOUR_WINDOW_MS - (currentTimeMs - recordedTurnTimestamps[0]!)) / 60_000))
    throw createError({
      statusCode: 409,
      statusMessage: 'Hourly preview quota reached',
      message: `Hosted preview allows ${maxTurns} agent turn${maxTurns === 1 ? '' : 's'} per hour. Please wait ~${minutesRemaining}m; manual CAD tools and clearance audits remain available.`,
    })
  }
  recordedTurnTimestamps.push(currentTimeMs)
}

export function clearTurnBudget(): void {
  recordedTurnTimestamps.length = 0
}
