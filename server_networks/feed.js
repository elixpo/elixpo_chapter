import express from 'express';
import axios from 'axios';
import { EventSource } from 'eventsource';

const app = express();
const PORT = 4000;

// Maintain a list of connected feedClients
let feedClients = [];

// Establish an SSE connection to the upstream feed
const upstreamFeed = new EventSource('https://image.pollinations.ai/feed');

// Handle events from the upstream feed
upstreamFeed.onmessage = (event) => {
  // Broadcast the event to all connected feedClients
  feedClients.forEach((client) => client.res.write(`data: ${event.data}\n\n`));
};

upstreamFeed.onerror = (err) => {
  console.error('Error with upstream feed:', err);
};

// Function to extract the client's public IP address
function getClientIp(req) {
  return req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
}

// Endpoint to serve SSE feed to feedClients
app.get('/feed', (req, res) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Keep the connection open
  res.flushHeaders();

  // Get the client's public IP address
  const clientIp = getClientIp(req);

  // Use the IP address as the client ID
  const clientId = clientIp;

  // Add the client to the list
  feedClients.push({ id: clientId, res });

  console.log(`Client connected: ${clientId}. Total feedClients: ${feedClients.length}`);

  // Remove the client when the connection is closed
  req.on('close', () => {
    feedClients = feedClients.filter((client) => client.id !== clientId);
    console.log(`Client disconnected: ${clientId}. Total feedClients: ${feedClients.length}`);
  });
});

// Start the server
app.listen(PORT, '10.42.0.57', async () => {
  console.log(`Server running on port ${PORT}`);
});
