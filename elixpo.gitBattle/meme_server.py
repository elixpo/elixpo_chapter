#!/usr/bin/env python3
"""
GitHub Battle Report - Python Meme Generator Server
This is a complete example for server-side meme generation using Pillow.

SETUP:
    pip install Pillow Flask Werkzeug

USAGE:
    python meme_server.py
    
Then in your HTML, make POST requests to http://localhost:5000/api/generate-meme

EXAMPLE CLIENT CODE:
    const response = await fetch('http://localhost:5000/api/generate-meme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            type: 'drake',
            topText: 'Your Text Here',
            bottomText: 'Another Text'
        })
    });
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
"""

from flask import Flask, request, send_file
from PIL import Image, ImageDraw, ImageFont
import io
import os
from typing import Dict, Tuple

app = Flask(__name__)

# Configuration
MEME_WIDTH = 600
MEME_HEIGHT = 600
DEFAULT_FONT_SIZE = 28


class MemeGenerator:
    """Generate memes using Pillow"""
    
    @staticmethod
    def wrap_text(text: str, max_width: int, font) -> str:
        """Wrap text to fit within max width"""
        words = text.split()
        lines = []
        current_line = []
        
        for word in words:
            current_line.append(word)
            line_text = ' '.join(current_line)
            bbox = font.getbbox(line_text)
            line_width = bbox[2] - bbox[0]
            
            if line_width > max_width:
                current_line.pop()
                if current_line:
                    lines.append(' '.join(current_line))
                current_line = [word]
        
        if current_line:
            lines.append(' '.join(current_line))
        
        return '\n'.join(lines)
    
    @staticmethod
    def draw_text_with_outline(draw, position: Tuple[int, int], text: str, 
                               font, fill_color: str, outline_color: str):
        """Draw text with outline/stroke effect"""
        x, y = position
        # Draw outline
        for adj_x in [-2, -1, 0, 1, 2]:
            for adj_y in [-2, -1, 0, 1, 2]:
                if adj_x != 0 or adj_y != 0:
                    draw.text((x + adj_x, y + adj_y), text, font=font, fill=outline_color)
        # Draw main text
        draw.text(position, text, font=font, fill=fill_color)
    
    @staticmethod
    def generate_drake(top_text: str, bottom_text: str) -> Image.Image:
        """Drake "Hotline Bling" meme"""
        img = Image.new('RGB', (MEME_WIDTH, MEME_HEIGHT), color='white')
        draw = ImageDraw.Draw(img)
        
        # Get font
        try:
            font = ImageFont.truetype("arial.ttf", DEFAULT_FONT_SIZE)
        except:
            font = ImageFont.load_default()
        
        # Top section (disapprove) - gray
        draw.rectangle([(0, 0), (MEME_WIDTH, MEME_HEIGHT//2)], fill='#E8E8E8')
        
        # Bottom section (approve) - lighter gray
        draw.rectangle([(0, MEME_HEIGHT//2), (MEME_WIDTH, MEME_HEIGHT)], fill='#F5F5F5')
        
        # Wrap and draw text
        top_wrapped = MemeGenerator.wrap_text(top_text, MEME_WIDTH - 100, font)
        bottom_wrapped = MemeGenerator.wrap_text(bottom_text, MEME_WIDTH - 100, font)
        
        MemeGenerator.draw_text_with_outline(
            draw, (MEME_WIDTH//2 - 150, MEME_HEIGHT//4 - 30), 
            top_wrapped, font, '#000000', '#FFFFFF'
        )
        
        MemeGenerator.draw_text_with_outline(
            draw, (MEME_WIDTH//2 - 150, 3*MEME_HEIGHT//4 - 30), 
            bottom_wrapped, font, '#000000', '#FFFFFF'
        )
        
        # Add X and checkmark
        try:
            emoji_font = ImageFont.truetype("arial.ttf", 60)
        except:
            emoji_font = font
        
        draw.text((50, MEME_HEIGHT//4), '❌', font=emoji_font, fill='#FF0000')
        draw.text((50, 3*MEME_HEIGHT//4), '✅', font=emoji_font, fill='#00AA00')
        
        return img
    
    @staticmethod
    def generate_distracted_boyfriend(left_text: str, right_text: str) -> Image.Image:
        """Distracted Boyfriend meme"""
        img = Image.new('RGB', (MEME_WIDTH, MEME_HEIGHT), color='white')
        draw = ImageDraw.Draw(img)
        
        try:
            font = ImageFont.truetype("arial.ttf", 24)
        except:
            font = ImageFont.load_default()
        
        # Left side (ignoring) - pink
        draw.rectangle([(0, 0), (MEME_WIDTH//2, MEME_HEIGHT)], fill='#FFB6D9')
        
        # Right side (looking at) - cyan
        draw.rectangle([(MEME_WIDTH//2, 0), (MEME_WIDTH, MEME_HEIGHT)], fill='#ADD8E6')
        
        # Text
        left_wrapped = MemeGenerator.wrap_text(left_text, MEME_WIDTH//2 - 50, font)
        right_wrapped = MemeGenerator.wrap_text(right_text, MEME_WIDTH//2 - 50, font)
        
        MemeGenerator.draw_text_with_outline(
            draw, (MEME_WIDTH//4 - 100, MEME_HEIGHT//2 - 30), 
            left_wrapped, font, '#000000', '#FFFFFF'
        )
        
        MemeGenerator.draw_text_with_outline(
            draw, (3*MEME_WIDTH//4 - 100, MEME_HEIGHT//2 - 30), 
            right_wrapped, font, '#000000', '#FFFFFF'
        )
        
        # Add emoji labels
        try:
            emoji_font = ImageFont.truetype("arial.ttf", 50)
        except:
            emoji_font = font
        
        draw.text((MEME_WIDTH//4 - 25, 100), '👨', font=emoji_font)
        draw.text((3*MEME_WIDTH//4 - 25, 100), '👩', font=emoji_font)
        
        return img
    
    @staticmethod
    def generate_galaxy_brain(line1: str, line2: str, line3: str, line4: str) -> Image.Image:
        """Galaxy Brain (4 levels)"""
        img = Image.new('RGB', (MEME_WIDTH, MEME_HEIGHT), color='white')
        draw = ImageDraw.Draw(img)
        
        try:
            font = ImageFont.truetype("arial.ttf", 20)
        except:
            font = ImageFont.load_default()
        
        colors = ['#FF6B9D', '#C44569', '#FFA502', '#FFD32A']
        lines = [line1, line2, line3, line4]
        box_height = MEME_HEIGHT // 4
        
        for i, (text, color) in enumerate(zip(lines, colors)):
            y_pos = i * box_height
            
            # Background
            draw.rectangle([(0, y_pos), (MEME_WIDTH, y_pos + box_height)], fill=color)
            
            # Border
            draw.rectangle([(0, y_pos), (MEME_WIDTH, y_pos + box_height)], outline='#000000', width=2)
            
            # Text
            wrapped_text = MemeGenerator.wrap_text(text, MEME_WIDTH - 50, font)
            MemeGenerator.draw_text_with_outline(
                draw, (MEME_WIDTH//2 - 100, y_pos + box_height//2 - 20),
                wrapped_text, font, '#FFFFFF', '#000000'
            )
        
        return img
    
    @staticmethod
    def generate_doge(text1: str, text2: str, text3: str, text4: str) -> Image.Image:
        """Doge meme with Comic Sans style"""
        img = Image.new('RGB', (MEME_WIDTH, MEME_HEIGHT), color='#FFD4A3')
        draw = ImageDraw.Draw(img)
        
        try:
            font = ImageFont.truetype("arial.ttf", 24)
        except:
            font = ImageFont.load_default()
        
        # Text elements
        texts = [
            ('wow', (100, 100), '#FF6B6B'),
            (text1, (350, 80), '#4ECDC4'),
            (text2, (150, 280), '#95E1D3'),
            (text3, (380, 350), '#F7B731'),
            (text4, (300, 450), '#EE5A6F')
        ]
        
        for text, (x, y), color in texts:
            MemeGenerator.draw_text_with_outline(draw, (x, y), text, font, color, '#000000')
        
        # Center circle
        draw.ellipse([(MEME_WIDTH//2 - 80, MEME_HEIGHT//2 - 80), 
                      (MEME_WIDTH//2 + 80, MEME_HEIGHT//2 + 80)], 
                     fill='rgba(255, 255, 255, 128)', outline='#CCCCCC')
        
        # Much text
        much_text = 'much code'
        MemeGenerator.draw_text_with_outline(
            draw, (MEME_WIDTH//2 - 80, MEME_HEIGHT//2 - 15),
            much_text, font, '#FF6B6B', '#000000'
        )
        
        return img
    
    @staticmethod
    def generate_gru_plan(stage1: str, stage2: str, stage3: str) -> Image.Image:
        """Gru's Plan meme"""
        img = Image.new('RGB', (MEME_WIDTH, MEME_HEIGHT), color='#F5DEB3')
        draw = ImageDraw.Draw(img)
        
        try:
            font = ImageFont.truetype("arial.ttf", 14)
        except:
            font = ImageFont.load_default()
        
        box_width = 150
        box_height = 150
        start_y = 100
        
        stages = [stage1, stage2, stage3]
        
        for i, stage_text in enumerate(stages):
            x = 75 + i * 150
            
            # Board
            draw.rectangle([(x, start_y), (x + box_width, start_y + box_height)], 
                          fill='#D2B48C', outline='#8B7355', width=3)
            
            # Checkmark/X/Question mark
            try:
                emoji_font = ImageFont.truetype("arial.ttf", 60)
            except:
                emoji_font = font
            
            if i == 2:
                draw.text((x + box_width//2 - 20, start_y + 30), '✗', 
                         font=emoji_font, fill='#FF0000')
            elif i == 1:
                draw.text((x + box_width//2 - 20, start_y + 30), '?',
                         font=emoji_font, fill='#FFD700')
            else:
                draw.text((x + box_width//2 - 20, start_y + 30), '✓',
                         font=emoji_font, fill='#00AA00')
            
            # Text below
            MemeGenerator.draw_text_with_outline(
                draw, (x + box_width//2 - 50, start_y + box_height + 20),
                stage_text, font, '#000000', '#FFFFFF'
            )
        
        # Gru's face
        draw.ellipse([(10, 280), (90, 360)], fill='#FFD4A3', outline='#000000', width=2)
        draw.text((40, 310), '😈', font=emoji_font if 'emoji_font' in locals() else font)
        
        return img


@app.route('/api/generate-meme', methods=['POST'])
def generate_meme():
    """Generate meme endpoint"""
    try:
        data = request.json
        meme_type = data.get('type', 'drake')
        
        # Route to appropriate generator
        if meme_type == 'drake':
            img = MemeGenerator.generate_drake(
                data.get('topText', 'Top Text'),
                data.get('bottomText', 'Bottom Text')
            )
        elif meme_type == 'distracted':
            img = MemeGenerator.generate_distracted_boyfriend(
                data.get('leftText', 'Left Text'),
                data.get('rightText', 'Right Text')
            )
        elif meme_type == 'galaxy-brain':
            img = MemeGenerator.generate_galaxy_brain(
                data.get('line1', 'Level 1'),
                data.get('line2', 'Level 2'),
                data.get('line3', 'Level 3'),
                data.get('line4', 'Level 4')
            )
        elif meme_type == 'doge':
            img = MemeGenerator.generate_doge(
                data.get('text1', 'Text 1'),
                data.get('text2', 'Text 2'),
                data.get('text3', 'Text 3'),
                data.get('text4', 'Text 4')
            )
        elif meme_type == 'gru':
            img = MemeGenerator.generate_gru_plan(
                data.get('stage1', 'Stage 1'),
                data.get('stage2', 'Stage 2'),
                data.get('stage3', 'Stage 3')
            )
        else:
            return {'error': 'Unknown meme type'}, 400
        
        # Convert to bytes
        img_io = io.BytesIO()
        img.save(img_io, 'PNG', quality=95)
        img_io.seek(0)
        
        return send_file(img_io, mimetype='image/png')
    
    except Exception as e:
        return {'error': str(e)}, 500


@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return {'status': 'ok', 'service': 'GitHub Battle Meme Generator'}


if __name__ == '__main__':
    print("🚀 Starting GitHub Battle Meme Generator Server...")
    print("📍 API running at http://localhost:5000")
    print("🎨 POST to http://localhost:5000/api/generate-meme with meme config")
    print("✅ Check health at http://localhost:5000/api/health")
    app.run(debug=True, port=5000)
