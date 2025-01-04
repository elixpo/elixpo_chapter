import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { IgApiClient } from 'instagram-private-api';
import { createObjectCsvWriter as createCsvWriter } from 'csv-writer';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc } from "firebase/firestore";
import { getDatabase, ref, push, remove, set } from "firebase/database";
import { v4 as uuidv4 } from "uuid";
import {rateLimit} from 'express-rate-limit';
import { EventSource } from 'eventsource';


const firebaseConfig = {
  apiKey: "AIzaSyAlwbv2cZbPOr6v3r6z-rtch-mhZe0wycM",
  authDomain: "elixpoai.firebaseapp.com",
  databaseURL: "https://elixpoai-default-rtdb.firebaseio.com",
  projectId: "elixpoai",
  storageBucket: "elixpoai.appspot.com",
  messagingSenderId: "718153866206",
  appId: "1:718153866206:web:671c00aba47368b19cdb4f"
};

const FBapp = initializeApp(firebaseConfig);          
const db = getFirestore(FBapp);
const dbRef = getDatabase(FBapp);

const app = express();
const PORT = 3000;
const requestQueue = [];
let endPointRequestQueue = [];
let feedClients = [];
const MAX_QUEUE_LENGTH = 15;
const maxRequests = 20;
let activeRequests = 0;

const defaultWidth = 1024;
const defaultHeight = 576;
const defaultModel = 'flux';
const defaultEnhance = false;
const defaultPrivate = false;

const MAX_CONCURRENT_REQUESTS = 4;
let activeQueueWorkers = 0;
let activeRequestWorkers = 0;


const upstreamFeed = new EventSource('https://image.pollinations.ai/feed');
const logFilePath = path.join('/home/pi', 'promptLogger.csv');
const sessionFilePath = './ig_session.json'


const availableModels = [
  "flux", "flux-realism", "flux-cablyai", "flux-anime",
  "flux-3d", "any-dark", "flux-pro", "turbo"
];

const availableThemes = 
[
  "fanatsy", "halloween", "structure", "crayon",
  "space", "chromatic", "anime", "cyberpunk",
  "landscape", "samurai", "wpap", "vintage",
  "pixel", "normal", "synthwave", "special",
]

const availableRatios = 
[
  "16:9", "4:3", 
  "1:1", "9:16", 
  "3:2"
]



app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    next();
});


app.use((req, res, next) => {
  requestQueue.push(req);
  console.log('Request added to queue:', req.originalUrl);

  if (activeRequestWorkers < MAX_CONCURRENT_REQUESTS) {
    processRequestQueue(); // Trigger processing
  }

  res.on('finish', () => {
    // Optional: Remove request from queue if no longer needed
  });

  next();
});


const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 3, // Limit each IP to 3 requests per `windowMs`
  message: {
    error: "Too many requests, please try again after a minute.",
  },
  keyGenerator: (req) => req.ip, // Use IP address as the key
});



async function processRequestQueue() {
  while (activeRequestWorkers < MAX_CONCURRENT_REQUESTS && requestQueue.length > 0) {
    const req = requestQueue.shift(); 
    activeRequestWorkers++;

    (async () => {
      try {
        console.log("Processing request:", req.originalUrl);
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error("Error processing request:", error);
      } finally {
        activeRequestWorkers--;
        processRequestQueue(); 
      }
    })();
  }
}




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



async function storeRequestDetails(userDetails, prompt, specifications) {
  try {
    const docId = `${Date.now()}-${uuidv4()}`; // Use timestamp + UUID for unique IDs
    const data = 
    {
      ip: userDetails.ip,
      userAgent: userDetails.userAgent || "Unknown",
      referrer: userDetails.referrer || "Direct",
      timestamp: userDetails.timestamp,
      method: userDetails.method || "GET" ,
      url: userDetails.url || "/",
      prompt: prompt,
      createdAt: new Date().toISOString(),
      fullPrompt: prompt,
      specifications: specifications
    }

    const requestsRef = ref(dbRef, "requests");
    await push(requestsRef, data);
    console.log("Request details stored successfully:", docId);
  } catch (error) {
    console.error("Error storing request details:", error);
  }
}



async function processQueue() {
  while (activeQueueWorkers < MAX_CONCURRENT_REQUESTS && endPointRequestQueue.length > 0) {
    const { res, prompt, queryParams, req } = endPointRequestQueue.shift(); // Remove the request from the queue
    activeQueueWorkers++;

    (async () => {
      try {
        const { 
          width, height, seed, model, enhance, personal 
        } = queryParams;

        const finalWidth = width ? parseInt(width) : defaultWidth;
        const finalHeight = height ? parseInt(height) : defaultHeight;
        const finalSeed = seed || generateRandomSeed();
        const finalModel = model || defaultModel;
        const finalEnhance = enhance !== undefined ? enhance === 'true' : defaultEnhance;
        const finalPrivate = personal !== undefined ? personal === 'true' : defaultPrivate;

        const imageUrl = `https://pollinations.ai/p/${encodeURIComponent(prompt)}?width=${finalWidth}&height=${finalHeight}&seed=${finalSeed}&model=${finalModel}&nologo=1&enhance=${finalEnhance}&private=${finalPrivate}`;
        // const imageUrl = "https://m.media-amazon.com/images/I/61Rx9tHudUL.jpg"

        let specifications = { width: finalWidth, height: finalHeight, seed: finalSeed, model: finalModel, enhance: finalEnhance, privateMode: finalPrivate };
        let userDetails = { 
          ip: (await axios.get('https://api.ipify.org?format=json')).data.ip,
          userAgent: req.get('User-Agent'), 
          referrer: req.get('Referrer'), 
          timestamp: new Date().toISOString(),
          method: req.method,
          url: req.originalUrl
        };
        let fullPrompt = imageUrl

        storeRequestDetails(userDetails, fullPrompt, specifications);

        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        res.set('Content-Type', 'image/png');
        res.send(response.data);
        console.log(response.data)

      } catch (error) {
        if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
          res.status(503).json({ error: "Connection error, please try again later." });
        } else {
          res.status(500).json({ error: "Failed to generate image" });
        }
        if (error.response && error.response.status === 504) {
          res.status(504).json({ error: "Sorry the server is offline" });
        } else 
        console.log(error)
      } finally {
        activeQueueWorkers--;
        processQueue(); // Trigger the next task
      }
    })();
  }
}




app.get('/c/:prompt', limiter, async (req, res) => {
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
    endPointRequestQueue.push({ res, prompt, queryParams: req.query, req });

    // If the queue is empty, start processing the first request
    if (endPointRequestQueue.length === 1) {
      processQueue();
    }

    // Instead of responding with a "pending" message, directly process the image

  } catch (error) {
    res.status(500).json({ error: "Failed to process your request" });
  }
});

upstreamFeed.onmessage = (event) => {
  let parsedData = JSON.parse(event.data);

  // Only proceed if nologo is true
  if (parsedData.nologo) {
    const filteredData = {
      width: parsedData.width,
      height: parsedData.height,
      seed: parsedData.seed,
      model: parsedData.model,
      enhance: parsedData.enhance,
      nologo: parsedData.nologo,
      negative_prompt: parsedData.negative_prompt,
      nofeed: parsedData.nofeed,
      safe: parsedData.safe,
      prompt: parsedData.prompt,
      ip: parsedData.ip,
      status: parsedData.status,
      concurrentRequests: parsedData.concurrentRequests,
      timingInfo: parsedData.timingInfo,
    };

    // Broadcast the filtered data to all clients
    feedClients.forEach((client) => client.res.write(`data: ${JSON.stringify(filteredData)}\n\n`));
  }
};


upstreamFeed.onerror = (err) => {
  console.error('Error with upstream feed', err);
};



app.get('/feed', async (req, res) => {
  let publicIp = "";

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Keep the connection open
  res.flushHeaders();

  // Fetch public IP of the client
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    
    // Split the IP by dots and join with hyphens
    publicIp = data.ip.split('.').join('-');
    
    console.log(`Client public IP: ${publicIp}`);
  } catch (error) {
    console.error('Error fetching public IP:', error);
    
    // Fallback to request IP if the fetch fails
    publicIp = req.ip.split('.').join('-');
  }

  const clientId = publicIp;
  feedClients.push({ id: clientId, res });

  try {
    const db = getDatabase(); // Ensure you have the correct db reference
    const clientRef = ref(db, `feedClients/${publicIp}`);
    await set(clientRef, true); // Store the IP in Firebase
    console.log(`Client connected: ${clientId}. Total feedClients: ${feedClients.length}`);
  } catch (error) {
    console.error("Error storing client IP in Firebase:", error);
  }

  // When the request is closed (client disconnects)
  req.on('close', async () => {
    feedClients = feedClients.filter((client) => client.id !== clientId);
    console.log(`Client disconnected: ${clientId}. Total feedClients: ${feedClients.length}`);
    
    try {
      const db = getDatabase(); // Ensure correct db reference
      const clientRef = ref(db, `feedClients/${publicIp}`);
      await remove(clientRef); // Remove the client IP from Firebase
    } catch (error) {
      console.log("Error removing client from feedClients:", error);
    }
  });
});


app.get('/models', (req, res) => {
  res.json(availableModels);
});

app.get('/themes', (req, res) => {
  res.json(availableThemes);
}); 

app.get('/ratios', (req, res) => {
  res.json(availableRatios);
});

app.post('/ping', (req, res) => {
  res.send('OK');
});

app.get('/', (req, res) => {
	res.send('Visit https://circuit-overtime.github.io/Elixpo_ai_pollinations/ for a better experience');
});


app.listen(PORT, '10.42.0.1', async () => {
  console.log(`Server running on http://10.42.0.1:${PORT}`);
  // await initializeInstagramClient(); 
});


process.on('uncaughtException', err => {
  console.error('There was an uncaught exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});


