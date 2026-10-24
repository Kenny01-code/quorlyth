import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { localContext } from './local-context.mjs'

const originalFetch = globalThis.fetch
let clientNumber = 0

afterEach(() => {
  globalThis.fetch = originalFetch
})

async function invoke(body, method = 'POST') {
  let output = ''
  const headers = {}
  const res = {
    statusCode: 200,
    setHeader(name, value) { headers[name.toLowerCase()] = value },
    end(value) { output = String(value ?? '') },
  }
  await localContext({
    method,
    body,
    headers: { 'x-forwarded-for': '198.51.100.' + (++clientNumber) },
  }, res)
  return { status: res.statusCode, headers, body: JSON.parse(output || '{}') }
}

test('nearby place context validates and normalizes OpenStreetMap results without returning raw coordinates', async () => {
  let requestedUrl = ''
  let query = ''
  globalThis.fetch = async (url, options = {}) => {
    requestedUrl = String(url)
    query = new URLSearchParams(String(options.body || '')).get('data') || ''
    return new Response(JSON.stringify({
      elements: [
        { type: 'node', id: 101, lat: 6.5244, lon: 3.3792, tags: { name: 'Sample Cafe', amenity: 'cafe', 'addr:city': 'Lagos' } },
        { type: 'way', id: 202, center: { lat: 6.5300, lon: 3.3800 }, tags: { name: 'Sample Restaurant', amenity: 'restaurant' } },
        { type: 'node', id: 303, lat: 6.5245, lon: 3.3793, tags: { amenity: 'cafe' } },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  const result = await invoke({ latitude: 6.5244, longitude: 3.3792, category: 'food' })
  assert.equal(result.status, 200)
  assert.equal(result.body.ok, true)
  assert.equal(result.body.source, 'OpenStreetMap')
  assert.match(result.body.attribution, /OpenStreetMap contributors/)
  assert.match(requestedUrl, /overpass-api\.de/)
  assert.match(query, /amenity/)
  assert.match(query, /restaurant\|cafe\|fast_food/)
  assert.doesNotMatch(query, /user supplied|javascript|https?:/i)
  assert.deepEqual(result.body.places.map(place => place.name), ['Sample Cafe', 'Sample Restaurant'])
  assert.ok(result.body.places.every(place => Number.isFinite(place.distanceKm)))
  assert.ok(result.body.places.every(place => /^https:\/\/www\.openstreetmap\.org\//.test(place.mapUrl)))
  assert.equal(Object.hasOwn(result.body, 'latitude'), false)
  assert.equal(Object.hasOwn(result.body, 'longitude'), false)
})

test('invalid coordinates and categories fail before any outside request is made', async () => {
  let called = false
  globalThis.fetch = async () => { called = true; throw new Error('No request expected') }

  const invalidCoordinates = await invoke({ latitude: 200, longitude: 10, category: 'food' })
  const invalidCategory = await invoke({ latitude: 6, longitude: 3, category: 'food];out body;' })

  assert.equal(invalidCoordinates.status, 400)
  assert.equal(invalidCoordinates.body.ok, false)
  assert.equal(invalidCategory.status, 400)
  assert.equal(invalidCategory.body.ok, false)
  assert.equal(called, false)
})

test('nearby context endpoint allows POST only', async () => {
  const result = await invoke({}, 'GET')
  assert.equal(result.status, 405)
  assert.equal(result.headers.allow, 'POST')
  assert.equal(result.body.ok, false)
})
