#!/bin/bash

# Start the Node.js servers in the background
node /home/pi/Desktop/elixpo.ai/server_networks/getImage.js &
echo "image.js is running in the background with PID $!"

node /home/pi/Desktop/elixpo.ai/server_networks/pimpPrompt.js &
echo "pimpPrompt.js is running in the background with PID $!"

# Move to the project directory
cd /home/pi/Desktop/elixpo.ai/

# Activate the virtual environment
source elixpo_env/bin/activate
echo "Virtual environment activated."

# Run the Python script in the background
python /home/pi/Desktop/elixpo.ai/server_networks/tagAdding.py &
echo "tagAdding.py is running in the background with PID $!"
