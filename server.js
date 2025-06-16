import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getTodaysPodcasts, getTodaysPodcastDetails } from './BackendNode/podCastDetailsFetch.js';
import { getTodaysNews, getTodaysNewsDetails } from './BackendNode/newsDetailsFetch.js';
import { getDominantColor } from './BackendNode/getDominantColor.js';
import { getLocation, getNearestLocationName, getStructuredWeather, generateAISummary, generateAIImage } from './BackendNode/locationWeather.js';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 40012;
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/c', (req, res) => res.sendFile(path.join(__dirname, 'public', 'search.html')));
app.get('/daily', (req, res) => res.sendFile(path.join(__dirname, 'public', 'daily.html')));
app.get('/podcast', (req, res) => res.sendFile(path.join(__dirname, 'public', 'podcast.html')));
app.get('/weather', (req, res) => res.sendFile(path.join(__dirname, 'public', 'weather.html')));

// In-memory cache
let newsCache = null;
let newsCacheTime = 0;
let weatherCacheByLocation = {};
let podcastCache = null;
let podcastCacheTime = 0;
let podcastDetailsCache = null;
let podcastDetailsCacheTime = 0;

// Set cache expiry duration (in milliseconds)
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

app.get('/api/news', async (req, res) => {
  const now = Date.now();
  if (newsCache && now - newsCacheTime < CACHE_DURATION) {
    return res.json(newsCache);
  }

  try {
    const news = await getTodaysNews();
    newsCache = news;
    newsCacheTime = now;
    console.log("News cache updated");
    res.json(news);
  } catch (error) {
    console.error("Error fetching news:", error);
    res.status(500).json({ error: "Failed to fetch news details" });
  }
});

app.get('/api/podcast', async (req, res) => {
  const now = Date.now();
  if (podcastCache && now - podcastCacheTime < CACHE_DURATION) {
    return res.json(podcastCache);
  }

  try {
    const podcast = await getTodaysPodcasts();
    podcastCache = podcast;
    podcastCacheTime = now;
    console.log("Podcast cache updated");
    res.json(podcast);
  } catch (error) {
    console.error("Error fetching podcast:", error);
    res.status(500).json({ error: "Failed to fetch podcast details" });
  }
});

app.get('/api/podcastDetails', async (req, res) => {
  const now = Date.now();
  if (podcastDetailsCache && now - podcastDetailsCacheTime < CACHE_DURATION) {
    return res.json(podcastDetailsCache);
  }

  try {
    const podcastDetails = await getTodaysPodcastDetails();
    podcastDetailsCache = podcastDetails;
    podcastDetailsCacheTime = now;
    console.log("Podcast details cache updated");
    res.json(podcastDetails);
  } catch (error) {
    console.error("Error fetching podcast details:", error);
    res.status(500).json({ error: "Failed to fetch podcast details" });
  }
});

app.get('/api/getDominantColor', async (req, res) => {
  const { imageUrl } = req.query;
  if (!imageUrl) {
    return res.status(400).json({ error: "Missing imageUrl query parameter" });
  }

  try {
    const color = await getDominantColor(imageUrl);
    res.json({ color });
  } catch (error) {
    console.error("Error processing image:", error);
    res.status(500).json({ error: "Failed to process image" });
  }
});

app.get('/api/newsDetails', async (req, res) => {
  try {
    const newsDetails = await getTodaysNewsDetails();
    res.json(newsDetails);
  } catch (error) {
    console.error("Error fetching news details:", error);
    res.status(500).json({ error: "Failed to fetch news details" });
  }
});



// Helper to build cache key from lat/lon or location name
function getWeatherCacheKey(lat, lon, locationName) {
  // Prefer locationName if available, else lat,lon
  if (locationName) return locationName.toLowerCase();
  if (lat && lon) return `${lat},${lon}`;
  return 'unknown';
}

app.get('/api/weather', async (req, res) => {
  try {
  
    let lat = "";
    let lon = "";
    let locationName = null;
    // console.log("The location is" + req.query.location);
   
    if (req.query.location) {
      
      lat = parseFloat(req.query.location.split(',')[1]);
      lon = parseFloat(req.query.location.split(',')[2]);
      locationName = req.query.location.split(',')[0]
      if (!lat || !lon) {
        return res.status(400).json({ error: "Unable to resolve location" });
      }
    } 
    
    // else {
    //   // If nothing provided, fallback to auto-detect (server-side)
    //   const locationResult = await getLocation();
    //   lat = locationResult[0];
    //   lon = locationResult[1];
    //   locationName = locationResult[2];
    //   if (!lat || !lon) {
    //     return res.status(400).json({ error: "Unable to determine location" });
    //   }
    // }

    const cacheKey = getWeatherCacheKey(lat, lon, locationName);

    // Serve from cache if available and not expired
    const now = Date.now();
    const cached = weatherCacheByLocation[cacheKey];
    if (cached && now - cached.time < CACHE_DURATION) {
      return res.json(cached.data);
    }
    // console.log(`Fetching weather for ${locationName} (${lat}, ${lon})`);

    const structuredWeather = await getStructuredWeather(lat, lon, locationName);
    // console.log(structuredWeather);
    if (!structuredWeather) {
      return res.status(500).json({ error: "Failed to fetch weather data" });
    }

    const aiSummary = await generateAISummary(structuredWeather);
    const aiImageLink = generateAIImage(structuredWeather.current.condition);

    const responseData = { structuredWeather, aiSummary, aiImageLink, bannerLink: aiImageLink };

    // Save to cache
    weatherCacheByLocation[cacheKey] = {
      data: responseData,
      time: now
    };

    res.json(responseData);
  } catch (error) {
    console.error("Error fetching weather:", error);
    res.status(500).json({ error: "Failed to fetch weather" });
  }
});


app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
