import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';

const app = express();
const PORT = 3001;
const requestQueue = [];
const MAX_QUEUE_LENGTH = 15;

// List of fallback image URLs
const fallbackImageUrls = [
  'https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/QueueFullImages%2FQueueFullImages%20(1).jpg?alt=media&token=14d3abc9-b5a4-4283-b775-b4313f2b73d4',
  'https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/QueueFullImages%2FQueueFullImages%20(2).jpg?alt=media&token=970ea47d-4404-4210-9d66-c5445dfbb3d3',
  'https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/QueueFullImages%2FQueueFullImages%20(3).jpg?alt=media&token=a6252943-849d-429a-8821-07ac037f034b',
  'https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/QueueFullImages%2FQueueFullImages%20(4).jpg?alt=media&token=1f3a1df6-f18e-4271-b568-dd13b83a6e3e',
  'https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/QueueFullImages%2FQueueFullImages%20(5).jpg?alt=media&token=89b88057-5f9e-452c-b7c4-05eb2d90a2d7'
  // Add more URLs as needed
];

app.use(cors());
app.use(express.json());

// Middleware to track request queue length
app.use((req, res, next) => {
  requestQueue.push(req);
  console.log('Request queue length:', requestQueue.length);
  res.on('finish', () => {
    requestQueue.shift();
  });
  next();
});

app.post('/download-image', async (req, res) => {
  const { imageUrl } = req.body;

  // Check if request queue length exceeds the threshold
  if (requestQueue.length > MAX_QUEUE_LENGTH) {
    console.log('Queue exceeded the limit. Returning a random predefined image.');

    // Select a random fallback image URL
    const randomImageUrl = fallbackImageUrls[Math.floor(Math.random() * fallbackImageUrls.length)];

    try {
      // Fetch the random fallback image
      const response = await fetch(randomImageUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const buffer = await response.buffer();
      const base64 = buffer.toString('base64');

      // Send predefined image but with a NOT OK status (e.g., 202 Accepted)
      return res.status(202).json({ base64, message: 'Fallback image served due to queue limit exceeded' });
    } catch (error) {
      console.error('Error fetching fallback image:', error);
      return res.status(500).json({ error: 'Failed to download fallback image' });
    }
  }

  try {
    // Fetch the requested image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const buffer = await response.buffer();
    const base64 = buffer.toString('base64');

    res.json({ base64 });
  } catch (error) {
    console.error('Error fetching image:', error);
    res.status(500).json({ error: 'Failed to download image' });
  }
});

app.post('/ping', (req, res) => {
  if (req.body.message === 'heartbeat') {
    console.log('Heartbeat received');
    res.send('OK'); // Acknowledge the heartbeat
  } else {
    res.status(400).send('Invalid request');
  }
});

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
