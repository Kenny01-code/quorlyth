function send(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

async function bodyOf(req) {
  if (req.body && typeof req.body === 'object') return req.body
  let raw = ''
  for await (const chunk of req) raw += chunk
  try { return JSON.parse(raw || '{}') } catch { return {} }
}

/**
 * Authenticated endpoint. The browser's signed-in JWT is verified by Supabase.
 * The SQL SECURITY DEFINER RPC independently checks community ownership or
 * platform-admin status. No service-role key is used or exposed.
 */
export async function adminCommunity(req, res) {
  if (req.method !== 'DELETE' && req.method !== 'POST') return send(res, 405, { error: 'Use DELETE to remove a community.' })

  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
  if (!url || !anonKey) return send(res, 503, { error: 'Supabase URL or anon key is not configured on the server.' })

  const token = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return send(res, 401, { error: 'Sign in again before deleting a community.' })

  try {
    const authResponse = await fetch(url + '/auth/v1/user', {
      headers: { apikey: anonKey, Authorization: 'Bearer ' + token },
    })
    const user = await authResponse.json()
    if (!authResponse.ok || !user?.id) return send(res, 401, { error: 'Your session expired. Sign in again.' })
    if (!user.email_confirmed_at) return send(res, 403, { error: 'Confirm your email before performing this action.' })

    const { cid } = await bodyOf(req)
    if (typeof cid !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(cid)) {
      return send(res, 400, { error: 'A valid community ID is required.' })
    }

    const response = await fetch(url + '/rest/v1/rpc/admin_delete_community', {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_cid: cid }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message = result?.message || result?.details || result?.hint || 'The database rejected the deletion request.'
      const status = response.status === 401 ? 401 : response.status === 403 ? 403 : response.status >= 500 ? 502 : 400
      return send(res, status, { error: String(message).slice(0, 500) })
    }
    if (!result?.ok) return send(res, 500, { error: 'The database did not confirm the deletion.' })
    return send(res, 200, result)
  } catch (error) {
    console.error('Quorlyth admin community deletion failed:', error)
    return send(res, 500, { error: String(error?.message || error).slice(0, 500) })
  }
}
