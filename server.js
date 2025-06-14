import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import {getTodaysPodcasts, getTodaysPodcastDetails} from './BackendNode/podCastDetailsFetch.js';
import {getTodaysNews} from './BackendNode/newsDetailsFetch.js';
import {getDominantColor} from './BackendNode/getDominantColor.js';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
app.use(cors());

// ✅ Serve static files from 'public' (important for CSS/JS/images)
app.use(express.static(path.join(__dirname, 'public')));

// ✅ Page routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/c', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'search.html'));
});
app.get('/daily', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'daily.html'));
});
app.get('/podcast', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'podcast.html'));
});


app.get('/api/podcast', async (req, res) => {
    try {
        const podcast = await getTodaysPodcasts();
        console.log("Response sent successfully");
        res.json(podcast);
    } catch (error) {
        console.error("Error fetching podcast:", error);
        res.status(500).json({ error: "Failed to fetch podcast details" });
    }
});

app.get('/api/podcastDetails', async (req, res) => {
  try {
      const podcast = await getTodaysPodcastDetails();
      console.log("Response sent successfully");
      res.json(podcast);
  } catch (error) {
      console.error("Error fetching podcast:", error);
      res.status(500).json({ error: "Failed to fetch podcast details" });
  }
});

app.get('/api/news', async (req, res) => {
    try 
    {
        const news = await getTodaysNews();
        console.log("Response sent successfully");
        res.json(news);
    }
    catch
    {
        console.error("Error fetching news:", error);
        res.status(500).json({ error: "Failed to fetch news details" });
    }
})

app.get('/api/getDominantColor', async (req, res) => {
  const { imageUrl } = req.query;
  if (!imageUrl) {
    return res.status(400).json({ error: "Missing imageUrl query parameter" });
  }

  try {
    // Call the getDominantColor function from getDominantColor.js
    const color = await getDominantColor(imageUrl);
    res.json({ color });
  } catch (error) {
    console.error("Error processing image:", error);
    res.status(500).json({ error: "Failed to process image" });
  }
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', 'oopsie.html'));
});




app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
