const CACHE_NAME = 'elixpo-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/404.html',
  '/about/',
  '/about/index.html',
  '/connect/',
  '/connect/index.html',
  '/projects/',
  '/projects/index.html',
  '/publications/',
  '/publications/index.html',
  '/CSS/about.css',
  '/CSS/connect.css',
  '/CSS/general.css',
  '/CSS/homePage.css',
  '/CSS/projects.css',
  '/CSS/publications.css',
  '/CSS/ASSESTS/hrz-image1.png',
  '/CSS/ASSESTS/paperTexture.jpg',
  '/CSS/ASSESTS/about/ptr-11.png',
  '/CSS/ASSESTS/about/sq-11.png',
  '/CSS/ASSESTS/about/sq-22.png',
  '/CSS/ASSESTS/projects/stamp-2.png',
  '/CSS/ASSESTS/publication/sq-1.png',
  '/CSS/ASSESTS/publication/sq-2.png',
  '/CSS/ASSESTS/punchlineSection/hz-pic1.png',
  '/CSS/ASSESTS/punchlineSection/vr-pic1.png',
  '/CSS/ASSESTS/spotlight/asciiArt.png',
  '/CSS/ASSESTS/spotlight/elixpo-art.png',
  '/CSS/ASSESTS/spotlight/elixpo-hackathon.png',
  '/CSS/ASSESTS/spotlight/elixpoSearchPicture.png',
  '/CSS/ASSESTS/techTracks/hz-image1.png',
  '/CSS/ASSESTS/techTracks/wand-1.png',
  '/CSS/ASSESTS/websiteSection/human-think1.png',
  '/CSS/ASSESTS/websiteSection/hz-owl1.png',
  '/CSS/ASSESTS/websiteSection/sq-seal1.png',
  '/CSS/FONT/Canopee Regular.otf',
  '/JS/about.js',
  '/JS/BSCONFIGSCR.js',
  '/JS/curtain2.js',
  '/JS/fadeInReveal.js',
  '/JS/footer.js',
  '/JS/linkRedirect.js',
  '/JS/mailConnect.js',
  '/JS/menu.js',
  '/JS/notification.js',
  '/JS/projects.js',
  '/JS/publications.js',
  '/JS/recommendations.js',
  '/JS/scaleContainer.js',
  '/JS/scroll.js',
  '/JS/spotlight.js'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        if (response) {
          return response;
        }
        return fetch(event.request);
      }
    )
  );
});
