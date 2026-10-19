import http from 'node:http'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chat, json, realtimeSession, speak, speakElevenLabs, speakStream } from './openai.mjs'

const ROUTES = {
  '/api/chat': chat,
  '/api/json': json,
  '/api/realtime-session': realtimeSession,
  '/api/speak': speak,
  '/api/speak-eleven': speakElevenLabs,
  '/api/speak-stream': speakStream,
}

function parseOrigins(value) {
  return String(value || '').split(',').map(value => value.trim()).filter(Boolean).map(value => {
    let parsed
    try { parsed = new URL(value) } catch { throw new Error('AI_ALLOWED_ORIGINS must be a comma-separated list of full origins, for example https://quorlyth.vercel.app') }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== value.replace(/\/$/, '')) {
      throw new Error('Invalid origin in AI_ALLOWED_ORIGINS: ' + value)
    }
    return parsed.origin
  })
}

function configuredOrigins() {
  if (process.env.AI_ALLOWED_ORIGINS?.trim()) return parseOrigins(process.env.AI_ALLOWED_ORIGINS)
  const origins = ['https://quorlyth.vercel.app']
  if (process.env.NODE_ENV !== 'production') origins.push('http://localhost:5173', 'http://127.0.0.1:5173')
  return origins
}

function jsonResponse(res, statusCode, payload) {
  if (res.writableEnded) return
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.end(JSON.stringify(payload))
}

function clientAddress(req) {
  // Railway's ingress sets these proxy headers. Prefer the single-address header,
  // then fall back to the leftmost forwarded address and the socket peer.
  const realIp = req.headers['x-real-ip']
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim()
  const forwardedFor = req.headers['x-forwarded-for']
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) return forwardedFor.split(',')[0].trim()
  return req.socket.remoteAddress || 'unknown'
}

/**
 * Creates the dedicated Quorlyth AI HTTP service.
 * CORS is an origin boundary for browsers, not a substitute for user authorization.
 * Sensitive app-context routes continue to validate Supabase sessions in openai.mjs.
 */
export function createAiServer(options = {}) {
  const allowedOrigins = new Set((options.allowedOrigins || configuredOrigins()).map(origin => new URL(origin).origin))
  const handlers = { ...ROUTES, ...(options.handlers || {}) }
  const windows = new Map()
  const configuredLimit = Number(options.rateLimitPerMinute ?? process.env.AI_RATE_LIMIT_PER_MINUTE ?? 120)
  const limit = Number.isFinite(configuredLimit) && configuredLimit >= 1 ? Math.floor(configuredLimit) : 120
  const windowMs = 60_000

  return http.createServer(async (req, res) => {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname

    // Railway deployment healthcheck; no AI provider call or secret is needed.
    if (req.method === 'GET' && pathname === '/healthz') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      return res.end(JSON.stringify({ status: 'ok', service: 'quorlyth-ai' }))
    }

    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : ''
    if (origin) {
      let normalizedOrigin = ''
      try { normalizedOrigin = new URL(origin).origin } catch {}
      if (!normalizedOrigin || !allowedOrigins.has(normalizedOrigin)) {
        return jsonResponse(res, 403, { error: 'This origin is not allowed to use the Quorlyth AI service.' })
      }
      res.setHeader('Access-Control-Allow-Origin', normalizedOrigin)
      res.setHeader('Vary', 'Origin')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      res.setHeader('Access-Control-Max-Age', '600')
    } else if (req.method === 'POST' || req.method === 'OPTIONS') {
      return jsonResponse(res, 403, { error: 'An allowed browser origin is required.' })
    }

    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')

    if (req.method === 'OPTIONS') {
      if (!Object.prototype.hasOwnProperty.call(handlers, pathname)) {
        res.statusCode = 404
        return res.end()
      }
      res.statusCode = 204
      return res.end()
    }

    const handler = handlers[pathname]
    if (req.method !== 'POST' || !handler) {
      return jsonResponse(res, 404, { error: 'Not found' })
    }

    const now = Date.now()
    const address = clientAddress(req)
    let window = windows.get(address)
    if (!window || now - window.startedAt >= windowMs) {
      window = { startedAt: now, count: 0 }
      windows.set(address, window)
    }
    if (window.count >= limit) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((windowMs - (now - window.startedAt)) / 1000))))
      return jsonResponse(res, 429, { error: 'Too many AI requests from this connection. Please wait a moment and retry.', retryable: true })
    }
    window.count += 1

    // Prevent stale IP windows from accumulating without bound on long-lived instances.
    if (windows.size > 10_000) {
      for (const [key, value] of windows) {
        if (now - value.startedAt >= windowMs) windows.delete(key)
      }
    }

    try {
      await handler(req, res)
    } catch (error) {
      console.error('[Quorlyth AI] Unhandled route error:', error instanceof Error ? error.message : 'unknown error')
      if (!res.headersSent) jsonResponse(res, 500, { error: 'QuorlythBot hit a temporary snag. Please try again.', retryable: true })
      else if (!res.writableEnded) res.end()
    }
  })
}

function start() {
  const port = Number(process.env.PORT || 8787)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.')
  }
  const host = process.env.HOST || '0.0.0.0'
  const server = createAiServer()
  server.listen(port, host, () => {
    console.log(`Quorlyth AI service listening on ${host}:${port}`)
    console.log('Health endpoint: /healthz')
    if (!process.env.AI_ALLOWED_ORIGINS?.trim()) {
      console.warn('AI_ALLOWED_ORIGINS is unset; using the production Quorlyth origin plus local development origins when not in production.')
    }
    if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY && !process.env.XAI_API_KEY) {
      console.warn('No text AI provider key is configured. Add provider keys in the cloud service variables.')
    }
  })
  const shutdown = signal => {
    console.log(`Received ${signal}; shutting down Quorlyth AI service.`)
    server.close(error => {
      if (error) {
        console.error('[Quorlyth AI] Shutdown error:', error.message)
        process.exitCode = 1
      }
    })
  }
  process.once('SIGTERM', () => shutdown('SIGTERM'))
  process.once('SIGINT', () => shutdown('SIGINT'))
  return server
}

const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (isEntryPoint) start()
