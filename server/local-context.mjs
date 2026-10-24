const RADIUS_METERS = 3000
const RESULT_LIMIT = 15
const CACHE_TTL_MS = 10 * 60 * 1000
const cache = new Map()
const inFlight = new Map()
const requestsByClient = new Map()
const CLIENT_WINDOW_MS = 60 * 1000
const CLIENT_MAX_REQUESTS = 12

const FILTERS = {
  food: [
    ['amenity', 'restaurant|cafe|fast_food|food_court|ice_cream'],
  ],
  health: [
    ['amenity', 'hospital|clinic|doctors|pharmacy|dentist'],
  ],
  shopping: [
    ['shop', 'supermarket|convenience|mall|department_store|clothes|electronics'],
    ['amenity', 'marketplace'],
  ],
  fitness: [
    ['leisure', 'fitness_centre|sports_centre|swimming_pool'],
    ['sport', '.+'],
  ],
  education: [
    ['amenity', 'library|college|university'],
  ],
  transport: [
    ['public_transport', '.+'],
    ['highway', 'bus_stop'],
    ['railway', 'station|tram_stop'],
  ],
  'things-to-do': [
    ['leisure', 'park|garden|nature_reserve|sports_centre'],
    ['tourism', 'attraction|museum|gallery|zoo|theme_park|viewpoint'],
  ],
  general: [
    ['amenity', 'restaurant|cafe|fast_food|marketplace'],
    ['leisure', 'park|garden|nature_reserve'],
    ['tourism', 'attraction|museum|gallery|viewpoint'],
    ['shop', 'supermarket|convenience|mall'],
  ],
}

function send(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.end(JSON.stringify(payload))
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 4096) {
      const error = new Error('Request too large')
      error.status = 413
      throw error
    }
    chunks.push(Buffer.from(chunk))
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') }
  catch {
    const error = new Error('Invalid JSON')
    error.status = 400
    throw error
  }
}

function categoryName(tags) {
  return tags.amenity || tags.shop || tags.tourism || tags.leisure || tags.public_transport || tags.highway || tags.railway || tags.sport || 'local place'
}

function distanceKm(aLat, aLon, bLat, bLon) {
  const rad = value => value * Math.PI / 180
  const dLat = rad(bLat - aLat)
  const dLon = rad(bLon - aLon)
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x)))
}

function buildQuery(latitude, longitude, category) {
  const filters = FILTERS[category]
  const selectors = []
  for (const [key, pattern] of filters) {
    // Patterns are fixed by this module; coordinates are validated numeric values.
    const selector = `["${key}"~"${pattern}"]`
    selectors.push(`node(around:${RADIUS_METERS},${latitude},${longitude})${selector};`)
    selectors.push(`way(around:${RADIUS_METERS},${latitude},${longitude})${selector};`)
    selectors.push(`relation(around:${RADIUS_METERS},${latitude},${longitude})${selector};`)
  }
  return `[out:json][timeout:8];(\n${selectors.join('\n')}\n);out center tags ${RESULT_LIMIT};`
}

function normalizePlaces(payload, latitude, longitude) {
  if (!Array.isArray(payload?.elements)) return []
  const unique = new Map()
  for (const item of payload.elements) {
    const tags = item?.tags && typeof item.tags === 'object' ? item.tags : {}
    const name = typeof tags.name === 'string' ? tags.name.trim().slice(0, 120) : ''
    if (!name || !item?.type || !Number.isFinite(Number(item.id))) continue
    const lat = Number(item.lat ?? item.center?.lat)
    const lon = Number(item.lon ?? item.center?.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const km = distanceKm(latitude, longitude, lat, lon)
    const key = name.toLowerCase() + '|' + categoryName(tags)
    if (!unique.has(key) || unique.get(key).distanceKm > km) {
      unique.set(key, {
        name,
        kind: String(categoryName(tags)).replace(/_/g, ' ').slice(0, 80),
        distanceKm: Math.round(km * 10) / 10,
        mapUrl: `https://www.openstreetmap.org/${item.type}/${item.id}`,
        area: [tags['addr:suburb'], tags['addr:city'], tags['addr:district'], tags['addr:state']]
          .filter(value => typeof value === 'string' && value.trim())
          .map(value => value.trim().slice(0, 60))
          .filter((value, index, all) => all.indexOf(value) === index)
          .slice(0, 3),
      })
    }
  }
  return [...unique.values()].sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 10)
}

function clientKey(req) {
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim()
  return forwarded || String(req.headers?.['x-real-ip'] || 'unknown').slice(0, 80)
}

function rateLimited(req) {
  const now = Date.now()
  const key = clientKey(req)
  const record = requestsByClient.get(key)
  if (!record || now - record.start >= CLIENT_WINDOW_MS) {
    requestsByClient.set(key, { start: now, count: 1 })
    return false
  }
  record.count += 1
  return record.count > CLIENT_MAX_REQUESTS
}

export async function localContext(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return send(res, 405, { ok: false, error: 'Use POST to request nearby place context.' })
  }
  if (rateLimited(req)) return send(res, 429, { ok: false, error: 'Too many local searches. Please try again shortly.' })

  let body
  try { body = await readJson(req) }
  catch (error) { return send(res, error.status || 400, { ok: false, error: error.status === 413 ? 'Request too large.' : 'Invalid request body.' }) }

  const latitude = Number(body?.latitude)
  const longitude = Number(body?.longitude)
  const category = typeof body?.category === 'string' ? body.category : 'general'
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return send(res, 400, { ok: false, error: 'Valid browser coordinates are required.' })
  }
  if (!Object.prototype.hasOwnProperty.call(FILTERS, category)) return send(res, 400, { ok: false, error: 'Unsupported nearby-place category.' })

  const cacheKey = [latitude.toFixed(3), longitude.toFixed(3), category].join(':')
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return send(res, 200, { ok: true, ...cached.payload, cached: true })
  if (inFlight.has(cacheKey)) {
    try { return send(res, 200, { ok: true, ...(await inFlight.get(cacheKey)), cached: false }) }
    catch { return send(res, 502, { ok: false, error: 'Nearby-place data is temporarily unavailable.' }) }
  }

  const work = (async () => {
    const query = buildQuery(latitude, longitude, category)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8500)
    try {
      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: 'data=' + encodeURIComponent(query),
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Overpass unavailable')
      const payload = await response.json()
      const places = normalizePlaces(payload, latitude, longitude)
      const nearestArea = places.find(place => place.area.length)?.area || []
      const result = {
        category,
        area: nearestArea.join(', '),
        places: places.map(({ area, ...place }) => place),
        attribution: '© OpenStreetMap contributors',
        source: 'OpenStreetMap',
        updatedAt: Date.now(),
        note: 'Place records are approximate and may be incomplete. Opening hours, ratings, safety, and real-time availability have not been verified.',
      }
      cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, payload: result })
      if (cache.size > 150) {
        for (const [key, value] of cache) if (value.expiresAt <= Date.now()) cache.delete(key)
        while (cache.size > 180) cache.delete(cache.keys().next().value)
      }
      return result
    } finally { clearTimeout(timer) }
  })()
  inFlight.set(cacheKey, work)
  try {
    const payload = await work
    return send(res, 200, { ok: true, ...payload, cached: false })
  } catch {
    return send(res, 502, { ok: false, error: 'Nearby-place data is temporarily unavailable.' })
  } finally {
    inFlight.delete(cacheKey)
  }
}
