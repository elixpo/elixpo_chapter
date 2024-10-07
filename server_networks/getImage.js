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
let activeRequests = 0;
const maxRequests = 20;

// File path for CSV log in home directory of pi
const logFilePath = path.join('/home/pi', 'promptLogger.csv');
const sessionFilePath = './ig_session.json';

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
  if (!b) {
    return a;
  }
  return gcd(b, a % b);
}

// Function to calculate the aspect ratio
function getAspectRatio(width, height) {
  if (!width || !height) return 'Unknown';

  const divisor = gcd(width, height);
  const aspectWidth = width / divisor;
  const aspectHeight = height / divisor;

  return `${aspectWidth}:${aspectHeight}`;
}

// List of fallback image URLs
const fallbackImageUrls = [
  'https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/QueueFullImages%2FQueueFullImages%20(1).jpg?alt=media&token=14d3abc9-b5a4-4283-b775-b4313f2b73d4',
  'https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/QueueFullImages%2FQueueFullImages%20(2).jpg?alt=media&token=970ea47d-4404-4210-9d66-c5445dfbb3d3',
  'https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/QueueFullImages%2FQueueFullImages%20(3).jpg?alt=media&token=a6252943-849d-429a-8821-07ac037f034b',
  'https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/QueueFullImages%2FQueueFullImages%20(4).jpg?alt=media&token=1f3a1df6-f18e-4271-b568-dd13b83a6e3e',
  'https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/QueueFullImages%2FQueueFullImages%20(5).jpg?alt=media&token=89b88057-5f9e-452c-b7c4-05eb2d90a2d7',
];

app.use(cors());
app.use(express.json());

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

app.post('/instagram-upload', async (req, res) => {
  const { imageUrls, caption } = req.body;

  // Validate request
  if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      return res.status(400).send('Invalid request: imageUrls must be a non-empty array.');
  }

  // Check if the server is overloaded
  if (activeRequests >= maxRequests) {
      return res.status(429).send('Server is busy, please try again later.');
  }

  // Increment the active requests counter
  activeRequests++;

  try {
      // Call the postCarouselToInsta function to process the images
      await postCarouselToInsta(imageUrls, caption || 'A really nice photo from the internet!');

      // Send a success response
      res.status(200).send('Upload attempt made.');
  } catch (error) {
      // Handle errors (e.g., from Instagram API)
      console.error('Error uploading to Instagram:', error);
      res.status(500).send('Failed to upload images.');
  } finally {
      // Decrement the active requests counter when the request completes
      activeRequests--;
  }
});

// Ping route to handle heartbeat requests
app.post('/ping', (req, res) => {
  if (req.body.message === 'heartbeat') {
    console.log('Heartbeat received');
    res.send('OK');
  } else {
    res.status(400).send('Invalid request');
  }
});

// Function to log request details into the CSV file
function logRequest(imageUrl, status, aspectRatio, seed, model, responseTime) {
  const date = new Date().toISOString();

  const record = {
    date,
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
    .catch((err) => console.error('Error writing to CSV log:', err));
}

const postCarouselToInsta = async (imageUrls, caption) => {
  try {
    const ig = new IgApiClient();
    ig.state.generateDevice('elixpo_ai');  // Generate device based on username

    // Load session if exists, otherwise login
    if (fs.existsSync(sessionFilePath)) {
      // Load session data (cookies) from file
      const savedSession = JSON.parse(fs.readFileSync(sessionFilePath, 'utf-8'));
      await ig.state.deserializeCookieJar(savedSession);
    } else {
      // Login and save session if not cached
      await ig.account.login('elixpo_ai', 'PIXIEFY16');
      const session = await ig.state.serializeCookieJar();  // Save session after login
      fs.writeFileSync(sessionFilePath, JSON.stringify(session));
    }

    // Fetch images using axios and store them as buffers
    const imageBuffers = await Promise.all(
      imageUrls.map(async (url) => {
        const response = await axios({
          url,
          method: 'GET',
          responseType: 'arraybuffer',
        });
        return Buffer.from(response.data, 'binary');
      })
    );

    // Upload both images as a carousel (album)
    await ig.publish.album({
      items: imageBuffers.map((file) => ({
        file,
      })),
      caption: caption,
    });

    console.log('Carousel uploaded successfully with caption!');
  } catch (error) {
    // Skip the error without any error logging
    if (fs.existsSync(sessionFilePath)) {
      fs.unlinkSync(sessionFilePath);  // Delete the session file if the session is invalid
    }
  }
};



// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Error handling for uncaught exceptions and unhandled rejections
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
