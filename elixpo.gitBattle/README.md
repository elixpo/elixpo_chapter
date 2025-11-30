# ⚔️ GitHub Battle Report: Christmas Edition 🎄

A hilarious GitHub profile comparison tool that generates roast-style commentary, funny metrics, memes, and PDF battle reports. Perfect as a Christmas gag gift for developers!

## 🎯 Features

### Core Functionality
- 🔍 **Profile Comparison**: Fetches GitHub stats for two users
- 😂 **Roast Generation**: Three roast modes (Friendly, Gen-Z, Toxic)
- 📊 **Fun Metrics**: Code Commitment Index, Star Power Rating, Repo Hygiene Score, Social Life Analysis
- 🎪 **Meme Generation**: Drake, Distracted Boyfriend, Galaxy Brain, Doge, Gru's Plan, This is Fine
- 📄 **PDF Export**: Full battle report with stats and commentary
- 🎨 **Theme Modes**: Christmas, Hacktoberfest, GitHub Stars, DevOps Chaos

### Roast Modes

**Friendly 🥰**
```
"User1 has 150 stars! That's dedication! 🌟"
"User2 follows 50 people. Networking champion! 👥"
```

**Gen-Z 💀**
```
"User1 really said 'let me collect 150 stars' fr fr no cap 💀"
"User2 following 50 people? That's giving 'touch grass' energy 🚪"
```

**Toxic (Funny) 🔥**
```
"User1 flexing 150 stars like they invented GitHub 🤡"
"User2 collecting dust with 42 stars 😅"
```

## 📊 Data Compared

### Profile Stats
- Total repositories
- Followers & Following
- Total stars received
- Total forks received
- Account age
- Profile bio
- Last commit date

### Repo-Level Stats (Top 3 Repos)
- Stars, Forks, Issues
- Language used
- Last commit date

### Fun Metrics
1. **Code Commitment Index** - Commits & activity level
2. **Star Power Rating** - Stars divided by account age
3. **Repo Hygiene Score** - Open vs. closed issues ratio
4. **Open Source Social Life** - Followers vs. following
5. **Dec 25 Audit** - Last commit date (Christmas joke)
6. **Main Language Flex** - Most used language with roasts

## 🚀 Quick Start

### 1. Open in Browser
Simply open `index.html` in your browser. No installation needed!

```bash
# If you have Python installed
python -m http.server 8000
# Then visit: http://localhost:8000/index.html
```

### 2. Enter Two GitHub Usernames
- Enter username 1 (e.g., "torvalds")
- Enter username 2 (e.g., "gvanrossum")

### 3. Choose Roast Mode & Theme
- **Roast Mode**: Friendly, Gen-Z, or Toxic
- **Theme**: Christmas, Hacktoberfest, Stars, or DevOps

### 4. Generate Battle Report
- Click "🎯 GENERATE BATTLE REPORT"
- Wait for GitHub API to fetch data
- View results with memes, stats, and roasts

### 5. Download PDF
- Click "📄 Download PDF Battle Report"
- Save and share!

## 🎨 Customization

### Meme Generation

#### Option 1: Client-Side (Canvas API) - Built-in
Already implemented! Generates memes using HTML5 Canvas.

```javascript
// Use in script.js
MemeGenerator.generate(canvas, config);
```

#### Option 2: Imgflip API - Easy Setup
Add your Imgflip credentials:

```javascript
// In meme-endpoint.js
const username = 'YOUR_IMGFLIP_USERNAME'; // Get from https://imgflip.com/api
const password = 'YOUR_IMGFLIP_PASSWORD';

// Then use:
await MemeEndpoint.generateViaImgflip(templateId, topText, bottomText);
```

#### Option 3: Node.js Server - Full Control
```bash
npm install canvas
```

Create `server.js`:
```javascript
const express = require('express');
const { createCanvas } = require('canvas');
const app = express();

app.post('/api/generate-meme', async (req, res) => {
    const { type, texts } = req.body;
    const canvas = createCanvas(600, 600);
    const ctx = canvas.getContext('2d');
    
    // Generate meme using MemeEndpoint functions...
    
    const buffer = canvas.toBuffer('image/png');
    res.type('image/png');
    res.send(buffer);
});

app.listen(3000);
```

#### Option 4: Python Server - Easy Image Processing
```bash
pip install Pillow Flask
```

Create `server.py`:
```python
from PIL import Image, ImageDraw
from flask import Flask, request, send_file
import io

app = Flask(__name__)

@app.route('/api/generate-meme', methods=['POST'])
def generate_meme():
    data = request.json
    img = Image.new('RGB', (600, 600), color='white')
    draw = ImageDraw.Draw(img)
    
    # Generate meme...
    
    img_io = io.BytesIO()
    img.save(img_io, 'PNG')
    img_io.seek(0)
    return send_file(img_io, mimetype='image/png')

if __name__ == '__main__':
    app.run(debug=True)
```

### Customize Roasts

Edit roast templates in `script.js`:

```javascript
const roasts = [
    `${player} has ${pStats.totalStars} stars! That's dedication! 🌟`,
    // Add your own roasts here...
];
```

### Add New Themes

Add to `displaySarcasm()`:

```javascript
const templates = {
    'your-theme': [
        `Custom roast text here...`,
        `Another roast...`
    ]
};
```

## 📦 File Structure

```
elixpo.gitBattle/
├── index.html          # Main UI (Tailwind CSS)
├── script.js           # Core logic, GitHub API integration
├── meme-endpoint.js    # Meme generation utilities
└── README.md           # This file
```

## 🔌 Dependencies

### External APIs
- **GitHub API v3** (free, no auth required for public profiles)
- **html2pdf.js** - PDF generation
- **Chart.js** - Stats visualization
- **Tailwind CSS** - Styling (CDN)

### Optional
- **Imgflip API** - Additional meme generation
- **Node Canvas** - Server-side meme generation
- **Pillow** - Python image manipulation

## 📋 API References

### GitHub API Endpoints Used
```
GET /users/{username}                  # Profile info
GET /users/{username}/repos            # Repositories
GET /users/{username}/events/public    # Activity/commits
```

### Supported Meme Templates

1. **Drake** - Disapproves/Approves
2. **Distracted Boyfriend** - Two choices comparison
3. **Galaxy Brain** - 4-level escalation
4. **Doge** - Much code, so commits
5. **Gru's Plan** - 3-stage plan with failure
6. **This is Fine** - Fire/chaos reference

## ⚙️ Advanced Setup

### Environment Variables
```bash
# For Imgflip API
IMGFLIP_USERNAME=your_username
IMGFLIP_PASSWORD=your_password

# For GitHub API (optional, for higher rate limits)
GITHUB_TOKEN=your_token
```

### Docker Setup (Optional)

`Dockerfile`:
```dockerfile
FROM python:3.9-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["python", "server.py"]
```

`requirements.txt`:
```
Pillow==9.0.0
Flask==2.0.0
```

## 🐛 Troubleshooting

### "User not found"
- Check GitHub username spelling
- Ensure profile is public

### Memes not loading
- Canvas may not support all features
- Use Imgflip API instead (see Customization)

### PDF too large
- Reduce image quality in `downloadPDF()`
- Remove meme gallery from PDF

### GitHub API rate limit
- Use GitHub token (60 to 5000 requests/hour)
- Wait 1 hour for free tier reset

## 🎁 Gift Ideas

### Christmas Edition
- Compare company leads
- Compare team members
- Self vs. GitHub profile from 5 years ago

### Hacktoberfest Edition
- Compare Hacktoberfest progress
- Multiple comparisons per day

### Internal Hackathon
- Generate live during event
- Project vs. competitor comparison

## 🔐 Privacy

- **No data storage**: Results generated on-the-fly
- **Public data only**: Uses public GitHub API
- **Browser-based**: All processing on client side
- **PDF local**: Generated and saved locally

## 📝 License

This project is free to use and modify. Share the roasts responsibly! 😄

## 🚀 Future Enhancements

- [ ] Animated meme generation
- [ ] Voice-over roasts (TTS)
- [ ] Team battles (3+ users)
- [ ] Historical comparison (year-over-year)
- [ ] Achievement badges
- [ ] Leaderboard generation
- [ ] Slack/Discord integration
- [ ] Custom meme templates

## 🎪 Made with ❤️ for Developers

Remember: These are jokes for fun! All comparisons are in good spirit. 🎉

---

**Questions?** Check the meme-endpoint.js file for integration examples!
