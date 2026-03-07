const CACHE_NAME = 'filemover-v1';
const urlsToCache = [
    './index.html',
    './script.js',
    './manifest.json'
];

// 서비스 워커 설치: 기본 리소스 캐싱
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                return cache.addAll(urlsToCache);
            })
    );
});

// 활성화 시 기존 캐시 지우기 (버전 업데이트용)
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// fetch 이벤트 가로채기: 네트워크 요청 (단, Firebase, 클라우디너리 등 API 요청은 무조건 네트워크 우회)
self.addEventListener('fetch', event => {
    // PWA는 POST 방식이나 외부 API 호출을 캐싱하려고 하면 에러를 발생시킬 수 있으므로
    // GET 요청이 아니거나 파이어베이스/클라우디너리 API 요청인 경우엔 기본 fetch로 넘깁니다.
    if (event.request.method !== 'GET') {
        return;
    }

    const url = new URL(event.request.url);
    // 외부 도메인 API 요청이면 캐시를 사용하지 않음
    if (url.hostname.includes('firebaseio.com') ||
        url.hostname.includes('googleapis.com') ||
        url.hostname.includes('cloudinary.com') ||
        url.hostname.includes('firestore')) {
        return;
    }

    // 로컬 정적 리소스에 대해서만 캐시 우선 전략 사용
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request).then(
                    response => {
                        // 외부 도픽이 아닌 내 도메인이면서 GET만 캐싱
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseToCache);
                            });
                        return response;
                    }
                );
            })
    );
});
