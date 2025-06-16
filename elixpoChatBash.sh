#!/bin/bash

PORT=40012

echo "[elixpo] Killing processes on port $PORT..."
fuser -k ${PORT}/tcp || true

echo "[elixpo] Starting npm server..."
cd /root/elixpoChat || exit 1
npm start
