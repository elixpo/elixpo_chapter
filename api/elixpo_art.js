import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import { initializeApp } from "firebase/app";
import { getFirestore} from "firebase/firestore";
import { getDatabase, ref, push } from "firebase/database";
import {rateLimit} from 'express-rate-limit';
import generateImageWorker from './generateImage.js';
import promptEnhance from './enhancer.js';
import fs from 'fs';
import multer from 'multer'; 
import FormData from 'form-data'; 
import dotenv from 'dotenv'

dotenv.config();

const firebaseConfig = {
    apiKey: process.env.db_api,
    authDomain: "elixpoai.firebaseapp.com",
    databaseURL: "https://elixpoai-default-rtdb.firebaseio.com",
    projectId: "elixpoai",
    storageBucket: "elixpoai.appspot.com",
    messagingSenderId: process.env.db_messaging_id,
    appId: process.env.db_app_id
  };

const FBapp = initializeApp(firebaseConfig);
const db = getFirestore(FBapp);
const dbRef = getDatabase(FBapp);
const app = express();
const PORT = 3005;
const requestQueue = [];
let endPointImageRequestQueue = [];
const MAX_QUEUE_LENGTH = 15;
const MAX_CONCURRENT_REQUESTS = 100; 
let activeImageWorkers = 0;
const imageGenerationQueue = [];


app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    console.log('Request added to queue:', req.originalUrl);
    console.log('Request queue length:', requestQueue.length);
    next();
});

app.use(cors());
app.use(express.json());

const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, 
    max: 10, 
    message: {
      error: "Too many requests, please try again after a minute.",
    },
    keyGenerator: (req) => req.ip, 
});

app.use(limiter);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, '/tmp');
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

app.post('/firebase-write', async (req, res) => {
  const { collection, doc: docName, data } = req.body;
  if (!collection || !docName || !data) {
    return res.status(400).json({ error: 'Missing collection, doc, or data in request body.' });
  }
  try {
    const { doc, setDoc, collection: fbCollection } = await import('firebase/firestore');
    const colRef = fbCollection(db, collection);
    await setDoc(doc(colRef, docName), data);
    res.json({ success: true, id: docName });
  } catch (err) {
    res.status(500).json({ error: 'Failed to write to Firebase: ' + err.message });
  }
});

app.post('/db-write', async (req, res) => {
  const { path: dbPath, value } = req.body;
  if (!dbPath || typeof value !== 'object') {
    return res.status(400).json({ error: 'Missing path or value in request body.' });
  }
  try {
    const nodeRef = ref(dbRef, dbPath);
    await push(nodeRef, value); 
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to write to Realtime Database: ' + err.message });
  }
});

app.post('/db-read', async (req, res) => {
  const { path: dbPath } = req.body;
  console.log("Reading from path:", dbPath);
  if (!dbPath) {
    return res.status(400).json({ error: 'Missing path in request body.' });
  }
  try {
    const { get } = await import('firebase/database');
    const nodeRef = ref(dbRef, dbPath);
    const snapshot = await get(nodeRef);
    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'Path not found.' });
    }
    const data = snapshot.val();
    res.json({ value: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read from Realtime Database: ' + err.message });
  }
});

app.post('/firebase-read', async (req, res) => {
  const { collection, doc: docName, field } = req.body;
  if (!collection || !docName || !field) {
    return res.status(400).json({ error: 'Missing collection, doc, or field in request body.' });
  }
  try {
    const { doc, getDoc, collection: fbCollection } = await import('firebase/firestore');
    const colRef = fbCollection(db, collection);
    const docRef = doc(colRef, docName);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      return res.status(404).json({ error: 'Document not found.' });
    }
    const data = docSnap.data();
    if (!(field in data)) {
      return res.status(404).json({ error: `Field '${field}' not found in document.` });
    }
    res.json({ value: data[field] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read from Firebase: ' + err.message });
  }
});

app.post('/upload-to-uguu', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded or file processing failed' });
  }

  const filePath = req.file.path;
  const originalName = req.file.originalname;

  try {
    if (!fs.existsSync(filePath)) {
      return res.status(500).json({ error: 'Temporary file not found after upload' });
    }

    const form = new FormData();
    form.append('files[]', fs.createReadStream(filePath), originalName);

    const uguuResponse = await fetch('https://uguu.se/upload.php', {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });

    if (!uguuResponse.ok) {
      const errorText = await uguuResponse.text();
      throw new Error(`Uguu API error: ${uguuResponse.status} - ${errorText.substring(0, 200)}...`);
    }

    const data = await uguuResponse.json();

    if (data.files && data.files.length > 0 && data.files[0].url) {
      res.json({ url: data.files[0].url });
    } else {
      res.status(500).json({ error: 'Upload succeeded but no valid URL returned from Uguu' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to upload file to Uguu' + (err.message ? `: ${err.message}` : '') });
  } finally {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr) console.error('Error deleting temporary file:', unlinkErr);
      });
    }
  }
});


app.post('/enhance', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ 
      error: 'Prompt is required and must be a string' 
    });
  }

  if (prompt.length > 2000) {
    return res.status(400).json({ 
      error: 'Prompt is too long. Maximum 2000 characters allowed.' 
    });
  }

  try {
    console.log(`Enhancing prompt: "${prompt.substring(0, 100)}..."`);
    
    const startTime = Date.now();
    const enhancedPrompt = await promptEnhance(prompt);
    const processingTime = Date.now() - startTime;
    
    if (!enhancedPrompt || enhancedPrompt.trim() === '') {
      throw new Error('Enhancement failed - empty response');
    }

    console.log(`Prompt enhanced successfully in ${processingTime}ms`);
    
    res.json({
      success: true,
      original: prompt,
      enhanced: enhancedPrompt.trim(),
      processingTime: processingTime
    });

  } catch (error) {
    console.error('Prompt enhancement error:', error);
    
    res.status(500).json({
      error: 'Failed to enhance prompt',
      message: error.message,
      fallback: prompt 
    });
  }
});


app.post('/generate-image', async (req, res) => {
  const { 
    prompt, 
    width, 
    height, 
    model, 
    seed, 
    imageMode, 
    uploadedUrl, 
    privateMode 
  } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }
  const requestId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  const imageRequest = {
    id: requestId,
    prompt,
    width: width || 1024,
    height: height || 576,
    model: model || 'flux',
    seed: seed || Math.floor(Math.random() * 10000),
    imageMode: imageMode || false,
    uploadedUrl: uploadedUrl || null,
    privateMode: privateMode || false,
    res,
    timestamp: Date.now()
  };
  if (imageGenerationQueue.length >= MAX_QUEUE_LENGTH) {
    return res.status(429).json({ 
      error: 'Queue is full. Please try again later.',
      queueLength: imageGenerationQueue.length 
    });
  }
  imageGenerationQueue.push(imageRequest);
  console.log(`Added request ${requestId} to queue. Queue length: ${imageGenerationQueue.length}`);
  processImageQueue();
});

async function processImageQueue() {
  if (activeImageWorkers >= MAX_CONCURRENT_REQUESTS || imageGenerationQueue.length === 0) {
    return;
  }

  const request = imageGenerationQueue.shift();
  if (!request) return;

  activeImageWorkers++;
  console.log(`Processing request ${request.id}. Active workers: ${activeImageWorkers}`);

  try {
    const result = await generateImageWorker(request);
    
    // Convert blob to base64 for transmission
    const buffer = Buffer.from(await result.blob.arrayBuffer());
    const base64Image = buffer.toString('base64');
    
    request.res.json({
      success: true,
      imageData: `data:image/png;base64,${base64Image}`,
      actualImageUrl: result.originalUrl, 
      requestId: request.id,
      generationTime: Date.now() - request.timestamp
    });
  } catch (error) {
    console.error(`Error processing request ${request.id}:`, error);
    request.res.status(500).json({
      error: 'Image generation failed',
      message: error.message,
      requestId: request.id
    });
  } finally {
    activeImageWorkers--;
    console.log(`Completed request ${request.id}. Active workers: ${activeImageWorkers}`);
    
    // Process next item in queue
    if (imageGenerationQueue.length > 0) {
      setImmediate(processImageQueue);
    }
  }
}

app.post('/generate-batch', async (req, res) => {
  const { requests } = req.body;
  
  if (!Array.isArray(requests) || requests.length === 0) {
    return res.status(400).json({ error: 'Requests array is required' });
  }
  
  if (requests.length > 10) {
    return res.status(400).json({ error: 'Maximum 10 images per batch' });
  }
  
  const batchId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  
  try {
    const promises = requests.map(async (req, index) => {
      const requestId = `${batchId}-${index}`;
      const imageRequest = {
        id: requestId,
        ...req,
        timestamp: Date.now()
      };
      
      try {
        const result = await generateImageWorker(imageRequest);
        const buffer = Buffer.from(await result.blob.arrayBuffer());
        const base64Image = buffer.toString('base64');
        
        return {
          success: true,
          index,
          imageData: `data:image/png;base64,${base64Image}`,
          actualImageUrl: result.originalUrl, // Fixed: use result.originalUrl
          generationTime: Date.now() - imageRequest.timestamp
        };
      } catch (error) {
        return {
          success: false,
          index,
          error: error.message
        };
      }
    });
    
    const batchResults = await Promise.all(promises);
    
    res.json({
      success: true,
      batchId,
      results: batchResults
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Batch generation failed',
      message: error.message,
      batchId
    });
  }
});

app.post('/ping', (req, res) => {
    res.send('OK');
});

app.get('/', (req, res) => {
    res.send('Visit https://elixpoart.vercel.app for a better experience');
});

app.get('/queue-status', (req, res) => {
    res.json({
        imageQueueLength: imageGenerationQueue.length, // Fixed variable name
        activeImageWorkers: activeImageWorkers, // Fixed variable name
        requestQueueLength: requestQueue.length,
        maxImageQueueLength: MAX_QUEUE_LENGTH,
        maxConcurrentWorkers: MAX_CONCURRENT_REQUESTS
    });
});

app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
});

process.on('uncaughtException', err => {
    console.error('There was an uncaught exception:', err);
    const errorData = {
        type: 'uncaughtException',
        message: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString()
    };
    const errorsRef = ref(dbRef, "serverErrors");
    push(errorsRef, errorData)
    .then(() => {
        console.log("Uncaught exception logged to Firebase. Exiting.");
        process.exit(1); 
    })
    .catch((firebaseError) => {
        console.error("Failed to log uncaught exception to Firebase:", firebaseError);
        process.exit(1); 
    });
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    const errorData = {
        type: 'unhandledRejection',
        message: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : 'N/A',
        promise: promise,
        timestamp: new Date().toISOString()
    };
    const errorsRef = ref(dbRef, "serverErrors");
    push(errorsRef, errorData)
    .then(() => {
        console.log("Unhandled rejection logged to Firebase.");
    })
    .catch((firebaseError) => {
        console.error("Failed to log unhandled rejection to Firebase:", firebaseError);
    });
});