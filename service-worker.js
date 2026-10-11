// 릴리스 번호를 올리지 않아도 항상 같은 런타임 캐시를 최신 응답으로 교체합니다.
const CACHE_NAME = 'filemover-runtime';
const urlsToCache = [
    './',
    './index.html',
    './script.js',
    './backend.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png'
];

// 서비스 워커 설치: 기본 리소스를 캐싱하고 새 워커를 즉시 활성화합니다.
self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
});

// 활성화 시 예전 버전형 캐시를 한 번만 정리하고 열린 화면을 즉시 제어합니다.
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(async cacheNames => {
                const legacyCaches = cacheNames.filter(
                    cacheName => cacheName.startsWith('filemover-v')
                );

                await Promise.all(
                    legacyCaches.map(cacheName => caches.delete(cacheName))
                );

                await self.clients.claim();

                // 버전형 캐시에서 고정 캐시로 넘어가는 이번 변경만 열린 화면에 즉시 반영합니다.
                if (legacyCaches.length > 0) {
                    const windowClients = await self.clients.matchAll({ type: 'window' });
                    await Promise.all(
                        windowClients.map(client => client.navigate(client.url).catch(() => null))
                    );
                }
            })
    );
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') {
        return;
    }

    const url = new URL(event.request.url);

    // 외부 리소스와 API 요청은 브라우저의 기본 네트워크 처리에 맡깁니다.
    if (url.origin !== self.location.origin) {
        return;
    }

    // 같은 출처의 앱 파일은 네트워크 우선으로 받아 배포된 최신 버전을 즉시 반영합니다.
    // 네트워크가 끊겼을 때만 캐시를 사용해 PWA 오프라인 동작을 유지합니다.
    event.respondWith(
        fetch(event.request, { cache: 'no-store' })
            .then(response => {
                if (!response || response.status !== 200 || response.type !== 'basic') {
                    return response;
                }

                const responseToCache = response.clone();
                caches.open(CACHE_NAME)
                    .then(cache => cache.put(event.request, responseToCache))
                    .catch(() => {});

                return response;
            })
            .catch(() => caches.open(CACHE_NAME).then(cache => cache.match(event.request)))
    );
});

// 페이지에서 즉시 활성화를 요청하는 경우에도 대응합니다.
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
