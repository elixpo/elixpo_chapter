#!/bin/bash

# Start the Node.js servers in the background
cd /home/pi/Desktop/Elixpo_ai_pollinations/server_networks
node getImage.js &
echo "image.js is running in the background with PID $!"
cd /home/pi
bash ./tunnel.sh &;
echo "tunnel.sh is running in the background with PID $!"

