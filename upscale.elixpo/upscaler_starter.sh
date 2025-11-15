

echo "Starting ESRGAN model servers..."
cd ~/upscale.pollinations
cleanup() {
    echo "Stopping all servers..."
    pkill -f "python api/model_server.py"
    pkill -f "python api/app.py"
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

for port in {6002..6006}; do
    echo "Starting model server on port $port"
    python api/model_server.py $port &
    sleep 2  
done

echo "All model servers started. Waiting for them to initialize..."
sleep 10

mkdir -p uploads

echo "Starting Quart application with background cleanup..."
python api/app.py

wait