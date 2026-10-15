const API_ROOT = 'https://www.googleapis.com/youtube/v3'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const DATA_RETENTION_MS = 29 * 24 * 60 * 60 * 1000
// The standard project quota is 100 search.list calls/day. Google enforces the
// project-wide bucket; this per-warm-instance guard leaves headroom for other
// instances/services, while caching and the quota circuit breaker reduce calls.
const MAX_SEARCHES_PER_DAY = 80
const MAX_IDEAS_PER_REQUEST = 10
const SEARCH_MAX_RESULTS = 6
const VIDEO_MAX_RESULTS = 6
const RECENT_DAYS = 365

const STOP_WORDS = new Set((
  'a an and are as at be been being by can could did do does for from had has have how i if in into is it its may me more most my of on or our should that the their them then there these they this those to too we what when where which who why will with would you your about idea ideas community create creator content fan fans make making help build building new improve better '
  + 'project platform social online product people audience using use users member members vote voting votes backing feedback discuss discussion collaboration collaborate app application startup future problem solution'
).split(/\s+/).filter(Boolean))

const cache = new Map()
const inFlight = new Map()
let budgetDay = ''
let searchesToday = 0
let quotaBlockedDay = ''

function dayKey(now) {
  // YouTube quota buckets reset on Pacific time, not UTC.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now))
}

function fallback(ideaId, status, message, query = '', now = Date.now()) {
  return {
    ideaId,
    status,
    message,
    query,
    fetchedAt: now,
    expiresAt: now + DATA_RETENTION_MS,
    videos: [],
  }
}

function tokenize(text) {
  return (String(text || '').toLowerCase().match(/[a-z0-9]+(?:['-][a-z0-9]+)?/g) || [])
    .filter(word => word.length > 2 && !STOP_WORDS.has(word) && !/^\d+$/.test(word))
}

export function extractYouTubeQuery(idea = {}) {
  const titleTokens = tokenize(idea.title)
  const titleSet = new Set(titleTokens)
  const tagTokens = tokenize(Array.isArray(idea.tags) ? idea.tags.join(' ') : idea.tags)
  const bodyTokens = tokenize(idea.body || idea.description || '')
  const counts = new Map()
  for (const word of bodyTokens) counts.set(word, (counts.get(word) || 0) + 1)
  const rankedBody = [...counts.entries()]
    .filter(([word]) => !titleSet.has(word))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([word]) => word)
  const words = [...new Set([...titleTokens.slice(0, 4), ...tagTokens, ...rankedBody])]
  return words.slice(0, 7).join(' ').slice(0, 100).trim()
}

function apiErrorMessage(code) {
  if (code === 'quotaExceeded' || code === 'dailyLimitExceeded' || code === 'rateLimitExceeded') {
    return 'YouTube daily search quota or rate limit was reached. AI scoring still completed without YouTube evidence.'
  }
  if (code === 'keyInvalid' || code === 'accessNotConfigured') {
    return 'YouTube rejected the server API key or the Data API is not enabled. Check YOUTUBE_API_KEY and the Google Cloud YouTube Data API v3 setting.'
  }
  return 'YouTube social signals are temporarily unavailable. AI scoring can continue using the idea text and existing Quorlyth data.'
}

async function getJson(url, fetchImpl) {
  const response = await fetchImpl(url, { method: 'GET', signal: AbortSignal.timeout(7000) })
  let payload = {}
  try { payload = await response.json() } catch {}
  if (!response.ok) {
    const error = new Error(apiErrorMessage(payload?.error?.errors?.[0]?.reason || payload?.error?.status))
    error.status = response.status
    error.code = payload?.error?.errors?.[0]?.reason || payload?.error?.status || ''
    throw error
  }
  return payload
}

function parseOptionalCount(value) {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

async function fetchTopic(query, { apiKey, fetchImpl, now }) {
  const day = dayKey(now)
  if (quotaBlockedDay === day) {
    return fallback('', 'quota_exceeded', 'YouTube daily quota was previously exceeded on this server instance. Try again after the daily quota resets.', query, now)
  }
  if (budgetDay !== day) {
    budgetDay = day
    searchesToday = 0
    quotaBlockedDay = ''
  }
  if (searchesToday >= MAX_SEARCHES_PER_DAY) {
    return fallback('', 'budget_limited', 'The conservative YouTube search budget for this server instance was reached. The review continued without external signals.', query, now)
  }

  searchesToday += 1
  const searchUrl = new URL(API_ROOT + '/search')
  searchUrl.search = new URLSearchParams({
    key: apiKey,
    part: 'snippet',
    type: 'video',
    order: 'date',
    maxResults: String(SEARCH_MAX_RESULTS),
    publishedAfter: new Date(now - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    q: query,
    safeSearch: 'moderate',
  }).toString()

  let searchPayload
  try {
    searchPayload = await getJson(searchUrl, fetchImpl)
  } catch (error) {
    if (error.code === 'quotaExceeded' || error.code === 'dailyLimitExceeded' || error.code === 'rateLimitExceeded') {
      quotaBlockedDay = day
      return fallback('', 'quota_exceeded', apiErrorMessage(error.code), query, now)
    }
    return fallback('', 'unavailable', apiErrorMessage(''), query, now)
  }

  const searchItems = Array.isArray(searchPayload.items) ? searchPayload.items : []
  const ids = searchItems.map(item => item?.id?.videoId).filter(id => typeof id === 'string' && id).slice(0, VIDEO_MAX_RESULTS)
  const snippetById = new Map(searchItems
    .filter(item => item?.id?.videoId)
    .map(item => [item.id.videoId, item.snippet || {}]))
  if (!ids.length) {
    return {
      ideaId: '',
      status: 'no_results',
      message: 'No recent public videos matched the extracted topic keywords. No demand is inferred from this empty result.',
      query,
      fetchedAt: now,
      expiresAt: now + DATA_RETENTION_MS,
      videos: [],
    }
  }

  let detailedItems = []
  let statisticsAvailable = false
  const videosUrl = new URL(API_ROOT + '/videos')
  videosUrl.search = new URLSearchParams({
    key: apiKey,
    part: 'snippet,statistics',
    id: ids.join(','),
    maxResults: String(ids.length),
  }).toString()

  try {
    const videosPayload = await getJson(videosUrl, fetchImpl)
    detailedItems = Array.isArray(videosPayload.items) ? videosPayload.items : []
    statisticsAvailable = true
  } catch {
    // Search snippets remain useful; missing statistics are null, never fake zeroes.
  }

  const detailById = new Map(detailedItems.map(item => [item.id, item]))
  const videos = ids.map(id => {
    const item = detailById.get(id)
    const snippet = item?.snippet || snippetById.get(id) || {}
    const statistics = item?.statistics || {}
    return {
      videoId: id,
      title: String(snippet.title || 'Untitled video').slice(0, 220),
      channelTitle: String(snippet.channelTitle || 'Unknown channel').slice(0, 120),
      publishedAt: typeof snippet.publishedAt === 'string' ? snippet.publishedAt : null,
      viewCount: parseOptionalCount(statistics.viewCount),
      likeCount: parseOptionalCount(statistics.likeCount),
      commentCount: parseOptionalCount(statistics.commentCount),
      url: 'https://www.youtube.com/watch?v=' + encodeURIComponent(id),
    }
  })
  const anyMetrics = videos.some(video => video.viewCount !== null || video.likeCount !== null || video.commentCount !== null)

  return {
    ideaId: '',
    status: statisticsAvailable && anyMetrics ? 'available' : 'partial',
    message: statisticsAvailable
      ? (anyMetrics ? 'Public per-video YouTube statistics were retrieved. Each count belongs to its source video; these are not Quorlyth votes or member activity.' : 'Recent public video details were retrieved, but engagement counts are not publicly available for these results.')
      : 'Recent public video titles and channels were found, but detailed engagement statistics could not be retrieved.',
    query,
    fetchedAt: now,
    expiresAt: now + DATA_RETENTION_MS,
    videos,
  }
}

export async function fetchYouTubeSignalsForIdeas(ideas, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now()
  const apiKey = options.apiKey ?? process.env.YOUTUBE_API_KEY
  const fetchImpl = options.fetchImpl || globalThis.fetch
  const input = Array.isArray(ideas) ? ideas.slice(0, MAX_IDEAS_PER_REQUEST) : []
  const byIdea = {}

  if (!apiKey) {
    for (const idea of input) byIdea[idea.id] = fallback(idea.id, 'not_configured', 'YouTube enrichment is not configured on the server. AI scoring continued without external video data.', '', now)
    return { byIdea, processed: input.length }
  }

  const enrichOne = async idea => {
    const ideaId = String(idea?.id || '')
    const query = extractYouTubeQuery(idea)
    if (!query) {
      byIdea[ideaId] = fallback(ideaId, 'invalid_query', 'There were not enough meaningful title or description keywords to search YouTube. AI scoring continued without external video data.', '', now)
      return
    }
    const cacheKey = query.toLowerCase()
    let cached = cache.get(cacheKey)
    if (cached && cached.expiresAt > now) {
      byIdea[ideaId] = { ...cached.value, ideaId }
      return
    }
    if (cached) cache.delete(cacheKey)

    let promise = inFlight.get(cacheKey)
    if (!promise) {
      promise = fetchTopic(query, { apiKey, fetchImpl, now })
        .then(value => {
          const stored = { ...value, ideaId: '', fetchedAt: now, expiresAt: now + DATA_RETENTION_MS }
          const ttl = ['unavailable', 'quota_exceeded', 'budget_limited'].includes(stored.status) ? 60 * 1000 : CACHE_TTL_MS
          cache.set(cacheKey, { value: stored, expiresAt: now + ttl })
          while (cache.size > 250) cache.delete(cache.keys().next().value)
          return stored
        })
        .finally(() => inFlight.delete(cacheKey))
      inFlight.set(cacheKey, promise)
    }
    byIdea[ideaId] = { ...(await promise), ideaId }
  }

  // Bound concurrent calls to keep a ten-idea review responsive without sending
  // a large burst of requests to the YouTube API.
  for (let index = 0; index < input.length; index += 4) {
    await Promise.all(input.slice(index, index + 4).map(enrichOne))
  }
  return { byIdea, processed: input.length }
}

export function formatYouTubeSignalsContext(byIdea = {}) {
  const entries = Object.values(byIdea)
  if (!entries.length) return 'YouTube social signals: none requested.'
  return 'YOUTUBE SOCIAL SIGNALS (external public YouTube evidence; never describe these as Quorlyth votes, members, or in-app activity):\n'
    + entries.map(signal => {
      const header = 'Idea ID: ' + signal.ideaId + '\nStatus: ' + signal.status + '\nQuery keywords: ' + (signal.query || 'none') + '\nAvailability note: ' + signal.message
      const videoLines = (signal.videos || []).slice(0, 4).map(video =>
        '- ' + video.title + ' | channel: ' + video.channelTitle
        + ' | published: ' + (video.publishedAt || 'not available')
        + ' | views: ' + (video.viewCount === null ? 'not public' : video.viewCount)
        + ' | likes: ' + (video.likeCount === null ? 'not public' : video.likeCount)
        + ' | comments: ' + (video.commentCount === null ? 'not public' : video.commentCount)
        + ' | URL: ' + video.url
      ).join('\n')
      return header + (videoLines ? '\nSource videos (individual values only; do not calculate averages or aggregate these values):\n' + videoLines : '')
    }).join('\n\n')
}

export function clearYouTubeCacheForTests() {
  cache.clear()
  inFlight.clear()
  budgetDay = ''
  searchesToday = 0
  quotaBlockedDay = ''
}
