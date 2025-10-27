const staticAssets = [
    './',
    './index.html',
    './Css/canvas.css',
    './Css/canvas-responsive.css',
    './Css/light-theme.css',
    './Js/canvas.js',
    './Js/sidebar.js',
    './Images/logo.png',
    './Images/favicon.ico',
    './manifest.json'
];

self.addEventListener('install', async event => {
    const cache = await caches.open('static-cache');
    await cache.addAll(staticAssets);
});

self.addEventListener('fetch', event => {
    const req = event.request;
    const url = new URL(req.url);

    if (url.origin === location.origin) {
        event.respondWith(cacheFirst(req));
    } else {
        event.respondWith(networkFirst(req));
    }
});

async function cacheFirst(req) {
    const cachedResponse = await caches.match(req);
    return cachedResponse || fetch(req);
}

async function networkFirst(req) {
    const cache = await caches.open('dynamic-cache');

    try {
        const res = await fetch(req);
        await cache.put(req, res.clone());
        return res;
    } catch (error) {
        return await cache.match(req);
    }
}
