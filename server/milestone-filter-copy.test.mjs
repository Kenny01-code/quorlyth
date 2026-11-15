import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('milestone filters explain exactly which milestones they show', async () => {
  const board = await source('src/components/MilestoneBoard.tsx')

  for (const description of [
    'See every milestone in this project, including completed ones.',
    'See milestones that are still in progress or waiting to start.',
    'See milestones where you are listed as an assignee.',
    'See unfinished milestones whose due dates have passed.',
    'See unfinished milestones currently marked as blocked.',
  ]) {
    assert.ok(board.includes(description), 'Missing filter explanation: ' + description)
  }

  assert.match(board, /aria-live="polite"[\s\S]*?FILTERS\.find\(item => item\.value === filter\)\?\.description/)
  assert.match(board, /aria-label=\{item\.label \+ '\\. ' \+ item\.description\}/)
  assert.match(board, /title=\{item\.description\}/)

  // Keep the underlying filter semantics aligned with the explanations.
  assert.match(board, /if \(filter === 'open'\) return item\.status !== 'done'/)
  assert.match(board, /if \(filter === 'mine'\) return !!a\.me\?\.id && getMilestoneAssigneeIds\(item\)\.includes\(a\.me\.id\)/)
  assert.match(board, /if \(filter === 'overdue'\) return isOverdue\(item\)/)
  assert.match(board, /if \(filter === 'blocked'\) return !!item\.blocked && item\.status !== 'done'/)
})
