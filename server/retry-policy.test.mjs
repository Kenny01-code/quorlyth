import test from 'node:test'
import assert from 'node:assert/strict'
import { nextRetryAttempt, retryDelayForAttempt } from '../src/data/retry-policy.js'

test('realtime retry delay increases through the configured backoff and remains capped', () => {
  assert.deepEqual(
    Array.from({ length: 8 }, (_, attempt) => retryDelayForAttempt(attempt)),
    [1500, 3000, 7000, 15000, 30000, 30000, 30000, 30000],
  )
})

test('realtime retry attempt counter stays capped after prolonged outages', () => {
  assert.deepEqual(
    Array.from({ length: 8 }, (_, attempt) => nextRetryAttempt(attempt)),
    [1, 2, 3, 4, 4, 4, 4, 4],
  )
  assert.equal(retryDelayForAttempt(-1), 1500)
  assert.equal(retryDelayForAttempt(Number.NaN), 1500)
})
