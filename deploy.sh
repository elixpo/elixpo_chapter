#!/bin/bash

# Single-side deployment script for art.elixpo
# This script builds the Docker images and starts the services using Docker Compose

echo "Building Docker images..."
docker-compose build

echo "Starting services..."
docker-compose up -d

echo "Deployment complete. Frontend available at http://localhost:8080, Backend at http://localhost:3005"