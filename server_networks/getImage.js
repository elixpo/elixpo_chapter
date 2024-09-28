import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';



const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

app.post('/download-image', async (req, res) => {
  const { imageUrl } = req.body;

  try {
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



