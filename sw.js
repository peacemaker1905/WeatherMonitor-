const CACHE_NAME = 'redemet-pwa-v3';
const ASSETS = [
    './',
    './index.html',
    './css/styles.css',
    './js/app.js',
    './manifest.json'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            );
        })
    );
});

self.addEventListener('fetch', event => {
    // Exclude API requests from caching (we want fresh data)
    if (event.request.url.includes('api-redemet')) {
        return;
    }
    
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            return cachedResponse || fetch(event.request);
        })
    );
});

// Listen for messages from the main thread to show notifications
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
        const title = event.data.title;
        const options = event.data.options;
        self.registration.showNotification(title, options);
    }
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    // Focus or open the app window
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            if (clientList.length > 0) {
                let client = clientList[0];
                for (let i = 0; i < clientList.length; i++) {
                    if (clientList[i].focused) {
                        client = clientList[i];
                    }
                }
                return client.focus();
            }
            return clients.openWindow('/');
        })
    );
});

// Adicionado para satisfazer a auditoria do PWABuilder (Suporte a Web Push)
self.addEventListener('push', event => {
    let data = { title: "WEATHER MONITOR", body: "Nova atualização meteorológica." };
    
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data.body = event.data.text();
        }
    }
    
    const options = {
        body: data.body,
        icon: './icons/icon-192x192.png',
        badge: './icons/icon-192x192.png',
        vibrate: [200, 100, 200]
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});
