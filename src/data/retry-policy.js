const RETRY_DELAYS = Object.freeze([1500, 3000, 7000, 15000, 30000])

/** Return a capped exponential-style retry delay for a zero-based attempt. */
export function retryDelayForAttempt(attempt) {
  const index = Number.isFinite(attempt) ? Math.max(0, Math.floor(attempt)) : 0
  return RETRY_DELAYS[Math.min(index, RETRY_DELAYS.length - 1)]
}

/** Keep the counter bounded while preserving the final capped delay. */
export function nextRetryAttempt(attempt) {
  const index = Number.isFinite(attempt) ? Math.max(0, Math.floor(attempt)) : 0
  return Math.min(index + 1, RETRY_DELAYS.length - 1)
}
