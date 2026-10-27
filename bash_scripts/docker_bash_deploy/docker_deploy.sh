if [ "$(lsof -ti:5000 | wc -l)" -gt 1 ]; then
    lsof -ti:5000 | xargs kill -9
fi

docker system prune -a -f
docker compose down
docker compose build --no-cache
docker compose up -d --build