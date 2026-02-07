import express from 'express'
import Fuse from 'fuse.js';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';

const PORT = 3002;
const ICONS_FOLDER = path.join('ICONS_CONT');
const METADATA_FILE = path.join('ICONS_CONT/info/icons.json');

const app = express();
app.use(cors());

// Rate limiter
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please try again later.' }
});
// app.use('/search', limiter);
// app.use('/serve', limiter);

let metadata = {};
let fuse = null;

// Load and index metadata
function loadMetadata() {
    // Clear heap memory by dereferencing previous objects
    metadata = null;
    fuse = null;
    global.gc && global.gc(); 

    const raw = fs.readFileSync(METADATA_FILE, 'utf-8');
    metadata = JSON.parse(raw);

    const dataArray = Object.keys(metadata).map(filename => ({
        filename,
        ...metadata[filename]
    }));

    const options = {
        includeScore: true,
        threshold: 0.4,
        keys: ['filename', 'keywords', 'description', 'category']
    };

    fuse = new Fuse(dataArray, options);
    console.log(`✅ Reloaded ${dataArray.length} icons`);
}

loadMetadata();

// Watch for changes in metadata.json and reload index
fs.watchFile(METADATA_FILE, { interval: 1000 }, () => {
    console.log('🔁 Detected metadata.json change, reloading...');
    loadMetadata();
});

// Search endpoint
app.get('/search', (req, res) => {
    const q = (req.query.q || '').trim().toLowerCase();
    if (!q) return res.json([]);

    const results = fuse.search(q);
    const top = results.slice(0, 30).map(r => r.item);

    res.json(top);
});

// Serve raw SVG file as plain text (not rendered)
app.get('/serve', (req, res) => {
    const name = (req.query.name || '').trim();

    if (!name || !name.endsWith('.svg')) {
        return res.status(400).json({ error: 'Invalid or missing SVG filename.' });
    }

    const filePath = path.join(ICONS_FOLDER, name);

    fs.readFile(filePath, 'utf-8', (err, svg) => {
        if (err) {
            return res.status(404).json({ error: 'SVG file not found.' });
        }

        res.set('Content-Type', 'text/plain');
        res.send(svg);
    });
});

// Feed endpoint — returns sequential batch of icons
app.get('/feed', (req, res) => {
    const offset = parseInt(req.query.offset || '0', 10);
    const limit = parseInt(req.query.limit || '5', 10);

    const dataArray = Object.keys(metadata)
        .map(filename => ({
            filename,
            ...metadata[filename]
        }));

    const paginated = dataArray.slice(offset, offset + limit);

    res.json({
        offset,
        limit,
        total: dataArray.length,
        results: paginated
    });
});


// Start server
app.listen(PORT, () => {
    console.log(`🚀 Icon search API running on http://localhost:${PORT}`);
});
