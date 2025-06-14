import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import getTodaysPodcasts from './BackendNode/podCastDetailsFetch.js';
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





app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', 'oopsie.html'));
});




app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
