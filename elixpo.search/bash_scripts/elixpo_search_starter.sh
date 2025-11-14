cd ~/scratch/elixpo-search-agent/PRODUCTION || { echo "Directory not found"; exit 1; }

echo "Checking if port 5000 is in use and clearing it..."
sudo lsof -ti:5000 | xargs -r sudo kill -9

# Create virtual environment if not exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

echo "Activating virtual environment..."
source venv/bin/activate

echo "Installing Python requirements..."
pip install --upgrade pip
pip install -r requirements.txt

echo "Starting the app on port 5000..."
python3 src/app.py &
