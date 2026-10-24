const NO_STORE = 'no-store, no-cache, must-revalidate, proxy-revalidate'

function setHeaders(res) {
  res.setHeader('Cache-Control', NO_STORE)
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
}

async function withTimeout(url, options = {}, timeoutMs = 3500) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal, redirect: 'error' })
  } finally {
    clearTimeout(timer)
  }
}

async function checkDatabase() {
  const base = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '')
  const key = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim()
  if (!base || !key) return { state: 'not_configured', label: 'Supabase connection is not configured in the runtime environment' }

  try {
    const target = new URL('/rest/v1/docs?select=path&limit=1', base)
    if (target.protocol !== 'https:') return { state: 'needs_attention', label: 'Database endpoint must use HTTPS' }
    const response = await withTimeout(target, { headers: { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json' } })
    if (response.ok) return { state: 'connected', label: 'Supabase REST endpoint responded successfully' }
    if (response.status === 401 || response.status === 403) return { state: 'needs_attention', label: 'Supabase responded, but the configured public key or access policy needs attention' }
    return { state: 'degraded', label: 'Supabase responded with HTTP ' + response.status }
  } catch {
    return { state: 'unreachable', label: 'Supabase health check could not complete' }
  }
}

async function checkAi() {
  const base = (process.env.VITE_AI_API_BASE_URL || process.env.AI_API_BASE_URL || '').trim()
  if (base) {
    try {
      const target = new URL('/healthz', base)
      if (target.protocol !== 'https:') return { state: 'needs_attention', label: 'Dedicated AI endpoint must use HTTPS' }
      const response = await withTimeout(target, {}, 3500)
      if (response.ok) return { state: 'online', label: 'Dedicated Quorlyth AI health check passed' }
      return { state: 'unreachable', label: 'Dedicated AI endpoint returned HTTP ' + response.status }
    } catch {
      return { state: 'unreachable', label: 'Dedicated AI endpoint did not respond to its health check' }
    }
  }

  const configured = ['GEMINI_API_KEY', 'XAI_API_KEY', 'OPENAI_API_KEY'].some(name => Boolean((process.env[name] || '').trim()))
  return configured
    ? { state: 'configured', label: 'At least one server-side text AI provider key is configured; provider response quality is not continuously probed' }
    : { state: 'not_configured', label: 'No server-side text AI provider key was detected in this runtime environment' }
}

export default async function architectureStatus(req, res) {
  setHeaders(res)
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const [database, ai] = await Promise.all([checkDatabase(), checkAi()])
  const voiceConfigured = Boolean((process.env.ELEVENLABS_API_KEY || '').trim())
  return res.status(200).json({
    checkedAt: new Date().toISOString(),
    app: { state: 'online', label: 'The production status endpoint responded successfully' },
    database,
    ai,
    voice: voiceConfigured
      ? { state: 'configured', label: 'ElevenLabs server-side credentials are configured; live speech playback is not probed' }
      : { state: 'browser_fallback', label: 'ElevenLabs key not detected here; browser speech may be available as a fallback' },
    release: {
      ref: process.env.VERCEL_GIT_COMMIT_REF || 'production',
      sha: process.env.VERCEL_GIT_COMMIT_SHA || '',
    },
  })
}
