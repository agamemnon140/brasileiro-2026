// Service Worker — Brasileirão 2026 PWA
// Estratégia: network-first com fallback a cache. Ideal pra app cuja base de
// dados (resultados) é atualizada com frequência — preferimos servir a versão
// mais nova quando o usuário tem rede, mas mantemos o app funcional offline.

const VERSION = 'v4.15.0';
const CACHE_NAME = `brasileirao-2026-${VERSION}`;

// Arquivos do app shell — pré-cacheados na instalação
const APP_SHELL = [
  './',
  './index.html',
  './app.jsx',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/favicon-16.png',
];

// CDNs externas: cachear sob demanda (não pré-cachear pra não atrasar install)
const CDN_HOSTS = [
  'unpkg.com',
  'cdn.tailwindcss.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('brasileirao-2026-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Cache-first para CDNs (versões pinned, raro mudar)
  if (CDN_HOSTS.some((h) => url.hostname.endsWith(h))) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((resp) => {
          if (resp && resp.status === 200) {
            const respClone = resp.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, respClone));
          }
          return resp;
        }).catch(() => caches.match('./index.html'));
      })
    );
    return;
  }

  // Network-first para tudo do nosso origin (HTML, JSX, ícones, etc)
  event.respondWith(
    fetch(req)
      .then((resp) => {
        if (resp && resp.status === 200 && resp.type !== 'opaque') {
          const respClone = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, respClone));
        }
        return resp;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
  );
});

// Pula waiting quando o cliente pede (botão "Atualizar" futuro pode usar isso)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
