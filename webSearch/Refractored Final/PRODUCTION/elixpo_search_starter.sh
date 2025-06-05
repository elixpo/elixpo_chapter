#!/bin/bash

# Navigate to the project directory
cd ~/elixpo-search-agent/PRODUCTION || { echo "Directory not found"; exit 1; }


# Clear port 5000 if in use
echo "Checking if port 5000 is in use and clearing it..."
sudo lsof -ti:5000 | xargs -r sudo kill -9

# Create virtual environment if not exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Upgrade pip and install dependencies
echo "Installing Python requirements..."
pip install --upgrade pip
pip install -r requirements.txt

# Start the app with Waitress
echo "Starting the app on port 5000..."
waitress-serve --host=0.0.0.0 --port=5000 ai_search_agent_prod:app > access.log 2> error.log
