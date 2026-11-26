const CACHE = 'quorlyth-shell-v2'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/quorlyth-logo.svg']

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('quorlyth-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (!response.ok) return response
      return caches.open(CACHE).then(cache => cache.put('/index.html', response.clone())).then(() => response)
    }).catch(async () => (await caches.match(request)) || (await caches.match('/index.html')) || Response.error()))
    return
  }

  if (/\.(?:js|css|svg|png|webp|ico|woff2?)$/i.test(url.pathname) || url.pathname === '/manifest.webmanifest') {
    event.respondWith(caches.match(request).then(cached => {
      const network = fetch(request).then(response => {
        if (!response.ok) return response
        return caches.open(CACHE).then(cache => cache.put(request, response.clone())).then(() => response)
      })
      return cached || network.catch(() => Response.error())
    }))
  }
})
