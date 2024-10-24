#!/bin/bash

# Start the Node.js servers in the background
node /home/pi/Desktop/Elixpo_ai_pollinations/server_networks/getImage.js &
echo "image.js is running in the background with PID $!" 
cd /home/pi/Desktop/Elixpo_ai_pollinations/discord_bot 
node elixpo_discord_bot.js &
echo "elixpo_discord_bot.js is running in the background with PID $!" 
