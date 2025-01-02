import express from 'express';
import axios from 'axios';
const app = express();
const port = 4004;
const ipAddress = '10.42.0.56';

// Default values
const defaultWidth = 1024;
const defaultHeight = 576;
const defaultModel = 'flux';
const defaultEnhance = false;
const defaultPrivate = false;

// List of available models
const availableModels = [
  "flux", "flux-realism", "flux-cablyai", "flux-anime",
  "flux-3d", "any-dark", "flux-pro", "turbo"
];

// In-memory queue to store requests
let endPointRequestQueue = [];

// Helper function to get a random seed
function generateRandomSeed() {
  return Math.floor(Math.random() * 1000000);
}

// Function to process the queue
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

// Endpoint to list available models
app.get('/models', (req, res) => {
    res.json(availableModels);
  });
  
// Endpoint to handle the image requests
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

// Start the server
app.listen(port, ipAddress, () => {
  console.log(`Server running at http://${ipAddress}:${port}`);
});
