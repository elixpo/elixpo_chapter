import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

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

// ✅ 404 fallback
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', 'oopsie.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
