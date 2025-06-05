#!/bin/bash
# Deployment script for Elixpo Search Proxy with Cloudflare Tunnel

echo "=== Elixpo Search Proxy Deployment Script ==="
echo "This script documents the deployment process for the search proxy"
echo ""

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    echo "cloudflared is not installed. Installing..."
    sudo mkdir -p --mode=0755 /usr/share/keyrings
    curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
    echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
    sudo apt-get update && sudo apt-get install -y cloudflared
fi

echo "cloudflared version: $(cloudflared --version)"
echo ""

# Instructions for manual setup
echo "=== Manual Setup Instructions ==="
echo "1. Authenticate cloudflared (if not already done):"
echo "   cloudflared tunnel login"
echo ""
echo "2. Create a tunnel (if not already created):"
echo "   cloudflared tunnel create elixpo-search"
echo ""
echo "3. Create config file at ~/.cloudflared/config.yml with:"
echo "   url: http://localhost:5000"
echo "   tunnel: <YOUR-TUNNEL-UUID>"
echo "   credentials-file: /root/.cloudflared/<YOUR-TUNNEL-UUID>.json"
echo ""
echo "4. Route the tunnel to your domain:"
echo "   cloudflared tunnel route dns elixpo-search search.pollinations.ai"
echo ""
echo "5. Start the Python service:"
echo "   cd $(dirname "$0")"
echo "   source venv/bin/activate"
echo "   waitress-serve --host=0.0.0.0 --port=5000 ai_search_agent_prod:app &"
echo ""
echo "6. Start the tunnel:"
echo "   cloudflared tunnel run elixpo-search"
echo ""
echo "=== To run as a systemd service ==="
echo "   sudo cloudflared service install"
echo "   sudo systemctl start cloudflared"
echo "   sudo systemctl enable cloudflared"
echo ""
echo "=== Current Tunnel Info ==="
cloudflared tunnel list | grep elixpo-search || echo "No elixpo-search tunnel found"