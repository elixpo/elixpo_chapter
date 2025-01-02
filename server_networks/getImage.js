import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { IgApiClient } from 'instagram-private-api';
import { createObjectCsvWriter as createCsvWriter } from 'csv-writer';

const app = express();
const PORT = 3000;
const requestQueue = [];
let endPointRequestQueue = [];
const MAX_QUEUE_LENGTH = 15;
const maxRequests = 20;
let activeRequests = 0;

const defaultWidth = 1024;
const defaultHeight = 576;
const defaultModel = 'flux';
const defaultEnhance = false;
const defaultPrivate = false;

const availableModels = [
  "flux", "flux-realism", "flux-cablyai", "flux-anime",
  "flux-3d", "any-dark", "flux-pro", "turbo"
];


app.use(cors());

// File paths for CSV log and Instagram session
const logFilePath = path.join('/home/pi', 'promptLogger.csv');
const sessionFilePath = './ig_session.json'

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

// NSFW words list
const nsfwWords = ['nsfw', 'explicit', 'nudity', 'violence', 'pornographic', 'nude', 'sexy', 'sex']; // Add more words as needed

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
  'https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/QueueFullImages%2FQueueFullImages%20(1).jpg?alt=media&token=14d3abc9-b5a4-4283-b775-b4313f2b73d4',
  'https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/QueueFullImages%2FQueueFullImages%20(2).jpg?alt=media&token=970ea47d-4404-4210-9d66-c5445dfbb3d3',
  'https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/QueueFullImages%2FQueueFullImages%20(3).jpg?alt=media&token=a6252943-849d-429a-8821-07ac037f034b',
  'https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/QueueFullImages%2FQueueFullImages%20(4).jpg?alt=media&token=1f3a1df6-f18e-4271-b568-dd13b83a6e3e',
  'https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/QueueFullImages%2FQueueFullImages%20(5).jpg?alt=media&token=89b88057-5f9e-452c-b7c4-05eb2d90a2d7'
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
    console.log("session loaded from cache");
  } else {
    await ig.account.login('elixpo_ai', 'PIXIEFY16');
    const session = await ig.state.serializeCookieJar();
    fs.writeFileSync(sessionFilePath, JSON.stringify(session));
    console.log("client has been logged in and session saved");
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

// Function to check for NSFW content
const containsNsfwWords = (text) => {
  return nsfwWords.some(word => text.toLowerCase().includes(word));
};

// Instagram upload route (single image or carousel)
app.post('/instagram-upload', async (req, res) => {
  const { imageUrls, caption } = req.body;

  // Validate request
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    return res.status(400).send('Invalid request: imageUrls must be a non-empty array.');
  }

  // Check for NSFW words in the caption
  if (containsNsfwWords(caption || '')) {
    console.log('NSFW content detected, upload aborted.');
    return res.status(400).send('NSFW content detected. Upload aborted.');
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
      await postSingleImageToInsta(imageUrls[0], caption || 'This is  an ai generate dimage by using the elixpo- ai service, prpompt is unavailable for this image thus deafulting');
    } else {
      await postCarouselToInsta(imageUrls, caption || 'Carousel generated by Elixpo AI, upload status 200 OK');
    }

    res.status(200).send('Upload attempt made.');
  } catch (error) {
    console.error('Error uploading to Instagram:', error);
    res.status(500).send('Failed to upload images.');
  } finally {
    activeRequests--;
  }
});

app.post('/download-image', async (req, res) => {
  const { imageUrl } = req.body;
  const startTime = Date.now(); // Start time to track response time

  // Extract parameters from imageUrl
  const urlParams = new URLSearchParams(imageUrl.split('?')[1]);
  const width = parseInt(urlParams.get('width'), 10);
  const height = parseInt(urlParams.get('heights'), 10);
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


const postSingleImageToInsta = async (imageUrl, caption) => {
  try {
    // Fetch image as a buffer
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(response.data, 'binary');

   
    await ig.publish.photo({
      file: imageBuffer,
      caption: caption
    });

    console.log('Single image uploaded successfully with caption!');
  } catch (error) {
    console.error("Error uploading single image", error);
    
    // Check for login required error
    if (error.message.includes('login_required')) {
      fs.existsSync(sessionFilePath) && fs.unlinkSync(sessionFilePath); 
      console.log("Session expired. Attempting to re-login...");
      await initializeInstagramClient(); 
      await postSingleImageToInsta(imageUrl, caption); 
    }
  }
};


const postCarouselToInsta = async (imageUrls, caption) => {
  try {
    // Fetch images and store them as buffers
    const imageBuffers = await Promise.all(
      imageUrls.map(url => axios.get(url, { responseType: 'arraybuffer' }).then(res => Buffer.from(res.data, 'binary')))
    );

    
    await ig.publish.album({
      items: imageBuffers.map(file => ({ file })),
      caption: caption
    });

    console.log('Carousel uploaded successfully with caption!');
  } catch (error) {
    console.error("Error uploading carousel", error);
    
    
    if (error.message.includes('login_required')) {
      fs.existsSync(sessionFilePath) && fs.unlinkSync(sessionFilePath); 
      console.log("Session expired. Attempting to re-login...");
      await initializeInstagramClient(); 
      await postCarouselToInsta(imageUrls, caption); 
    }
  }
};


function generateRandomSeed() {
  return Math.floor(Math.random() * 1000000);
}


async function processQueue() {
  // If the queue is not empty, process the next request
  if (endPointRequestQueue.length > 0) {
    const { res, prompt, queryParams } = endPointRequestQueue.shift(); // Get the first request in the queue
    
    try {
      // Use provided values or fallback to defaults
      const { 
        width, height, seed, model, enhance, privateMode 
      } = queryParams;
  
      const finalWidth = width ? parseInt(width) : defaultWidth;
      const finalHeight = height ? parseInt(height) : defaultHeight
      const finalSeed = seed || generateRandomSeed();
      const finalModel = model || defaultModel;
      const finalEnhance = enhance !== undefined ? enhance === 'true' : defaultEnhance;
      const finalPrivate = privateMode !== undefined ? privateMode === 'true' : defaultPrivate;
  
      // Construct the URL with query params
      const imageUrl = `https://pollinations.ai/p/${encodeURIComponent(prompt)}?width=${finalWidth}&height=${finalHeight}&seed=${finalSeed}&model=${finalModel}&nologo=1&enhance=${finalEnhance}&private=${finalPrivate}`;
  
      // Fetch the image from the external URL
      const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
  
      // Set the response headers and send the image
      res.set('Content-Type', 'image/png');
      res.send(response.data);
  
    } catch (error) {
      // Handle connection errors gracefully
      if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
        return res.status(503).json({ error: "Connection error, please try again later." });
      }
      res.status(500).json({ error: "Failed to generate image" });
    }

    // Continue processing the next request after the current one is done
    processQueue();
  }
}


app.get('/c/:prompt', async (req, res) => {
  try {
    const prompt = req.params.prompt;

    // Check if prompt is missing or empty string
    if (!prompt || prompt.trim() === '') {
      return res.status(400).json({ error: "Prompt is required" });
    }

    // Retrieve query parameters or use default values
    const { 
      width, height, seed, model, enhance, privateMode 
    } = req.query;

    // Add the request to the queue
    endPointRequestQueue.push({ res, prompt, queryParams: req.query });

    // If the queue is empty, start processing the first request
    if (endPointRequestQueue.length === 1) {
      processQueue();
    }

    // Instead of responding with a "pending" message, directly process the image

  } catch (error) {
    res.status(500).json({ error: "Failed to process your request" });
  }
});

// Endpoint to list available models
app.get('/models', (req, res) => {
  res.json(availableModels);
});


app.post('/ping', (req, res) => {
  res.send('OK');
});




app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  await initializeInstagramClient(); 
});


process.on('uncaughtException', err => {
  console.error('There was an uncaught exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});


