import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import {
  clearYouTubeCacheForTests,
  extractYouTubeQuery,
  fetchYouTubeSignalsForIdeas,
} from './youtube.mjs'

afterEach(() => clearYouTubeCacheForTests())

function okJson(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function quotaJson(reason = 'quotaExceeded') {
  return new Response(JSON.stringify({ error: { errors: [{ reason }], message: 'quota test' } }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  })
}

test('YouTube keywords are extracted from the title, description and tags without generic stopwords', () => {
  const query = extractYouTubeQuery({
    title: 'Create a solar-powered study lamp',
    body: 'A low-cost solar lamp with rechargeable batteries for students studying during power outages.',
    tags: ['solar energy', 'education'],
  })
  assert.match(query, /solar/)
  assert.match(query, /lamp/)
  assert.match(query, /energy|education|rechargeable|batteries|students/)
  assert.doesNotMatch(query, /\b(the|and|for|with|idea|community)\b/i)
  assert.ok(query.length <= 100)
})

test('missing YouTube key returns a clear fallback and makes no network request', async () => {
  let calls = 0
  const result = await fetchYouTubeSignalsForIdeas(
    [{ id: 'idea-a', title: 'Solar study lamp', body: 'Rechargeable light for students' }],
    { apiKey: '', fetchImpl: async () => { calls++; throw new Error('must not call') } },
  )
  assert.equal(calls, 0)
  assert.equal(result.byIdea['idea-a'].status, 'not_configured')
  assert.match(result.byIdea['idea-a'].message, /not configured/i)
})

test('fetches recent public video metadata and real public statistics from YouTube', async () => {
  clearYouTubeCacheForTests()
  const requested = []
  const now = Date.parse('2026-10-15T12:00:00.000Z')
  const fetchImpl = async url => {
    const u = new URL(String(url))
    requested.push(u)
    assert.equal(u.searchParams.get('key'), 'server-test-key')
    if (u.pathname.endsWith('/search')) {
      assert.equal(u.searchParams.get('type'), 'video')
      assert.equal(u.searchParams.get('order'), 'date')
      assert.equal(u.searchParams.get('maxResults'), '6')
      assert.ok(u.searchParams.has('publishedAfter'))
      return okJson({ items: [
        { id: { videoId: 'video-1' }, snippet: { title: 'Search title one', channelTitle: 'Channel one', publishedAt: '2026-10-01T00:00:00Z' } },
        { id: { videoId: 'video-2' }, snippet: { title: 'Search title two', channelTitle: 'Channel two', publishedAt: '2026-09-01T00:00:00Z' } },
      ] })
    }
    assert.ok(u.pathname.endsWith('/videos'))
    assert.equal(u.searchParams.get('part'), 'snippet,statistics')
    return okJson({ items: [
      { id: 'video-1', snippet: { title: 'Actual title one', channelTitle: 'Actual channel one', publishedAt: '2026-10-01T00:00:00Z' }, statistics: { viewCount: '1200', likeCount: '30', commentCount: '10' } },
      { id: 'video-2', snippet: { title: 'Actual title two', channelTitle: 'Actual channel two', publishedAt: '2026-09-01T00:00:00Z' }, statistics: { viewCount: '800', likeCount: '10' } },
    ] })
  }
  const result = await fetchYouTubeSignalsForIdeas([
    { id: 'idea-1', title: 'Solar-powered study lamp', body: 'Affordable rechargeable lamp for students', tags: ['solar', 'education'] },
  ], { apiKey: 'server-test-key', fetchImpl, now })

  const signals = result.byIdea['idea-1']
  assert.equal(requested.length, 2)
  assert.equal(signals.status, 'available')
  assert.equal('videoCount' in signals, false)
  assert.equal('averageViews' in signals, false)
  assert.equal(signals.videos[0].title, 'Actual title one')
  assert.equal(signals.videos[0].channelTitle, 'Actual channel one')
  assert.equal(signals.videos[0].viewCount, 1200)
  assert.equal(signals.videos[0].likeCount, 30)
  assert.equal(signals.videos[0].commentCount, 10)
  assert.equal(signals.videos[1].commentCount, null)
  assert.match(signals.videos[0].url, /youtube\.com\/watch\?v=video-1/)
})

test('empty recent search retries with broader relevance search and labels older videos as context', async () => {
  const requested = []
  const now = Date.parse('2026-10-15T12:00:00.000Z')
  const fetchImpl = async url => {
    const u = new URL(String(url))
    requested.push(u)
    if (u.pathname.endsWith('/search')) {
      if (requested.filter(x => x.pathname.endsWith('/search')).length === 1) {
        assert.ok(u.searchParams.has('publishedAfter'))
        assert.equal(u.searchParams.get('order'), 'date')
        return okJson({ items: [] })
      }
      assert.equal(u.searchParams.get('order'), 'relevance')
      assert.equal(u.searchParams.has('publishedAfter'), false)
      return okJson({ items: [
        { id: { videoId: 'older-video' }, snippet: { title: 'Older related video', channelTitle: 'Topic channel', publishedAt: '2024-06-01T00:00:00Z' } },
      ] })
    }
    assert.ok(u.pathname.endsWith('/videos'))
    return okJson({ items: [
      { id: 'older-video', snippet: { title: 'Older related video', channelTitle: 'Topic channel', publishedAt: '2024-06-01T00:00:00Z' }, statistics: { viewCount: '2400' } },
    ] })
  }

  const result = await fetchYouTubeSignalsForIdeas([
    { id: 'idea-fallback', title: 'Solar-powered study lamp', body: 'Affordable rechargeable lamp for students', tags: ['solar', 'education'] },
  ], { apiKey: 'server-test-key', fetchImpl, now })

  const signal = result.byIdea['idea-fallback']
  assert.equal(requested.filter(u => u.pathname.endsWith('/search')).length, 2)
  assert.equal(signal.status, 'partial')
  assert.equal(signal.videos[0].videoId, 'older-video')
  assert.equal(signal.videos[0].viewCount, 2400)
  assert.match(signal.message, /older public videos/i)
  assert.match(signal.message, /not evidence of current demand|background context/i)
})

test('same query is cached and shared between ideas to protect the search quota', async () => {
  let searchCalls = 0
  let videoCalls = 0
  const fetchImpl = async url => {
    const path = new URL(String(url)).pathname
    if (path.endsWith('/search')) {
      searchCalls++
      return okJson({ items: [{ id: { videoId: 'cached-video' }, snippet: { title: 'Cached', channelTitle: 'Channel', publishedAt: '2026-10-01T00:00:00Z' } }] })
    }
    videoCalls++
    return okJson({ items: [{ id: 'cached-video', snippet: { title: 'Cached', channelTitle: 'Channel', publishedAt: '2026-10-01T00:00:00Z' }, statistics: { viewCount: '99' } }] })
  }
  const idea = { title: 'Budget solar charging lantern', body: 'Rechargeable solar powered light', tags: ['energy'] }
  const result = await fetchYouTubeSignalsForIdeas(
    [{ ...idea, id: 'idea-one' }, { ...idea, id: 'idea-two' }],
    { apiKey: 'server-test-key', fetchImpl, now: Date.parse('2026-10-15T12:00:00Z') },
  )
  assert.equal(searchCalls, 1)
  assert.equal(videoCalls, 1)
  assert.equal(result.byIdea['idea-one'].videos[0].viewCount, 99)
  assert.equal(result.byIdea['idea-two'].ideaId, 'idea-two')
})

test('explicit refresh bypasses a warm cache and fetches the newest public video data', async () => {
  let searchCalls = 0
  let videoCalls = 0
  const fetchImpl = async url => {
    const u = new URL(String(url))
    if (u.pathname.endsWith('/search')) {
      searchCalls++
      return okJson({ items: [{
        id: { videoId: 'fresh-video-' + searchCalls },
        snippet: { title: 'Fresh title ' + searchCalls, channelTitle: 'Live channel', publishedAt: '2026-10-15T12:00:00Z' },
      }] })
    }
    videoCalls++
    const id = u.searchParams.get('id')
    return okJson({ items: [{
      id,
      snippet: { title: 'Fresh title ' + searchCalls, channelTitle: 'Live channel', publishedAt: '2026-10-15T12:00:00Z' },
      statistics: { viewCount: String(100 * videoCalls), likeCount: String(videoCalls) },
    }] })
  }
  const idea = { id: 'live-idea', title: 'Fresh solar charging lantern', body: 'Solar powered camping lantern with USB charging', tags: ['solar', 'charging'] }
  const now = Date.parse('2026-10-15T12:00:00Z')
  const first = await fetchYouTubeSignalsForIdeas([idea], { apiKey: 'server-test-key', fetchImpl, now })
  const second = await fetchYouTubeSignalsForIdeas([idea], {
    apiKey: 'server-test-key',
    fetchImpl,
    now: now + 60_000,
    forceRefresh: true,
  })

  assert.equal(searchCalls, 2)
  assert.equal(videoCalls, 2)
  assert.equal(first.byIdea['live-idea'].videos[0].videoId, 'fresh-video-1')
  assert.equal(second.byIdea['live-idea'].videos[0].videoId, 'fresh-video-2')
  assert.equal(first.byIdea['live-idea'].videos[0].viewCount, 100)
  assert.equal(second.byIdea['live-idea'].videos[0].viewCount, 200)
})

test('quota failures are honest and trip a daily circuit breaker', async () => {
  let calls = 0
  const fetchImpl = async () => { calls++; return quotaJson() }
  const now = Date.parse('2026-10-15T12:00:00.000Z')
  const first = await fetchYouTubeSignalsForIdeas([{ id: 'one', title: 'Solar lamp reviews' }], { apiKey: 'server-test-key', fetchImpl, now })
  const second = await fetchYouTubeSignalsForIdeas([{ id: 'two', title: 'Cooking recipes for families' }], { apiKey: 'server-test-key', fetchImpl, now })
  assert.equal(calls, 1)
  assert.equal(first.byIdea.one.status, 'quota_exceeded')
  assert.equal(second.byIdea.two.status, 'quota_exceeded')
  assert.match(second.byIdea.two.message, /quota/i)
})

test('network errors become a fallback and never reject the review helper', async () => {
  const result = await fetchYouTubeSignalsForIdeas([{ id: 'idea-net', title: 'Reusable water filter bottle' }], {
    apiKey: 'server-test-key',
    fetchImpl: async () => { throw new Error('simulated timeout') },
  })
  assert.equal(result.byIdea['idea-net'].status, 'unavailable')
  assert.match(result.byIdea['idea-net'].message, /AI scoring can continue/i)
})

test('an instance daily search budget prevents unlimited cache-miss calls', async () => {
  let searches = 0
  const now = Date.parse('2026-10-15T12:00:00.000Z')
  const fetchImpl = async url => {
    const u = new URL(String(url))
    if (u.pathname.endsWith('/search')) {
      searches++
      return okJson({ items: [] })
    }
    throw new Error('videos.list should not be called when search has no results')
  }
  const adjectives = ['amber', 'azure', 'brisk', 'coral', 'distant', 'emerald', 'frozen', 'gentle', 'hidden']
  const topics = ['astronomy', 'geology', 'volcanoes', 'baking', 'gardening', 'ceramics', 'robotics', 'oceans', 'architecture']
  const ideas = Array.from({ length: 81 }, (_, i) => ({
    id: 'budget-' + i,
    title: 'Guides for ' + adjectives[Math.floor(i / 9)] + ' ' + topics[i % 9] + ' beginners',
    body: 'Practical tutorials and learning techniques',
  }))
  const batches = []
  for (let i = 0; i < ideas.length; i += 10) batches.push(ideas.slice(i, i + 10))
  const results = []
  for (const batch of batches) results.push(await fetchYouTubeSignalsForIdeas(batch, { apiKey: 'server-test-key', fetchImpl, now }))
  assert.equal(searches, 80)
  assert.equal(results[0].byIdea['budget-0'].status, 'no_results')
  assert.equal(results[8].byIdea['budget-80'].status, 'budget_limited')
})
