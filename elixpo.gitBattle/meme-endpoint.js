/**
 * MEME GENERATOR ENDPOINT
 * 
 * This file contains the meme generation logic that can be customized.
 * You can extend this with server-side image generation (Node.js, Python, etc.)
 * 
 * SETUP OPTIONS:
 * 
 * 1. CLIENT-SIDE (Canvas API) - Already implemented in script.js
 * 2. NODE.JS SERVER - Use 'canvas' or 'sharp' + 'jimp'
 * 3. PYTHON SERVER - Use 'PIL' or 'Pillow'
 * 4. EXTERNAL API - Use Imgflip, Meme Generator API
 * 
 * This file provides helper functions that generate meme URLs or image data.
 */

// ============================================
// OPTION 1: EXTERNAL API (Imgflip) - No setup needed!
// ============================================

const MemeEndpoint = {
    
    /**
     * Generate meme using Imgflip API (Free tier available)
     * Supports 100+ popular meme templates
     */
    async generateViaImgflip(templateId, topText, bottomText) {
        const username = 'YOUR_IMGFLIP_USERNAME'; // Get from https://imgflip.com/api
        const password = 'YOUR_IMGFLIP_PASSWORD';
        
        const params = new URLSearchParams();
        params.append('template_id', templateId);
        params.append('username', username);
        params.append('password', password);
        params.append('text0', topText);
        params.append('text1', bottomText);
        
        try {
            const response = await fetch('https://api.imgflip.com/caption_image', {
                method: 'POST',
                body: params
            });
            const data = await response.json();
            return data.data?.url || null;
        } catch (error) {
            console.error('Imgflip API Error:', error);
            return null;
        }
    },

    /**
     * Imgflip meme template IDs
     */
    templates: {
        drake: 102079378,
        distracted: 112126428,
        galaxyBrain: 86377884,
        thisIsFine: 129242436,
        doge: 8072285,
        gru: 126477829,
        howItStarted: 127873513,
        crying: 6235864,
        santaNaughty: 271848, // Custom Santa list
    },

    // ============================================
    // OPTION 2: CUSTOM CANVAS GENERATOR (Client-side)
    // ============================================

    /**
     * Generate Drake meme on canvas
     */
    generateDrakeMeme(canvas, disapproveText, approveText) {
        const ctx = canvas.getContext('2d');
        canvas.width = 500;
        canvas.height = 600;

        // Background
        const img = new Image();
        // You would load the actual Drake meme template here
        // img.src = 'drake-template.png';
        // Or draw it manually:
        
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw two sections (top and bottom)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height / 2);

        // Text styling
        ctx.fillStyle = '#000';
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#fff';

        // Top text (disapprove)
        const topY = canvas.height / 4;
        ctx.strokeText(disapproveText, canvas.width / 2, topY);
        ctx.fillText(disapproveText, canvas.width / 2, topY);

        // Bottom text (approve)
        const bottomY = (3 * canvas.height) / 4;
        ctx.strokeText(approveText, canvas.width / 2, bottomY);
        ctx.fillText(approveText, canvas.width / 2, bottomY);

        // Add indicators
        ctx.font = 'bold 50px Arial';
        ctx.strokeText('❌', 50, topY);
        ctx.fillText('❌', 50, topY);
        ctx.strokeText('✅', 50, bottomY);
        ctx.fillText('✅', 50, bottomY);

        return canvas;
    },

    /**
     * Generate Distracted Boyfriend meme
     */
    generateDistractionMeme(canvas, ignoringText, lookingAtText) {
        const ctx = canvas.getContext('2d');
        canvas.width = 500;
        canvas.height = 400;

        // Left side (ignoring) - pink
        ctx.fillStyle = '#FFB6D9';
        ctx.fillRect(0, 0, canvas.width / 2, canvas.height);

        // Right side (looking at) - blue
        ctx.fillStyle = '#ADD8E6';
        ctx.fillRect(canvas.width / 2, 0, canvas.width / 2, canvas.height);

        // Text
        ctx.fillStyle = '#000';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#fff';

        ctx.strokeText(ignoringText, canvas.width / 4, canvas.height / 2);
        ctx.fillText(ignoringText, canvas.width / 4, canvas.height / 2);

        ctx.strokeText(lookingAtText, (3 * canvas.width) / 4, canvas.height / 2);
        ctx.fillText(lookingAtText, (3 * canvas.width) / 4, canvas.height / 2);

        // Add emoji labels
        ctx.font = 'bold 60px Arial';
        ctx.strokeText('👨', canvas.width / 4, canvas.height / 4);
        ctx.fillText('👨', canvas.width / 4, canvas.height / 4);
        ctx.strokeText('👩', (3 * canvas.width) / 4, canvas.height / 4);
        ctx.fillText('👩', (3 * canvas.width) / 4, canvas.height / 4);

        return canvas;
    },

    /**
     * Generate Galaxy Brain meme (4 levels)
     */
    generateGalaxyBrainMeme(canvas, level1, level2, level3, level4) {
        const ctx = canvas.getContext('2d');
        canvas.width = 600;
        canvas.height = 600;

        const colors = [
            '#FF6B9D',  // Pink
            '#C44569',  // Red
            '#FFA502',  // Orange
            '#FFD32A'   // Yellow
        ];

        const levels = [level1, level2, level3, level4];
        const boxHeight = canvas.height / 4;

        levels.forEach((text, index) => {
            // Background
            ctx.fillStyle = colors[index];
            ctx.fillRect(0, index * boxHeight, canvas.width, boxHeight);

            // Border
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 3;
            ctx.strokeRect(0, index * boxHeight, canvas.width, boxHeight);

            // Text
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 22px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#000';

            const y = (index + 0.5) * boxHeight;
            ctx.strokeText(text, canvas.width / 2, y);
            ctx.fillText(text, canvas.width / 2, y);
        });

        return canvas;
    },

    /**
     * Generate Doge meme
     */
    generateDogeMeme(canvas, text1, text2, text3, text4) {
        const ctx = canvas.getContext('2d');
        canvas.width = 500;
        canvas.height = 500;

        // Background
        ctx.fillStyle = '#FFD4A3';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Text elements (Comic Sans style)
        const textElements = [
            { text: 'wow', x: 100, y: 100, color: '#FF6B6B' },
            { text: text1, x: 350, y: 80, color: '#4ECDC4' },
            { text: text2, x: 150, y: 280, color: '#95E1D3' },
            { text: text3, x: 380, y: 350, color: '#F7B731' },
            { text: text4, x: 300, y: 450, color: '#EE5A6F' }
        ];

        textElements.forEach(elem => {
            ctx.fillStyle = elem.color;
            ctx.font = 'bold 24px "Comic Sans MS", cursive';
            ctx.textAlign = 'center';
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#000';
            ctx.strokeText(elem.text, elem.x, elem.y);
            ctx.fillText(elem.text, elem.x, elem.y);
        });

        // Center circle for "doge"
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        ctx.arc(canvas.width / 2, canvas.height / 2, 80, 0, Math.PI * 2);
        ctx.fill();

        // "Much" text
        ctx.fillStyle = '#FF6B6B';
        ctx.font = 'bold 32px "Comic Sans MS"';
        ctx.fillText('much code', canvas.width / 2, canvas.height / 2);

        return canvas;
    },

    /**
     * Generate "This is Fine" reference meme
     */
    generateThisIsFineMeme(canvas, topText, bottomText) {
        const ctx = canvas.getContext('2d');
        canvas.width = 500;
        canvas.height = 600;

        // Background - fire colors
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#FF6B35');
        gradient.addColorStop(1, '#F7931E');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Coffee cup symbol
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(canvas.width / 2 - 40, canvas.height / 2 - 30, 80, 60);

        // Steam/flames
        ctx.fillStyle = '#FF4500';
        ctx.beginPath();
        ctx.arc(canvas.width / 2 - 30, canvas.height / 2 - 40, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(canvas.width / 2, canvas.height / 2 - 50, 25, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(canvas.width / 2 + 30, canvas.height / 2 - 40, 20, 0, Math.PI * 2);
        ctx.fill();

        // Text
        ctx.fillStyle = '#000';
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#fff';

        ctx.strokeText(topText, canvas.width / 2, 60);
        ctx.fillText(topText, canvas.width / 2, 60);

        ctx.strokeText(bottomText, canvas.width / 2, canvas.height - 40);
        ctx.fillText(bottomText, canvas.width / 2, canvas.height - 40);

        return canvas;
    },

    /**
     * Generate Gru's Plan meme (3 stages)
     */
    generateGruPlanMeme(canvas, stage1, stage2, stage3) {
        const ctx = canvas.getContext('2d');
        canvas.width = 600;
        canvas.height = 500;

        // Background
        ctx.fillStyle = '#F5DEB3';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw 3 boards
        const boxWidth = 150;
        const boxHeight = 150;
        const startY = 100;

        [0, 1, 2].forEach((i) => {
            const x = 75 + i * 150;
            
            // Board
            ctx.fillStyle = '#D2B48C';
            ctx.fillRect(x, startY, boxWidth, boxHeight);
            
            // Border
            ctx.strokeStyle = '#8B7355';
            ctx.lineWidth = 3;
            ctx.strokeRect(x, startY, boxWidth, boxHeight);

            // Checkmark or X
            ctx.font = 'bold 60px Arial';
            ctx.textAlign = 'center';
            const checkX = x + boxWidth / 2;
            const checkY = startY + 50;
            
            if (i === 2) {
                ctx.fillStyle = '#FF0000';
                ctx.fillText('✗', checkX, checkY);
            } else if (i === 1) {
                ctx.fillStyle = '#FFD700';
                ctx.fillText('?', checkX, checkY);
            } else {
                ctx.fillStyle = '#00AA00';
                ctx.fillText('✓', checkX, checkY);
            }
        });

        // Text below boards
        const texts = [stage1, stage2, stage3];
        texts.forEach((text, i) => {
            const x = 75 + i * 150;
            ctx.fillStyle = '#000';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(text, x + boxWidth / 2, startY + boxHeight + 30);
        });

        // Gru's face placeholder
        ctx.fillStyle = '#FFD4A3';
        ctx.beginPath();
        ctx.arc(50, 320, 40, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#000';
        ctx.font = 'bold 30px Arial';
        ctx.fillText('😈', 50, 330);

        return canvas;
    }
};

// ============================================
// SERVER IMPLEMENTATION EXAMPLES
// ============================================

/**
 * NODE.JS SERVER EXAMPLE
 * 
 * npm install canvas
 * 
 * app.post('/api/generate-meme', async (req, res) => {
 *     const { type, texts } = req.body;
 *     const canvas = createCanvas(600, 600);
 *     const ctx = canvas.getContext('2d');
 *     
 *     // Generate meme...
 *     
 *     const buffer = canvas.toBuffer('image/png');
 *     res.type('image/png');
 *     res.send(buffer);
 * });
 */

/**
 * PYTHON SERVER EXAMPLE
 * 
 * pip install Pillow
 * 
 * @app.route('/api/generate-meme', methods=['POST'])
 * def generate_meme():
 *     data = request.json
 *     img = Image.new('RGB', (600, 600), color='white')
 *     draw = ImageDraw.Draw(img)
 *     
 *     # Generate meme...
 *     
 *     return send_file(img, mimetype='image/png')
 */

// Export for use in main script
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MemeEndpoint;
}
