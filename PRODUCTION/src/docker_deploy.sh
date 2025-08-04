docker system prune -a -f && \
docker compose down && \
docker compose build --no-cache && \
docker compose up -d --build 