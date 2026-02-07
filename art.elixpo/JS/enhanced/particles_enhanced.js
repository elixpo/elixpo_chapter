// Enhanced Particles System for Elixpo Art Landing Page

class EnhancedParticles {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.canvas = null;
        this.ctx = null;
        this.particles = [];
        this.mousePosition = { x: 0, y: 0 };
        this.animationId = null;
        this.isVisible = true;
        
        this.config = {
            particleCount: 80,
            maxParticleSize: 3,
            minParticleSize: 1,
            particleSpeed: 0.5,
            connectionDistance: 120,
            mouseInteractionDistance: 150,
            colors: [
                'rgba(141, 73, 253, 0.6)',  // Primary purple
                'rgba(86, 145, 243, 0.6)',  // Secondary blue
                'rgba(127, 86, 243, 0.6)',  // Accent purple
                'rgba(244, 200, 1, 0.4)',   // Gold accent
                'rgba(255, 255, 255, 0.3)' // White
            ]
        };
        
        this.init();
    }
    
    init() {
        this.createCanvas();
        this.createParticles();
        this.bindEvents();
        this.animate();
    }
    
    createCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.zIndex = '1';
        
        this.container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        
        this.resizeCanvas();
    }
    
    resizeCanvas() {
        const rect = this.container.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
    }
    
    createParticles() {
        this.particles = [];
        
        for (let i = 0; i < this.config.particleCount; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: (Math.random() - 0.5) * this.config.particleSpeed,
                vy: (Math.random() - 0.5) * this.config.particleSpeed,
                size: Math.random() * (this.config.maxParticleSize - this.config.minParticleSize) + this.config.minParticleSize,
                color: this.config.colors[Math.floor(Math.random() * this.config.colors.length)],
                opacity: Math.random() * 0.5 + 0.3,
                pulse: Math.random() * Math.PI * 2,
                originalSize: 0
            });
            
            this.particles[i].originalSize = this.particles[i].size;
        }
    }
    
    bindEvents() {
        window.addEventListener('resize', () => this.handleResize());
        window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        
        // Intersection Observer for performance optimization
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                this.isVisible = entry.isIntersecting;
            });
        });
        
        observer.observe(this.container);
    }
    
    handleResize() {
        this.resizeCanvas();
        this.createParticles();
    }
    
    handleMouseMove(e) {
        const rect = this.container.getBoundingClientRect();
        this.mousePosition.x = e.clientX - rect.left;
        this.mousePosition.y = e.clientY - rect.top;
    }
    
    updateParticles() {
        this.particles.forEach(particle => {
            // Update position
            particle.x += particle.vx;
            particle.y += particle.vy;
            
            // Wrap around edges
            if (particle.x < 0) particle.x = this.canvas.width;
            if (particle.x > this.canvas.width) particle.x = 0;
            if (particle.y < 0) particle.y = this.canvas.height;
            if (particle.y > this.canvas.height) particle.y = 0;
            
            // Mouse interaction
            const dx = this.mousePosition.x - particle.x;
            const dy = this.mousePosition.y - particle.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < this.config.mouseInteractionDistance) {
                const force = (this.config.mouseInteractionDistance - distance) / this.config.mouseInteractionDistance;
                particle.vx += (dx / distance) * force * 0.01;
                particle.vy += (dy / distance) * force * 0.01;
                particle.size = particle.originalSize * (1 + force * 0.5);
            } else {
                particle.size += (particle.originalSize - particle.size) * 0.1;
                particle.vx *= 0.99;
                particle.vy *= 0.99;
            }
            
            // Pulse effect
            particle.pulse += 0.02;
            particle.opacity = 0.3 + Math.sin(particle.pulse) * 0.2;
        });
    }
    
    drawParticles() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw connections
        this.particles.forEach((particle, i) => {
            for (let j = i + 1; j < this.particles.length; j++) {
                const other = this.particles[j];
                const dx = particle.x - other.x;
                const dy = particle.y - other.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < this.config.connectionDistance) {
                    const opacity = (this.config.connectionDistance - distance) / this.config.connectionDistance;
                    this.ctx.strokeStyle = `rgba(141, 73, 253, ${opacity * 0.2})`;
                    this.ctx.lineWidth = 1;
                    this.ctx.beginPath();
                    this.ctx.moveTo(particle.x, particle.y);
                    this.ctx.lineTo(other.x, other.y);
                    this.ctx.stroke();
                }
            }
        });
        
        // Draw particles
        this.particles.forEach(particle => {
            this.ctx.save();
            this.ctx.globalAlpha = particle.opacity;
            this.ctx.fillStyle = particle.color;
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = particle.color;
            this.ctx.beginPath();
            this.ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        });
    }
    
    animate() {
        if (this.isVisible) {
            this.updateParticles();
            this.drawParticles();
        }
        
        this.animationId = requestAnimationFrame(() => this.animate());
    }
    
    destroy() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
    }
}

// Initialize particles when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const particlesContainer = document.getElementById('enhancedParticles');
    if (particlesContainer) {
        window.enhancedParticles = new EnhancedParticles('enhancedParticles');
    }
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EnhancedParticles;
}