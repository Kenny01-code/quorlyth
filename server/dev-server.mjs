// Local AI server for development. Run:  npm run dev:ai   (needs Node 20.6 or newer)
import http from 'node:http'
import fs from 'node:fs'
import { chat, json, realtimeSession, speak } from './openai.mjs'

// load .env without any extra package
if (fs.existsSync('.env')) {
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const routes = { '/api/chat': chat, '/api/json': json, '/api/realtime-session': realtimeSession, '/api/speak': speak }
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end() }
  const h = routes[(req.url || '').split('?')[0]]
  if (req.method === 'POST' && h) return h(req, res)
  res.statusCode = 404
  res.end('Not found')
}).listen(8787, () => console.log('Quorlyth AI server on http://localhost:8787' + (process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY ? '' : '  (add GEMINI_API_KEY or OPENAI_API_KEY)')))
