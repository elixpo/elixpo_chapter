// Enhanced Interactions System for Elixpo Art Landing Page

class EnhancedInteractions {
    constructor() {
        this.init();
    }
    
    init() {
        this.initButtonRedirects();
        this.initKeyboardNavigation();
        this.initAccessibilityFeatures();
        this.initTooltips();
        this.initImageInteractions();
        this.initFormInteractions();
    }
    
    initButtonRedirects() {
        // Main CTA buttons
        const createArtCTA = document.getElementById('createArtCTA');
        const exploreCTA = document.getElementById('exploreCTA');
        
        if (createArtCTA) {
            createArtCTA.addEventListener('click', () => {
                this.handleRedirect('./src/create/', 'create-art');
            });
        }
        
        if (exploreCTA) {
            exploreCTA.addEventListener('click', () => {
                this.handleRedirect('./src/gallery/', 'explore-gallery');
            });
        }
        
        // Ecosystem buttons
        const discordBtn = document.getElementById('discordBotRedirect');
        const chromeBtn = document.getElementById('chromeExtensionRedirect');
        const apiBtn = document.getElementById('apiRedirect');
        
        if (discordBtn) {
            discordBtn.addEventListener('click', () => {
                this.handleRedirect('../jackey.elixpo/', 'discord-bot');
            });
        }
        
        if (chromeBtn) {
            chromeBtn.addEventListener('click', () => {
                this.handleRedirect('../elixpo-art-chrome-extension/', 'chrome-extension');
            });
        }
        
        if (apiBtn) {
            apiBtn.addEventListener('click', () => {
                this.handleRedirect('../blogs.elixpo/', 'api-docs');
            });
        }
    }
    
    handleRedirect(url, eventName) {
        // Analytics tracking (if available)
        if (typeof gtag !== 'undefined') {
            gtag('event', 'click', {
                event_category: 'navigation',
                event_label: eventName,
                value: 1
            });
        }
        
        // Add loading state
        const button = event.target.closest('button') || event.target.closest('a');
        if (button) {
            this.addLoadingState(button);
        }
        
        // Delay navigation slightly for better UX
        setTimeout(() => {
            window.location.href = url;
        }, 150);
    }
    
    addLoadingState(button) {
        const originalContent = button.innerHTML;
        button.classList.add('loading');
        button.disabled = true;
        
        // Add loading spinner
        const spinner = document.createElement('div');
        spinner.innerHTML = '<i class="bx bx-loader-alt bx-spin"></i>';
        button.innerHTML = '';
        button.appendChild(spinner);
        
        // Restore original state after navigation starts
        setTimeout(() => {
            button.innerHTML = originalContent;
            button.classList.remove('loading');
            button.disabled = false;
        }, 300);
    }
    
    initKeyboardNavigation() {
        // Enhanced keyboard navigation
        document.addEventListener('keydown', (e) => {
            switch (e.key) {
                case 'Escape':
                    this.handleEscapeKey();
                    break;
                case 'Tab':
                    this.handleTabNavigation(e);
                    break;
                case 'Enter':
                case ' ':
                    this.handleEnterSpace(e);
                    break;
            }
        });
    }
    
    handleEscapeKey() {
        // Close any open modals or menus
        const activeModal = document.querySelector('.modal.active');
        const activeMobileMenu = document.querySelector('.nav-mobile.active');
        
        if (activeModal) {
            activeModal.classList.remove('active');
        }
        
        if (activeMobileMenu && window.enhancedNavigation) {
            window.enhancedNavigation.closeMobileMenu();
        }
    }
    
    handleTabNavigation(e) {
        // Ensure tab navigation stays within visible content
        const focusableElements = document.querySelectorAll(`
            a[href]:not([disabled]),
            button:not([disabled]),
            textarea:not([disabled]),
            input:not([disabled]),
            select:not([disabled]),
            [tabindex]:not([tabindex="-1"])
        `);
        
        const visibleElements = Array.from(focusableElements).filter(el => {
            return el.offsetParent !== null && !el.disabled;
        });
        
        if (visibleElements.length === 0) return;
        
        const firstElement = visibleElements[0];
        const lastElement = visibleElements[visibleElements.length - 1];
        
        if (e.shiftKey && document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
        }
    }
    
    handleEnterSpace(e) {
        const target = e.target;
        
        // Handle custom interactive elements
        if (target.classList.contains('feature-card') || 
            target.classList.contains('ecosystem-card')) {
            e.preventDefault();
            this.handleCardInteraction(target);
        }
    }
    
    handleCardInteraction(card) {
        // Add interactive feedback
        card.style.transform = 'scale(0.98)';
        
        setTimeout(() => {
            card.style.transform = '';
        }, 150);
        
        // Find and trigger associated button if exists
        const button = card.querySelector('button') || card.querySelector('a');
        if (button) {
            button.click();
        }
    }
    
    initAccessibilityFeatures() {
        // Add ARIA labels and roles where needed
        this.enhanceAccessibility();
        
        // High contrast mode detection
        if (window.matchMedia('(prefers-contrast: high)').matches) {
            document.body.classList.add('high-contrast');
        }
        
        // Reduced motion detection
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            document.body.classList.add('reduced-motion');
        }
        
        // Focus management
        this.initFocusManagement();
    }
    
    enhanceAccessibility() {
        // Add skip link for keyboard users
        const skipLink = document.createElement('a');
        skipLink.href = '#main-content';
        skipLink.textContent = 'Skip to main content';
        skipLink.className = 'skip-link sr-only';
        skipLink.style.cssText = `
            position: absolute;
            top: -40px;
            left: 6px;
            background: var(--color-primary);
            color: white;
            padding: 8px;
            text-decoration: none;
            border-radius: 4px;
            z-index: 1000;
            transition: top 0.3s;
        `;
        
        skipLink.addEventListener('focus', () => {
            skipLink.style.top = '6px';
        });
        
        skipLink.addEventListener('blur', () => {
            skipLink.style.top = '-40px';
        });
        
        document.body.insertBefore(skipLink, document.body.firstChild);
        
        // Add main content landmark
        const heroSection = document.querySelector('.hero-section');
        if (heroSection && !document.getElementById('main-content')) {
            heroSection.id = 'main-content';
            heroSection.setAttribute('role', 'main');
        }
        
        // Enhance card accessibility
        const cards = document.querySelectorAll('.feature-card, .ecosystem-card');
        cards.forEach((card, index) => {
            if (!card.getAttribute('tabindex')) {
                card.setAttribute('tabindex', '0');
                card.setAttribute('role', 'article');
                
                const title = card.querySelector('h3');
                if (title) {
                    card.setAttribute('aria-labelledby', `card-title-${index}`);
                    title.id = `card-title-${index}`;
                }
            }
        });
    }
    
    initFocusManagement() {
        // Focus visible indicator enhancement
        const style = document.createElement('style');
        style.textContent = `
            .focus-visible,
            *:focus-visible {
                outline: 2px solid var(--color-primary) !important;
                outline-offset: 2px !important;
            }
            
            .focus-visible {
                box-shadow: 0 0 0 4px rgba(141, 73, 253, 0.3) !important;
            }
        `;
        document.head.appendChild(style);
        
        // Add focus-visible polyfill behavior
        document.addEventListener('keydown', () => {
            document.body.classList.add('keyboard-navigation');
        });
        
        document.addEventListener('mousedown', () => {
            document.body.classList.remove('keyboard-navigation');
        });
    }
    
    initTooltips() {
        const elementsWithTooltips = document.querySelectorAll('[data-tooltip]');
        
        elementsWithTooltips.forEach(element => {
            this.createTooltip(element);
        });
    }
    
    createTooltip(element) {
        const tooltipText = element.getAttribute('data-tooltip');
        const tooltip = document.createElement('div');
        tooltip.className = 'tooltip';
        tooltip.textContent = tooltipText;
        tooltip.style.cssText = `
            position: absolute;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 14px;
            pointer-events: none;
            opacity: 0;
            transform: translateY(10px);
            transition: all 0.3s ease;
            z-index: 1000;
            white-space: nowrap;
        `;
        
        document.body.appendChild(tooltip);
        
        const showTooltip = (e) => {
            const rect = element.getBoundingClientRect();
            tooltip.style.left = rect.left + rect.width / 2 - tooltip.offsetWidth / 2 + 'px';
            tooltip.style.top = rect.top - tooltip.offsetHeight - 10 + 'px';
            tooltip.style.opacity = '1';
            tooltip.style.transform = 'translateY(0)';
        };
        
        const hideTooltip = () => {
            tooltip.style.opacity = '0';
            tooltip.style.transform = 'translateY(10px)';
        };
        
        element.addEventListener('mouseenter', showTooltip);
        element.addEventListener('mouseleave', hideTooltip);
        element.addEventListener('focus', showTooltip);
        element.addEventListener('blur', hideTooltip);
    }
    
    initImageInteractions() {
        const showcaseImage = document.querySelector('.showcase-img');
        
        if (showcaseImage) {
            // Add loading state
            showcaseImage.addEventListener('load', () => {
                showcaseImage.classList.add('loaded');
            });
            
            // Add click interaction for fullscreen view
            showcaseImage.addEventListener('click', () => {
                this.openImageModal(showcaseImage.src);
            });
            
            // Add keyboard interaction
            showcaseImage.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.openImageModal(showcaseImage.src);
                }
            });
        }
    }
    
    openImageModal(imageSrc) {
        const modal = document.createElement('div');
        modal.className = 'image-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        
        const img = document.createElement('img');
        img.src = imageSrc;
        img.style.cssText = `
            max-width: 90%;
            max-height: 90%;
            object-fit: contain;
            border-radius: 12px;
        `;
        
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '&times;';
        closeBtn.style.cssText = `
            position: absolute;
            top: 20px;
            right: 20px;
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            font-size: 24px;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            cursor: pointer;
            backdrop-filter: blur(10px);
        `;
        
        modal.appendChild(img);
        modal.appendChild(closeBtn);
        document.body.appendChild(modal);
        
        // Animate in
        setTimeout(() => {
            modal.style.opacity = '1';
        }, 10);
        
        // Close handlers
        const closeModal = () => {
            modal.style.opacity = '0';
            setTimeout(() => {
                document.body.removeChild(modal);
            }, 300);
        };
        
        closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeModal();
        });
    }
    
    initFormInteractions() {
        // Enhanced form interactions for future contact forms
        const forms = document.querySelectorAll('form');
        
        forms.forEach(form => {
            const inputs = form.querySelectorAll('input, textarea, select');
            
            inputs.forEach(input => {
                this.enhanceFormField(input);
            });
        });
    }
    
    enhanceFormField(field) {
        // Add floating label effect
        const wrapper = document.createElement('div');
        wrapper.className = 'form-field-wrapper';
        field.parentNode.insertBefore(wrapper, field);
        wrapper.appendChild(field);
        
        // Add validation feedback
        field.addEventListener('blur', () => {
            this.validateField(field);
        });
        
        field.addEventListener('input', () => {
            this.clearValidationFeedback(field);
        });
    }
    
    validateField(field) {
        const isValid = field.checkValidity();
        field.classList.toggle('valid', isValid);
        field.classList.toggle('invalid', !isValid);
        
        return isValid;
    }
    
    clearValidationFeedback(field) {
        field.classList.remove('valid', 'invalid');
    }
}

// Initialize interactions when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.enhancedInteractions = new EnhancedInteractions();
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EnhancedInteractions;
}