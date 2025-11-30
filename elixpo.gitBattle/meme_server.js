/**
 * GitHub Battle Report - Node.js Meme Generator Server
 * This is a complete example for server-side meme generation using Canvas.
 * 
 * SETUP:
 *     npm init -y
 *     npm install express canvas cors body-parser
 * 
 * USAGE:
 *     node meme_server.js
 * 
 * Then in your HTML, make POST requests to http://localhost:5000/api/generate-meme
 * 
 * EXAMPLE CLIENT CODE:
 *     const response = await fetch('http://localhost:5000/api/generate-meme', {
 *         method: 'POST',
 *         headers: { 'Content-Type': 'application/json' },
 *         body: JSON.stringify({
 *             type: 'drake',
 *             topText: 'Your Text Here',
 *             bottomText: 'Another Text'
 *         })
 *     });
 *     const blob = await response.blob();
 *     const url = URL.createObjectURL(blob);
 */

const express = require('express');
const { createCanvas } = require('canvas');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// Constants
const MEME_WIDTH = 600;
const MEME_HEIGHT = 600;
const DEFAULT_FONT_SIZE = 28;

class MemeGenerator {
    /**
     * Wrap text to fit within max width
     */
    static wrapText(ctx, text, maxWidth, fontSize) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = '';

        words.forEach(word => {
            const testLine = currentLine + (currentLine ? ' ' : '') + word;
            const metrics = ctx.measureText(testLine);

            if (metrics.width > maxWidth && currentLine) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        });

        if (currentLine) lines.push(currentLine);
        return lines;
    }

    /**
     * Draw text with outline/stroke effect
     */
    static drawTextWithOutline(ctx, text, x, y, fillColor, outlineColor, fontSize) {
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.strokeStyle = outlineColor;
        ctx.lineWidth = 3;
        ctx.fillStyle = fillColor;

        // Draw outline
        for (let adj_x = -2; adj_x <= 2; adj_x++) {
            for (let adj_y = -2; adj_y <= 2; adj_y++) {
                if (adj_x !== 0 || adj_y !== 0) {
                    ctx.strokeText(text, x + adj_x, y + adj_y);
                }
            }
        }

        // Draw main text
        ctx.fillText(text, x, y);
    }

    /**
     * Generate Drake "Hotline Bling" meme
     */
    static generateDrake(topText, bottomText) {
        const canvas = createCanvas(MEME_WIDTH, MEME_HEIGHT);
        const ctx = canvas.getContext('2d');

        // Top section (disapprove) - gray
        ctx.fillStyle = '#E8E8E8';
        ctx.fillRect(0, 0, MEME_WIDTH, MEME_HEIGHT / 2);

        // Bottom section (approve) - lighter gray
        ctx.fillStyle = '#F5F5F5';
        ctx.fillRect(0, MEME_HEIGHT / 2, MEME_WIDTH, MEME_HEIGHT / 2);

        // Set font
        ctx.font = `bold ${DEFAULT_FONT_SIZE}px Arial`;
        ctx.textAlign = 'center';

        // Wrap and draw text
        const topLines = this.wrapText(ctx, topText, MEME_WIDTH - 100, DEFAULT_FONT_SIZE);
        const bottomLines = this.wrapText(ctx, bottomText, MEME_WIDTH - 100, DEFAULT_FONT_SIZE);

        let topY = MEME_HEIGHT / 4 - (topLines.length * DEFAULT_FONT_SIZE) / 2;
        topLines.forEach(line => {
            this.drawTextWithOutline(ctx, line, MEME_WIDTH / 2, topY, '#000000', '#FFFFFF', DEFAULT_FONT_SIZE);
            topY += DEFAULT_FONT_SIZE;
        });

        let bottomY = (3 * MEME_HEIGHT) / 4 - (bottomLines.length * DEFAULT_FONT_SIZE) / 2;
        bottomLines.forEach(line => {
            this.drawTextWithOutline(ctx, line, MEME_WIDTH / 2, bottomY, '#000000', '#FFFFFF', DEFAULT_FONT_SIZE);
            bottomY += DEFAULT_FONT_SIZE;
        });

        // Add X and checkmark
        ctx.font = 'bold 60px Arial';
        ctx.fillStyle = '#FF0000';
        ctx.fillText('❌', 50, MEME_HEIGHT / 4);
        ctx.fillStyle = '#00AA00';
        ctx.fillText('✅', 50, (3 * MEME_HEIGHT) / 4);

        return canvas;
    }

    /**
     * Generate Distracted Boyfriend meme
     */
    static generateDistractionMeme(leftText, rightText) {
        const canvas = createCanvas(MEME_WIDTH, MEME_HEIGHT);
        const ctx = canvas.getContext('2d');

        // Left side (ignoring) - pink
        ctx.fillStyle = '#FFB6D9';
        ctx.fillRect(0, 0, MEME_WIDTH / 2, MEME_HEIGHT);

        // Right side (looking at) - cyan
        ctx.fillStyle = '#ADD8E6';
        ctx.fillRect(MEME_WIDTH / 2, 0, MEME_WIDTH / 2, MEME_HEIGHT);

        // Text
        ctx.font = `bold 24px Arial`;
        ctx.textAlign = 'center';

        const leftLines = this.wrapText(ctx, leftText, MEME_WIDTH / 2 - 50, 24);
        const rightLines = this.wrapText(ctx, rightText, MEME_WIDTH / 2 - 50, 24);

        let leftY = MEME_HEIGHT / 2 - (leftLines.length * 24) / 2;
        leftLines.forEach(line => {
            this.drawTextWithOutline(ctx, line, MEME_WIDTH / 4, leftY, '#000000', '#FFFFFF', 24);
            leftY += 24;
        });

        let rightY = MEME_HEIGHT / 2 - (rightLines.length * 24) / 2;
        rightLines.forEach(line => {
            this.drawTextWithOutline(ctx, line, (3 * MEME_WIDTH) / 4, rightY, '#000000', '#FFFFFF', 24);
            rightY += 24;
        });

        // Add emoji labels
        ctx.font = 'bold 50px Arial';
        ctx.fillStyle = '#000';
        ctx.fillText('👨', MEME_WIDTH / 4 - 25, 100);
        ctx.fillText('👩', (3 * MEME_WIDTH) / 4 - 25, 100);

        return canvas;
    }

    /**
     * Generate Galaxy Brain meme (4 levels)
     */
    static generateGalaxyBrain(line1, line2, line3, line4) {
        const canvas = createCanvas(MEME_WIDTH, MEME_HEIGHT);
        const ctx = canvas.getContext('2d');

        const colors = ['#FF6B9D', '#C44569', '#FFA502', '#FFD32A'];
        const lines = [line1, line2, line3, line4];
        const boxHeight = MEME_HEIGHT / 4;

        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';

        lines.forEach((text, i) => {
            const y = i * boxHeight;

            // Background
            ctx.fillStyle = colors[i];
            ctx.fillRect(0, y, MEME_WIDTH, boxHeight);

            // Border
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 3;
            ctx.strokeRect(0, y, MEME_WIDTH, boxHeight);

            // Text
            const wrapped = this.wrapText(ctx, text, MEME_WIDTH - 50, 20);
            let textY = y + boxHeight / 2 - (wrapped.length * 20) / 2;
            wrapped.forEach(line => {
                this.drawTextWithOutline(ctx, line, MEME_WIDTH / 2, textY, '#FFFFFF', '#000000', 20);
                textY += 20;
            });
        });

        return canvas;
    }

    /**
     * Generate Doge meme
     */
    static generateDoge(text1, text2, text3, text4) {
        const canvas = createCanvas(MEME_WIDTH, MEME_HEIGHT);
        const ctx = canvas.getContext('2d');

        // Background
        ctx.fillStyle = '#FFD4A3';
        ctx.fillRect(0, 0, MEME_WIDTH, MEME_HEIGHT);

        // Text elements
        const textElements = [
            { text: 'wow', x: 100, y: 100, color: '#FF6B6B', size: 32 },
            { text: text1, x: 350, y: 80, color: '#4ECDC4', size: 24 },
            { text: text2, x: 150, y: 280, color: '#95E1D3', size: 24 },
            { text: text3, x: 380, y: 350, color: '#F7B731', size: 24 },
            { text: text4, x: 300, y: 450, color: '#EE5A6F', size: 24 }
        ];

        textElements.forEach(elem => {
            this.drawTextWithOutline(ctx, elem.text, elem.x, elem.y, elem.color, '#000000', elem.size);
        });

        // Center circle
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        ctx.arc(MEME_WIDTH / 2, MEME_HEIGHT / 2, 80, 0, Math.PI * 2);
        ctx.fill();

        // "Much" text
        ctx.font = 'bold 32px Arial';
        ctx.fillStyle = '#FF6B6B';
        ctx.textAlign = 'center';
        ctx.fillText('much code', MEME_WIDTH / 2, MEME_HEIGHT / 2 + 10);

        return canvas;
    }

    /**
     * Generate Gru's Plan meme
     */
    static generateGruPlan(stage1, stage2, stage3) {
        const canvas = createCanvas(MEME_WIDTH, MEME_HEIGHT);
        const ctx = canvas.getContext('2d');

        // Background
        ctx.fillStyle = '#F5DEB3';
        ctx.fillRect(0, 0, MEME_WIDTH, MEME_HEIGHT);

        const boxWidth = 150;
        const boxHeight = 150;
        const startY = 100;
        const stages = [stage1, stage2, stage3];

        stages.forEach((stageText, i) => {
            const x = 75 + i * 150;

            // Board
            ctx.fillStyle = '#D2B48C';
            ctx.fillRect(x, startY, boxWidth, boxHeight);

            // Border
            ctx.strokeStyle = '#8B7355';
            ctx.lineWidth = 3;
            ctx.strokeRect(x, startY, boxWidth, boxHeight);

            // Checkmark/X/Question
            ctx.font = 'bold 60px Arial';
            ctx.textAlign = 'center';
            if (i === 2) {
                ctx.fillStyle = '#FF0000';
                ctx.fillText('✗', x + boxWidth / 2, startY + 50);
            } else if (i === 1) {
                ctx.fillStyle = '#FFD700';
                ctx.fillText('?', x + boxWidth / 2, startY + 50);
            } else {
                ctx.fillStyle = '#00AA00';
                ctx.fillText('✓', x + boxWidth / 2, startY + 50);
            }

            // Text below
            ctx.font = 'bold 14px Arial';
            const wrapped = this.wrapText(ctx, stageText, boxWidth - 20, 14);
            let textY = startY + boxHeight + 20;
            wrapped.forEach(line => {
                this.drawTextWithOutline(ctx, line, x + boxWidth / 2, textY, '#000000', '#FFFFFF', 14);
                textY += 14;
            });
        });

        // Gru's face
        ctx.fillStyle = '#FFD4A3';
        ctx.beginPath();
        ctx.arc(50, 320, 40, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.font = 'bold 30px Arial';
        ctx.fillText('😈', 50, 330);

        return canvas;
    }
}

/**
 * POST /api/generate-meme
 * Generate meme based on type and parameters
 */
app.post('/api/generate-meme', (req, res) => {
    try {
        const { type, topText, bottomText, leftText, rightText, line1, line2, line3, line4, text1, text2, text3, text4, stage1, stage2, stage3 } = req.body;

        let canvas;

        switch (type) {
            case 'drake':
                canvas = MemeGenerator.generateDrake(topText || 'Top Text', bottomText || 'Bottom Text');
                break;
            case 'distracted':
                canvas = MemeGenerator.generateDistractionMeme(leftText || 'Left', rightText || 'Right');
                break;
            case 'galaxy-brain':
                canvas = MemeGenerator.generateGalaxyBrain(line1 || 'Level 1', line2 || 'Level 2', line3 || 'Level 3', line4 || 'Level 4');
                break;
            case 'doge':
                canvas = MemeGenerator.generateDoge(text1 || 'Text 1', text2 || 'Text 2', text3 || 'Text 3', text4 || 'Text 4');
                break;
            case 'gru':
                canvas = MemeGenerator.generateGruPlan(stage1 || 'Stage 1', stage2 || 'Stage 2', stage3 || 'Stage 3');
                break;
            default:
                return res.status(400).json({ error: 'Unknown meme type' });
        }

        // Convert canvas to PNG buffer
        const buffer = canvas.toBuffer('image/png');
        res.type('image/png');
        res.send(buffer);
    } catch (error) {
        console.error('Error generating meme:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'GitHub Battle Meme Generator' });
});

/**
 * Start server
 */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log('🚀 Starting GitHub Battle Meme Generator Server...');
    console.log(`📍 API running at http://localhost:${PORT}`);
    console.log(`🎨 POST to http://localhost:${PORT}/api/generate-meme with meme config`);
    console.log(`✅ Check health at http://localhost:${PORT}/api/health`);
});
