import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const viteEntry = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')
const viteArgs = process.argv.slice(2)
const children = []
let stopping = false

function stopAll(code = 0) {
  if (stopping) return
  stopping = true
  process.exitCode = code
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      try { child.kill('SIGTERM') } catch {}
    }
  }
}

function launch(label, args) {
  const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit', env: process.env })
  children.push(child)
  child.on('error', error => {
    console.error('[Quorlyth dev] Could not start ' + label + ':', error.message)
    stopAll(1)
  })
  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.error('[Quorlyth dev] ' + label + ' stopped' + (signal ? ' (' + signal + ')' : ' with code ' + code) + '. Stopping the other dev process.')
      stopAll(typeof code === 'number' ? code : 1)
    }
  })
  return child
}

process.on('SIGINT', () => stopAll(0))
process.on('SIGTERM', () => stopAll(0))

console.log('[Quorlyth dev] Starting the AI API on port 8787 and Vite on port 5173.')
launch('AI API', ['server/dev-server.mjs'])
launch('Vite', [viteEntry, ...viteArgs])
