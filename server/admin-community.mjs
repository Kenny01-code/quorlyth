const OWNER_EMAIL = 'ighiledivine77@gmail.com'

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

async function rest(url, key, path, options = {}) {
  const response = await fetch(url + '/rest/v1/docs' + path, {
    ...options,
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...(options.body ? { Prefer: 'return=minimal' } : {}),
    },
  })
  if (!response.ok) throw new Error('Supabase data operation failed (' + response.status + '): ' + (await response.text()).slice(0, 400))
  if (response.status === 204) return null
  const text = await response.text()
  return text ? JSON.parse(text) : null
}

/**
 * Privileged community deletion. The service-role key is server-only and is
 * never returned to the browser or model. A verified owner JWT is required.
 */
export async function adminCommunity(req, res) {
  if (req.method !== 'DELETE' && req.method !== 'POST') return send(res, 405, { error: 'Use DELETE to remove a community.' })

  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !anonKey) return send(res, 503, { error: 'Server-side Supabase URL and anon key are not configured.' })
  if (!serviceKey) return send(res, 503, { error: 'Secure admin deletion is not configured yet. Add SUPABASE_SERVICE_ROLE_KEY to the Vercel Production environment; keep it server-only.' })

  const authorization = String(req.headers.authorization || '')
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return send(res, 401, { error: 'Sign in again before deleting a community.' })

  try {
    const authResponse = await fetch(url + '/auth/v1/user', {
      headers: { apikey: anonKey, Authorization: 'Bearer ' + token },
    })
    const user = await authResponse.json()
    if (!authResponse.ok || !user?.id) return send(res, 401, { error: 'Your session expired. Sign in again.' })
    if (String(user.email || '').toLowerCase() !== OWNER_EMAIL || !user.email_confirmed_at) {
      return send(res, 403, { error: 'Only the verified Quorlyth owner account can perform this action.' })
    }

    const { cid } = await bodyOf(req)
    if (typeof cid !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(cid)) return send(res, 400, { error: 'A valid community ID is required.' })

    const q = value => encodeURIComponent(value)
    const rows = await rest(url, serviceKey, '?select=path,data&path=like.ideas%2F%25')
    const ideas = (rows || []).filter(row => row.path === 'ideas/' + cid || row.path.startsWith('ideas/' + cid + '/'))
    const ideaIds = new Set(ideas.filter(row => /^ideas\/[^/]+$/.test(row.path)).filter(row => row.data?.cid === cid).map(row => row.path.slice('ideas/'.length)))
    const deletePaths = new Set(['communities/' + cid])

    // Include every nested path under each idea, so comments and other child
    // documents are removed together with the idea.
    for (const row of ideas) {
      const id = row.path.split('/')[1]
      if (ideaIds.has(id)) deletePaths.add(row.path)
    }

    const related = await rest(url, serviceKey, '?select=path,data&path=like.reviews%2F%25')
    for (const row of related || []) if (ideaIds.has(row.path.slice('reviews/'.length)) || [...ideaIds].some(id => row.path.startsWith('reviews/' + id + '/'))) deletePaths.add(row.path)

    const otherRows = await rest(url, serviceKey, '?select=path,data&or=(path.like.projects%2F%25,path.like.volunteers%2F%25,path.like.promotions%2F%25,path.like.milestones%2F%25)')
    const projectIds = new Set()
    for (const row of otherRows || []) {
      const d = row.data || {}
      if (ideaIds.has(d.ideaId)) {
        deletePaths.add(row.path)
        if (row.path.startsWith('projects/')) projectIds.add(row.path.slice('projects/'.length))
      }
    }
    for (const row of otherRows || []) {
      if (row.path.startsWith('milestones/') && projectIds.has(row.data?.projectId)) deletePaths.add(row.path)
    }

    // Remove this community from each member's membership map without
    // deleting the member's other community memberships.
    const memberRows = await rest(url, serviceKey, '?select=path,data&path=like.members%2F%25')
    for (const row of memberRows || []) {
      const memberships = row.data?.c
      if (memberships && Object.prototype.hasOwnProperty.call(memberships, cid)) {
        const next = { ...row.data, c: { ...memberships } }
        delete next.c[cid]
        await rest(url, serviceKey, '?path=eq.' + q(row.path), { method: 'PATCH', body: JSON.stringify({ data: next }) })
      }
    }

    for (const path of deletePaths) {
      await rest(url, serviceKey, '?path=eq.' + q(path), { method: 'DELETE' })
    }
    return send(res, 200, { ok: true, deletedCommunity: cid, deletedIdeas: ideaIds.size, deletedRecords: deletePaths.size })
  } catch (error) {
    console.error('Quorlyth admin community deletion failed:', error)
    return send(res, 500, { error: String(error?.message || error).slice(0, 500) })
  }
}
