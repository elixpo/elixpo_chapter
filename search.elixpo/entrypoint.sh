#!/bin/bash
set -e

echo "[ENTRYPOINT] Starting ElixpoSearch services..."

# Start IPC Service in background
echo "[ENTRYPOINT] Starting IPC Service..."
python3 -m api.ipcService.main &
IPC_PID=$!
echo "[ENTRYPOINT] IPC Service started with PID $IPC_PID"

# Wait for IPC Service to be ready (port 5010)
echo "[ENTRYPOINT] Waiting for IPC Service to be ready on port 5010..."
max_attempts=30
attempt=0
while ! nc -z localhost 5010 2>/dev/null; do
    attempt=$((attempt + 1))
    if [ $attempt -ge $max_attempts ]; then
        echo "[ENTRYPOINT] IPC Service failed to start within timeout"
        kill $IPC_PID 2>/dev/null || true
        exit 1
    fi
    echo "[ENTRYPOINT] Waiting for IPC Service... (attempt $attempt/$max_attempts)"
    sleep 1
done
echo "[ENTRYPOINT] IPC Service is ready!"

# Start Flask App in foreground
echo "[ENTRYPOINT] Starting Flask App..."
exec python3 api/app.py