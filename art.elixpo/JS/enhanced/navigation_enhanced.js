// Enhanced Navigation System for Elixpo Art Landing Page

class EnhancedNavigation {
    constructor() {
        this.nav = document.getElementById('enhancedNav');
        this.navToggle = null;
        this.navMobile = null;
        this.navLinks = [];
        this.isScrolled = false;
        this.isMobileMenuOpen = false;
        this.scrollThreshold = 100;
        
        this.init();
    }
    
    init() {
        this.createMobileElements();
        this.bindEvents();
        this.handleScroll();
        this.initSmoothScrolling();
    }
    
    createMobileElements() {
        // Create mobile toggle button
        this.navToggle = document.createElement('button');
        this.navToggle.className = 'nav-toggle';
        this.navToggle.innerHTML = `
            <div class="nav-toggle-line"></div>
            <div class="nav-toggle-line"></div>
            <div class="nav-toggle-line"></div>
        `;
        
        // Create mobile menu
        this.navMobile = document.createElement('div');
        this.navMobile.className = 'nav-mobile';
        this.navMobile.innerHTML = `
            <div class="nav-mobile-content">
                <div class="nav-mobile-links">
                    <a href="#home" class="nav-mobile-link active">Home</a>
                    <a href="#features" class="nav-mobile-link">Features</a>
                    <a href="#showcase" class="nav-mobile-link">Gallery</a>
                    <a href="#about" class="nav-mobile-link">About</a>
                </div>
                <div class="nav-mobile-actions">
                    <button class="nav-btn nav-btn-secondary" id="mobileVisitBlog">Blog</button>
                    <button class="nav-btn nav-btn-primary" id="mobileGetStarted">Get Started</button>
                </div>
            </div>
        `;
        
        // Insert mobile elements
        const navContainer = this.nav.querySelector('.nav-container');
        navContainer.appendChild(this.navToggle);
        document.body.appendChild(this.navMobile);
        
        // Get all nav links
        this.navLinks = [
            ...document.querySelectorAll('.nav-link'),
            ...document.querySelectorAll('.nav-mobile-link')
        ];
    }
    
    bindEvents() {
        // Scroll event for navbar styling
        window.addEventListener('scroll', () => this.handleScroll());
        
        // Mobile toggle
        this.navToggle.addEventListener('click', () => this.toggleMobileMenu());
        
        // Close mobile menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.nav.contains(e.target) && !this.navMobile.contains(e.target)) {
                this.closeMobileMenu();
            }
        });
        
        // Close mobile menu on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isMobileMenuOpen) {
                this.closeMobileMenu();
            }
        });
        
        // Navigation link clicks
        this.navLinks.forEach(link => {
            link.addEventListener('click', (e) => this.handleNavClick(e, link));
        });
        
        // Button redirects
        this.bindButtonEvents();
        
        // Resize event
        window.addEventListener('resize', () => this.handleResize());
    }
    
    bindButtonEvents() {
        const buttons = [
            { id: 'visitBlog', redirect: '#blog' },
            { id: 'getStarted', redirect: '#create' },
            { id: 'mobileVisitBlog', redirect: '#blog' },
            { id: 'mobileGetStarted', redirect: '#create' }
        ];
        
        buttons.forEach(({ id, redirect }) => {
            const button = document.getElementById(id);
            if (button) {
                button.addEventListener('click', () => {
                    this.handleRedirect(redirect);
                    if (this.isMobileMenuOpen) {
                        this.closeMobileMenu();
                    }
                });
            }
        });
    }
    
    handleScroll() {
        const scrollY = window.scrollY;
        const shouldAddScrolled = scrollY > this.scrollThreshold;
        
        if (shouldAddScrolled !== this.isScrolled) {
            this.isScrolled = shouldAddScrolled;
            this.nav.classList.toggle('scrolled', this.isScrolled);
        }
        
        // Update active nav link based on scroll position
        this.updateActiveNavLink();
    }
    
    updateActiveNavLink() {
        const sections = ['home', 'features', 'showcase', 'about'];
        const scrollPosition = window.scrollY + 100;
        
        let activeSection = 'home';
        
        sections.forEach(sectionId => {
            const element = document.getElementById(sectionId) || 
                           document.querySelector(`[data-section="${sectionId}"]`) ||
                           document.querySelector(`.${sectionId}-section`);
            
            if (element) {
                const rect = element.getBoundingClientRect();
                const elementTop = rect.top + window.scrollY;
                
                if (scrollPosition >= elementTop - 100) {
                    activeSection = sectionId;
                }
            }
        });
        
        // Update active class on nav links
        this.navLinks.forEach(link => {
            const href = link.getAttribute('href');
            const isActive = href === `#${activeSection}`;
            link.classList.toggle('active', isActive);
        });
    }
    
    handleNavClick(e, link) {
        e.preventDefault();
        
        const href = link.getAttribute('href');
        if (href.startsWith('#')) {
            this.scrollToSection(href.substring(1));
        } else {
            this.handleRedirect(href);
        }
        
        // Close mobile menu if open
        if (this.isMobileMenuOpen) {
            this.closeMobileMenu();
        }
    }
    
    scrollToSection(sectionId) {
        let targetElement = document.getElementById(sectionId);
        
        // Fallback selectors
        if (!targetElement) {
            targetElement = document.querySelector(`[data-section="${sectionId}"]`) ||
                           document.querySelector(`.${sectionId}-section`);
        }
        
        // Handle special cases
        if (sectionId === 'home') {
            targetElement = document.querySelector('.hero-section') || document.body;
        } else if (sectionId === 'features') {
            targetElement = document.querySelector('.features-section');
        } else if (sectionId === 'showcase') {
            targetElement = document.querySelector('.ecosystem-section');
        }
        
        if (targetElement) {
            const navHeight = this.nav.offsetHeight;
            const targetPosition = targetElement.offsetTop - navHeight - 20;
            
            window.scrollTo({
                top: Math.max(0, targetPosition),
                behavior: 'smooth'
            });
        }
    }
    
    handleRedirect(url) {
        if (url.startsWith('#')) {
            this.scrollToSection(url.substring(1));
        } else {
            // Handle external redirects based on existing redirect logic
            if (url.includes('create') || url.includes('#create')) {
                window.location.href = './src/create/';
            } else if (url.includes('blog') || url.includes('#blog')) {
                window.location.href = '../blogs.elixpo/';
            } else {
                window.location.href = url;
            }
        }
    }
    
    toggleMobileMenu() {
        this.isMobileMenuOpen = !this.isMobileMenuOpen;
        this.navToggle.classList.toggle('active', this.isMobileMenuOpen);
        this.navMobile.classList.toggle('active', this.isMobileMenuOpen);
        
        // Prevent body scroll when menu is open
        document.body.style.overflow = this.isMobileMenuOpen ? 'hidden' : '';
    }
    
    closeMobileMenu() {
        this.isMobileMenuOpen = false;
        this.navToggle.classList.remove('active');
        this.navMobile.classList.remove('active');
        document.body.style.overflow = '';
    }
    
    handleResize() {
        // Close mobile menu on resize to desktop
        if (window.innerWidth >= 768 && this.isMobileMenuOpen) {
            this.closeMobileMenu();
        }
    }
    
    initSmoothScrolling() {
        // Enhanced smooth scrolling for better UX
        const links = document.querySelectorAll('a[href^="#"]');
        
        links.forEach(link => {
            link.addEventListener('click', (e) => {
                const href = link.getAttribute('href');
                if (href !== '#' && href.length > 1) {
                    e.preventDefault();
                    this.scrollToSection(href.substring(1));
                }
            });
        });
    }
}

// Initialize navigation when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.enhancedNavigation = new EnhancedNavigation();
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EnhancedNavigation;
}