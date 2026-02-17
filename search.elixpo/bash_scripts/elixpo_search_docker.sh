#!/bin/bash

echo "Stopping and removing old container (if any)..."
sudo docker rm -f elixpo-search-proxy 2>/dev/null

echo "Building Docker image..."
sudo docker build -t production-elixpo-search .

echo "Running Docker container..."
sudo docker run -d --name elixpo-search-proxy -p 5000:5000 production-elixpo-search

echo "Done. App should be running on port 5000."
