// api/index.js
import express from 'express';
import serverless from 'serverless-http';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { getTodaysPodcasts, getTodaysPodcastDetails } from '../BackendNode/podCastDetailsFetch.js';
import { getTodaysNews, getTodaysNewsDetails } from '../BackendNode/newsDetailsFetch.js';
import { getDominantColor } from '../BackendNode/getDominantColor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const app = express();

app.use(cors());
app.use(express.static(path.join(rootDir, 'public')));

app.get('/', (req, res) => res.sendFile(path.join(rootDir, 'public', 'index.html')));
app.get('/daily', (req, res) => res.sendFile(path.join(rootDir, 'public', 'daily.html')));
app.get('/podcast', (req, res) => res.sendFile(path.join(rootDir, 'public', 'podcast.html')));
app.get('/c', (req, res) => res.sendFile(path.join(rootDir, 'public', 'search.html')));

// In-memory caching
let newsCache = null;
let newsCacheTime = 0;
let podcastCache = null;
let podcastCacheTime = 0;
let podcastDetailsCache = null;
let podcastDetailsCacheTime = 0;
const CACHE_DURATION = 10 * 60 * 1000; // 10 min

app.get('/api/news', async (req, res) => {
  const now = Date.now();
  if (newsCache && now - newsCacheTime < CACHE_DURATION) return res.json(newsCache);

  try {
    const news = await getTodaysNews();
    newsCache = news;
    newsCacheTime = now;
    res.json(news);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch news" });
  }
});

app.get('/api/podcast', async (req, res) => {
  const now = Date.now();
  if (podcastCache && now - podcastCacheTime < CACHE_DURATION) return res.json(podcastCache);

  try {
    const data = await getTodaysPodcasts();
    podcastCache = data;
    podcastCacheTime = now;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch podcast" });
  }
});

app.get('/api/podcastDetails', async (req, res) => {
  const now = Date.now();
  if (podcastDetailsCache && now - podcastDetailsCacheTime < CACHE_DURATION) return res.json(podcastDetailsCache);

  try {
    const data = await getTodaysPodcastDetails();
    podcastDetailsCache = data;
    podcastDetailsCacheTime = now;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch podcast details" });
  }
});

app.get('/api/newsDetails', async (req, res) => {
  try {
    const data = await getTodaysNewsDetails();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch news details" });
  }
});

app.get('/api/getDominantColor', async (req, res) => {
  const { imageUrl } = req.query;
  if (!imageUrl) return res.status(400).json({ error: "Missing imageUrl" });

  try {
    const color = await getDominantColor(imageUrl);
    res.json({ color });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to process image" });
  }
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(rootDir, 'public', 'oopsie.html'));
});

export default serverless(app);
