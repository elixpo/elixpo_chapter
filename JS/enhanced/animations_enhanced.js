// Enhanced Animations System for Elixpo Art Landing Page

class EnhancedAnimations {
    constructor() {
        this.observerConfig = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };
        
        this.animatedElements = new Set();
        this.observers = [];
        
        this.init();
    }
    
    init() {
        this.initScrollAnimations();
        this.initHeroAnimations();
        this.initButtonAnimations();
        this.initParallaxEffects();
        this.initTypewriterEffect();
    }
    
    initScrollAnimations() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !this.animatedElements.has(entry.target)) {
                    this.animateElement(entry.target);
                    this.animatedElements.add(entry.target);
                }
            });
        }, this.observerConfig);
        
        // Elements to animate on scroll
        const elementsToAnimate = document.querySelectorAll(`
            .feature-card,
            .ecosystem-card,
            .section-header,
            .hero-stats,
            .footer-content
        `);
        
        elementsToAnimate.forEach(el => {
            el.classList.add('animate-on-scroll');
            observer.observe(el);
        });
        
        this.observers.push(observer);
    }
    
    animateElement(element) {
        element.classList.add('animate');
        
        // Add staggered animation for grid items
        if (element.classList.contains('feature-card') || element.classList.contains('ecosystem-card')) {
            const siblings = Array.from(element.parentNode.children);
            const index = siblings.indexOf(element);
            element.style.animationDelay = `${index * 0.1}s`;
        }
    }
    
    initHeroAnimations() {
        // Staggered hero content animation
        const heroElements = [
            '.status-badge',
            '.hero-title',
            '.hero-description',
            '.hero-actions',
            '.hero-stats',
            '.hero-showcase'
        ];
        
        heroElements.forEach((selector, index) => {
            const element = document.querySelector(selector);
            if (element) {
                element.style.opacity = '0';
                element.style.transform = 'translateY(30px)';
                
                setTimeout(() => {
                    element.style.transition = 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)';
                    element.style.opacity = '1';
                    element.style.transform = 'translateY(0)';
                }, index * 200 + 100);
            }
        });
        
        // Floating icons animation
        this.animateFloatingIcons();
    }
    
    animateFloatingIcons() {
        const floatingIcons = document.querySelectorAll('.float-icon');
        
        floatingIcons.forEach((icon, index) => {
            const delay = index * 2000; // 2 second delay between each icon
            const duration = 6000; // 6 second animation cycle
            
            setInterval(() => {
                icon.style.transform = `translateY(-20px) scale(1.1)`;
                icon.style.boxShadow = '0 10px 30px rgba(141, 73, 253, 0.3)';
                
                setTimeout(() => {
                    icon.style.transform = `translateY(0) scale(1)`;
                    icon.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.1)';
                }, 1000);
            }, duration + delay);
        });
    }
    
    initButtonAnimations() {
        const buttons = document.querySelectorAll('.cta-button, .nav-btn, .ecosystem-btn');
        
        buttons.forEach(button => {
            // Ripple effect
            button.addEventListener('click', (e) => {
                this.createRippleEffect(e, button);
            });
            
            // Magnetic effect for primary buttons
            if (button.classList.contains('cta-primary')) {
                this.addMagneticEffect(button);
            }
        });
    }
    
    createRippleEffect(e, button) {
        const ripple = document.createElement('span');
        const rect = button.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = e.clientX - rect.left - size / 2;
        const y = e.clientY - rect.top - size / 2;
        
        ripple.style.cssText = `
            position: absolute;
            width: ${size}px;
            height: ${size}px;
            left: ${x}px;
            top: ${y}px;
            background: rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            pointer-events: none;
            transform: scale(0);
            animation: ripple 0.6s ease-out;
            z-index: 1;
        `;
        
        button.style.position = 'relative';
        button.style.overflow = 'hidden';
        button.appendChild(ripple);
        
        setTimeout(() => {
            ripple.remove();
        }, 600);
    }
    
    addMagneticEffect(button) {
        button.addEventListener('mousemove', (e) => {
            const rect = button.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;
            
            const moveX = x * 0.15;
            const moveY = y * 0.15;
            
            button.style.transform = `translate(${moveX}px, ${moveY}px)`;
        });
        
        button.addEventListener('mouseleave', () => {
            button.style.transform = 'translate(0, 0)';
        });
    }
    
    initParallaxEffects() {
        const parallaxElements = document.querySelectorAll('.decoration-orb, .showcase-background');
        
        if (parallaxElements.length > 0) {
            window.addEventListener('scroll', () => {
                const scrollY = window.scrollY;
                
                parallaxElements.forEach((element, index) => {
                    const speed = 0.5 + (index * 0.2);
                    const yPos = -(scrollY * speed);
                    element.style.transform = `translateY(${yPos}px)`;
                });
            });
        }
    }
    
    initTypewriterEffect() {
        const typewriterElements = document.querySelectorAll('[data-typewriter]');
        
        typewriterElements.forEach(element => {
            const text = element.textContent;
            const speed = parseInt(element.dataset.typewriterSpeed) || 50;
            
            element.textContent = '';
            element.style.borderRight = '2px solid currentColor';
            
            let i = 0;
            const typeWriter = () => {
                if (i < text.length) {
                    element.textContent += text.charAt(i);
                    i++;
                    setTimeout(typeWriter, speed);
                } else {
                    // Remove cursor after typing
                    setTimeout(() => {
                        element.style.borderRight = 'none';
                    }, 1000);
                }
            };
            
            // Start typewriter when element is visible
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        setTimeout(typeWriter, 500);
                        observer.unobserve(element);
                    }
                });
            });
            
            observer.observe(element);
        });
    }
    
    // Utility method to animate stats counter
    animateCounter(element, start, end, duration = 2000) {
        const increment = (end - start) / (duration / 16);
        let current = start;
        
        const timer = setInterval(() => {
            current += increment;
            if (current >= end) {
                current = end;
                clearInterval(timer);
            }
            
            element.textContent = Math.floor(current).toLocaleString();
        }, 16);
    }
    
    // Initialize number counters
    initCounters() {
        const counters = document.querySelectorAll('[data-counter]');
        
        const counterObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const element = entry.target;
                    const endValue = parseInt(element.dataset.counter);
                    this.animateCounter(element, 0, endValue);
                    counterObserver.unobserve(element);
                }
            });
        });
        
        counters.forEach(counter => {
            counterObserver.observe(counter);
        });
    }
    
    // Cleanup method
    destroy() {
        this.observers.forEach(observer => observer.disconnect());
        this.observers = [];
        this.animatedElements.clear();
    }
}

// Add CSS for ripple animation
const rippleCSS = `
@keyframes ripple {
    to {
        transform: scale(2);
        opacity: 0;
    }
}
`;

// Inject CSS
const style = document.createElement('style');
style.textContent = rippleCSS;
document.head.appendChild(style);

// Initialize animations when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.enhancedAnimations = new EnhancedAnimations();
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EnhancedAnimations;
}