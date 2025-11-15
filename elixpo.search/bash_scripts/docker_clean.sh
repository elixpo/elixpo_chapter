set -e
echo "⚡ Cleaning up Docker to free space..."
docker stop $(docker ps -aq) 2>/dev/null || true
docker rm $(docker ps -aq) 2>/dev/null || true
docker rmi $(docker images -f "dangling=true" -q) 2>/dev/null || true
docker image prune -af
docker volume prune -f
docker network prune -f
docker builder prune -af

minikube delete --all --purge

docker system prune -a --volumes --force


echo "cleanup complete. Current disk usage:"
docker system df
