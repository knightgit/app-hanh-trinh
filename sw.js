const CACHE = 'hanh-trinh-v7';
const ASSETS = [
    './','./index.html','./app.js','./manifest.webmanifest','./icon-192.png','./icon-512.png',
    'https://cdn.tailwindcss.com',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(err => console.warn('Pre-cache fail', err))));
    self.skipWaiting();
});
self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
    self.clients.claim();
});
self.addEventListener('fetch', e => {
    const { request } = e;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);

    // Open-Meteo & Tile → network-first
    if (url.host.includes('open-meteo.com') || url.host.includes('tile.openstreetmap.org')) {
        e.respondWith(
            fetch(request).then(res => {
                const clone = res.clone();
                caches.open(CACHE).then(c => c.put(request, clone));
                return res;
            }).catch(() => caches.match(request))
        );
        return;
    }

    // Default: cache-first
    e.respondWith(
        caches.match(request).then(cached => cached || fetch(request).then(res => {
            if (res.ok) caches.open(CACHE).then(c => c.put(request, res.clone()));
            return res;
        }).catch(() => cached))
    );
});
f
