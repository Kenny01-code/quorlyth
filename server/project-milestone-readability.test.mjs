import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('project milestone cards and linked workspace tasks use true-black readable writeups', async () => {
  const [board, workspace, milestoneStyles, workspaceStyles] = await Promise.all([
    source('src/components/MilestoneBoard.tsx'),
    source('src/screens/StandaloneWorkspaces.tsx'),
    source('src/styles/precision-contrast-polish.css'),
    source('src/styles/standalone-workspaces.css'),
  ])

  for (const copy of [
    'Definition of done',
    'Work and evidence live in the workspace',
    'Edit details',
    'Mark blocked',
    'Delete milestone',
    'Assign to teammates',
  ]) {
    assert.ok(board.includes(copy), 'Missing project milestone copy: ' + copy)
  }

  for (const copy of [
    'IN PROGRESS',
    'Linked milestone:',
    'Definition of done',
    'No deadline',
    'evidence item',
    'Assign to teammates',
  ]) {
    assert.ok(workspace.includes(copy), 'Missing linked workspace task copy: ' + copy)
  }

  assert.match(milestoneStyles, /\.ql-milestone-card__body[\s\S]*?background: linear-gradient\(145deg, #F8F3EA 0%, #EFE5D6 100%\)/)
  assert.match(milestoneStyles, /\.ql-milestone-description[\s\S]*?color: #080807 !important/)
  assert.match(milestoneStyles, /\.ql-acceptance p[\s\S]*?color: #080807 !important/)
  assert.match(milestoneStyles, /\.ql-workspace-evidence-notice__copy p[\s\S]*?color: #080807 !important/)
  assert.match(milestoneStyles, /\.ql-milestone-actions \.ql-quiet-action[\s\S]*?color: #080807 !important/)
  assert.match(workspaceStyles, /#root \.sw-task__description[\s\S]*?color: #080807 !important/)
  assert.match(workspaceStyles, /#root \.sw-criteria p[\s\S]*?color: #080807 !important/)
  assert.match(workspaceStyles, /#root \.sw-task__meta > span[\s\S]*?color: #080807 !important/)
})

test('assignee lists remain scrollable while their scrollbar chrome stays hidden', async () => {
  const [milestoneStyles, workspaceStyles, hiddenScrollbars, workspaceShell] = await Promise.all([
    source('src/styles/precision-contrast-polish.css'),
    source('src/styles/standalone-workspaces.css'),
    source('src/styles/hidden-scrollbars.css'),
    source('src/styles/workspace-shell.css'),
  ])

  assert.match(milestoneStyles, /\.ql-assignee-picker__list[\s\S]*?overflow-y: auto !important/)
  assert.match(workspaceStyles, /\.sw-assignee-picker__list[\s\S]*?overflow-y: auto !important/)
  assert.match(workspaceShell, /\.ql-assignee-picker__list\{[^}]*max-height:220px;overflow:auto/)
  assert.match(workspaceStyles, /\.sw-assignee-picker__list\{[^}]*max-height:220px;overflow:auto/)
  assert.match(hiddenScrollbars, /#root \*\s*\{[\s\S]*?scrollbar-width: none/)
  assert.match(hiddenScrollbars, /#root \*::-webkit-scrollbar\s*\{[\s\S]*?display: none/)
})
