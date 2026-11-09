import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const viteEntry = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')
const args = process.argv.slice(2)
const frontendOnly = args.includes('--frontend-only')
const viteArgs = args.filter(arg => arg !== '--frontend-only')

// Load the same layered env files Vite uses before starting either child process.
// This prevents the API and browser app from silently using different settings.
const loadedEnv = loadEnv('development', root, '')
for (const [key, value] of Object.entries(loadedEnv)) {
  if (!process.env[key]) process.env[key] = value
}

const expectedSupabaseHost = 'tujvptxjmkihwrqbqmyk.supabase.co'
const supabaseUrl = (process.env.VITE_SUPABASE_URL || '').trim()
const supabaseAnonKey = (process.env.VITE_SUPABASE_ANON_KEY || '').trim()

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[Quorlyth dev] Local preview was not started.')
  console.error('[Quorlyth dev] Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env to use the same account and shared data as production.')
  console.error('[Quorlyth dev] Copy only the public anon/publishable key from the Quorlyth Vercel production environment. Never use a service-role key.')
  process.exit(1)
}

let supabaseHost = ''
try {
  const parsed = new URL(supabaseUrl)
  if (parsed.protocol !== 'https:') throw new Error('HTTPS is required.')
  supabaseHost = parsed.hostname.toLowerCase()
} catch {
  console.error('[Quorlyth dev] VITE_SUPABASE_URL is not a valid HTTPS URL.')
  process.exit(1)
}

if (supabaseHost !== expectedSupabaseHost) {
  console.error('[Quorlyth dev] Local preview is pointed at a different Supabase project.')
  console.error('[Quorlyth dev] Expected the Quorlyth production project ref: tujvptxjmkihwrqbqmyk.')
  console.error('[Quorlyth dev] Update VITE_SUPABASE_URL in .env before starting.')
  process.exit(1)
}

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

function launch(label, executable, childArgs) {
  const child = spawn(executable, childArgs, { cwd: root, stdio: 'inherit', env: process.env })
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

console.log('[Quorlyth dev] Verified shared Quorlyth Supabase project.')
console.log('[Quorlyth dev] Local changes use production accounts and data. Avoid test writes or destructive actions.')
console.log('[Quorlyth dev] Vite is fixed to http://localhost:5173; startup will fail rather than silently switching to another port.')

if (!frontendOnly) {
  console.log('[Quorlyth dev] Starting the AI API on port 8787.')
  launch('AI API', process.execPath, ['server/dev-server.mjs'])
}
launch('Vite', process.execPath, [viteEntry, ...viteArgs])
