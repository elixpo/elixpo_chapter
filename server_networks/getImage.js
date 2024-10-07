import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { IgApiClient } from 'instagram-private-api';
import { createObjectCsvWriter as createCsvWriter } from 'csv-writer';

const app = express();
const PORT = 3001;
const requestQueue = [];
const MAX_QUEUE_LENGTH = 15;
const maxRequests = 20;
let activeRequests = 0;

// File paths for CSV log and Instagram session
const logFilePath = path.join('/home/pi', 'promptLogger.csv');
const sessionFilePath = path.join('/home/pi', 'ig_session.json');

// Create CSV writer
const csvWriter = createCsvWriter({
  path: logFilePath,
  header: [
    { id: 'date', title: 'Date' },
    { id: 'imageUrl', title: 'Image URL' },
    { id: 'status', title: 'Status' },
    { id: 'aspectRatio', title: 'Aspect Ratio' },
    { id: 'seed', title: 'Seed' },
    { id: 'model', title: 'Model' },
    { id: 'responseTime', title: 'Response Time (ms)' }
  ],
  append: true
});

// Function to calculate GCD (Greatest Common Divisor)
function gcd(a, b) {
  return b ? gcd(b, a % b) : a;
}

// Function to calculate the aspect ratio
function getAspectRatio(width, height) {
  if (!width || !height) return 'Unknown';
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

// List of fallback image URLs
const fallbackImageUrls = [
  // Your fallback URLs here...
];

app.use(cors());
app.use(express.json());

let ig; // Instagram API client

// Function to log request details into the CSV file
function logRequest(imageUrl, status, aspectRatio, seed, model, responseTime) {
  const record = {
    date: new Date().toISOString(),
    imageUrl,
    status,
    aspectRatio,
    seed,
    model,
    responseTime
  };

  // Append the log entry to the CSV file
  csvWriter.writeRecords([record])
    .then(() => console.log('Log entry saved:', record))
    .catch(err => console.error('Error writing to CSV log:', err));
}

// Function to initialize Instagram client and login
const initializeInstagramClient = async () => {
  ig = new IgApiClient();
  ig.state.generateDevice('elixpo_ai');

  if (fs.existsSync(sessionFilePath)) {
    const savedSession = JSON.parse(fs.readFileSync(sessionFilePath, 'utf-8'));
    await ig.state.deserializeCookieJar(savedSession);
  } else {
    await ig.account.login('elixpo_ai', 'PIXIEFY16');
    const session = await ig.state.serializeCookieJar();
    fs.writeFileSync(sessionFilePath, JSON.stringify(session));
  }
};

// Middleware to track request queue length and log details
app.use((req, res, next) => {
  requestQueue.push(req);
  console.log('Request queue length:', requestQueue.length);

  res.on('finish', () => {
    requestQueue.shift(); // Remove the request after it is finished
  });

  next();
});

// Route to handle image download requests
app.post('/download-image', async (req, res) => {
  const { imageUrl } = req.body;
  const startTime = Date.now(); // Start time to track response time

  // Extract parameters from imageUrl
  const urlParams = new URLSearchParams(imageUrl.split('?')[1]);
  const width = parseInt(urlParams.get('width'), 10);
  const height = parseInt(urlParams.get('height'), 10);
  const seed = urlParams.get('seed');
  const model = urlParams.get('model');
  const aspectRatio = getAspectRatio(width, height);

  // Check if request queue length exceeds the threshold
  if (requestQueue.length > MAX_QUEUE_LENGTH) {
    const randomImageUrl = fallbackImageUrls[Math.floor(Math.random() * fallbackImageUrls.length)];
    try {
      const response = await fetch(randomImageUrl);
      const buffer = await response.buffer();
      const base64 = buffer.toString('base64');

      logRequest(imageUrl, 202, aspectRatio, seed, model, Date.now() - startTime); // Log fallback request
      return res.status(202).json({ base64, message: 'Fallback image served due to queue limit exceeded' });
    } catch (error) {
      console.error('Error fetching fallback image:', error);
      logRequest(imageUrl, 500, aspectRatio, seed, model, Date.now() - startTime);
      return res.status(500).json({ error: 'Failed to download fallback image' });
    }
  }

  // If the queue length is within the limit, proceed with the normal image download
  try {
    const response = await fetch(imageUrl);
    const buffer = await response.buffer();
    const base64 = buffer.toString('base64');

    logRequest(imageUrl, response.status, aspectRatio, seed, model, Date.now() - startTime); // Log successful request
    res.json({ base64 });
  } catch (error) {
    console.error('Error fetching image:', error);
    logRequest(imageUrl, 500, aspectRatio, seed, model, Date.now() - startTime); // Log error request
    res.status(500).json({ error: 'Failed to download image' });
  }
});

// Instagram upload route (single image or carousel)
app.post('/instagram-upload', async (req, res) => {
  const { imageUrls, caption } = req.body;

  // Validate request
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    return res.status(400).send('Invalid request: imageUrls must be a non-empty array.');
  }

  // Check if the server is overloaded
  if (activeRequests >= maxRequests) {
    return res.status(429).send('Server is busy, please try again later.');
  }

  // Increment the active requests counter
  activeRequests++;

  try {
    // Handle single image or carousel
    if (imageUrls.length === 1) {
      await postSingleImageToInsta(imageUrls[0], caption || 'A really nice photo from the internet!');
    } else {
      await postCarouselToInsta(imageUrls, caption || 'A really nice carousel from the internet!');
    }

    res.status(200).send('Upload attempt made.');
  } catch (error) {
    console.error('Error uploading to Instagram:', error);
    res.status(500).send('Failed to upload images.');
  } finally {
    // Decrement the active requests counter when the request completes
    activeRequests--;
  }
});

// Upload a single image to Instagram
const postSingleImageToInsta = async (imageUrl, caption) => {
  try {
    // Fetch image as a buffer
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(response.data, 'binary');

    // Upload the single image
    await ig.publish.photo({
      file: imageBuffer,
      caption: caption
    });

    console.log('Single image uploaded successfully with caption!');
  } catch (error) {
    console.error("Error uploading single image", error);
    fs.existsSync(sessionFilePath) && fs.unlinkSync(sessionFilePath); // Delete session file if session is invalid
  }
};

// Upload a carousel of images to Instagram
const postCarouselToInsta = async (imageUrls, caption) => {
  try {
    // Fetch images and store them as buffers
    const imageBuffers = await Promise.all(
      imageUrls.map(url => axios.get(url, { responseType: 'arraybuffer' }).then(res => Buffer.from(res.data, 'binary')))
    );

    // Upload images as a carousel
    await ig.publish.album({
      items: imageBuffers.map(file => ({ file })),
      caption: caption
    });

    console.log('Carousel uploaded successfully with caption!');
  } catch (error) {
    console.error("Error uploading carousel", error);
    fs.existsSync(sessionFilePath) && fs.unlinkSync(sessionFilePath); // Delete session file if session is invalid
  }
};

// Start server and initialize Instagram client
app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  await initializeInstagramClient(); // Initialize Instagram client on server start
});

// Error handling for uncaught exceptions and unhandled promise rejections
process.on('uncaughtException', err => {
  console.error('There was an uncaught exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
