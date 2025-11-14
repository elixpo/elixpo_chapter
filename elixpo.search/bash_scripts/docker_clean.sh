#!/bin/bash
set -e

echo "⚡ Cleaning up Docker to free space..."

# Stop all containers
docker stop $(docker ps -aq) 2>/dev/null || true

# Remove all containers
docker rm $(docker ps -aq) 2>/dev/null || true

# Remove dangling images
docker rmi $(docker images -f "dangling=true" -q) 2>/dev/null || true

# Remove all unused images
docker image prune -af

# Remove all unused volumes
docker volume prune -f

# Remove all unused networks
docker network prune -f

# Remove all build cache
docker builder prune -af

minikube delete --all --purge

docker system prune -a --volumes --force


echo "✅ Cleanup complete. Current disk usage:"
docker system df
