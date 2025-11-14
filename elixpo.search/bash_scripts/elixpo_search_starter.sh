cd ~/elixpo-search-agent/api || { echo "Directory not found"; exit 1; }

echo "Checking if port 5000 is in use and clearing it..."
sudo lsof -ti:5000 | xargs -r sudo kill -9

echo "Checking if port 5002 is in use and clearing it..."
sudo lsof -ti:5002 | xargs -r sudo kill -9

# # Create virtual environment if not exists
# if [ ! -d "venv" ]; then
#     echo "Creating virtual environment..."
#     python3 -m venv venv
# fi

# echo "Activating virtual environment..."
# source venv/bin/activate

# echo "Installing Python requirements..."
# pip install --upgrade pip
# pip install -r ../requirements.txt

echo "Starting model server on port 5002..."
python3 model_server.py &
MODEL_PID=$!

echo "Waiting for model server to initialize..."
sleep 3

echo "Starting the app on port 5000..."
python3 app.py &
APP_PID=$!

echo "Model server (PID: $MODEL_PID) and App (PID: $APP_PID) started"
echo "To stop: kill $MODEL_PID $APP_PID"

# Keep script running
wait
