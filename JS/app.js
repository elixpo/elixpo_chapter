// Discord Bot Landing Page functionality
document.addEventListener('DOMContentLoaded', () => {
    window.currentChatId = null;
    const DISCORD_INVITE_URL = 'https://discord.com/oauth2/authorize?client_id=1214916249222643752';
    
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    const closeMobileMenu = document.getElementById('closeMobileMenu');
    const mobileInviteBtn = document.getElementById('mobileInviteBtn');
    
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            mobileMenu.classList.add('show');
            document.body.style.overflow = 'hidden';
        });
    }
    
    // Close mobile menu
    if (closeMobileMenu) {
        closeMobileMenu.addEventListener('click', () => {
            mobileMenu.classList.remove('show');
            document.body.style.overflow = '';
        });
    }
    

    document.querySelectorAll('.mobile-nav-link').forEach(link => {
        link.addEventListener('click', () => {
            mobileMenu.classList.remove('show');
            document.body.style.overflow = '';
        });
    });
    
    if (mobileInviteBtn) {
        mobileInviteBtn.addEventListener('click', () => {
            window.open(DISCORD_INVITE_URL, '_blank');
            mobileMenu.classList.remove('show');
            document.body.style.overflow = '';
        });
    }
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && mobileMenu.classList.contains('show')) {
            mobileMenu.classList.remove('show');
            document.body.style.overflow = '';
        }
    });
    
    
    window.addEventListener('resize', () => {
        if (window.innerWidth >= 768 && mobileMenu.classList.contains('show')) {
            mobileMenu.classList.remove('show');
            document.body.style.overflow = '';
        }
    });

    
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    
    const inviteButtons = [
        document.getElementById('inviteBtn'),
        document.getElementById('mainInviteBtn'),
        document.getElementById('finalCtaBtn')
    ];

    inviteButtons.forEach(button => {
        if (button) {
            button.addEventListener('click', () => {
                window.open(DISCORD_INVITE_URL, '_blank');

            });
        }
    });


    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    
    document.querySelectorAll('.feature-card, .pricing-card, .feature-preview-card').forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(30px)';
        card.style.transition = 'all 0.6s ease';
        observer.observe(card);
    });


    let ticking = false;
    
    function updateParallax() {
        const scrolled = window.pageYOffset;
        const parallax = document.querySelectorAll('.floating-element');
        const speed = 0.5;

        parallax.forEach(element => {
            const yPos = -(scrolled * speed);
            element.style.transform = `translateY(${yPos}px)`;
        });
        
        ticking = false;
    }

    function requestTick() {
        if (!ticking) {
            requestAnimationFrame(updateParallax);
            ticking = true;
        }
    }

    window.addEventListener('scroll', requestTick);

  
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i data-lucide="${type === 'success' ? 'check-circle' : 'info'}" class="w-5 h-5"></i>
                <span>${message}</span>
            </div>
        `;

        // Add notification styles
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#059669' : '#3b82f6'};
            color: white;
            padding: 16px 20px;
            border-radius: 12px;
            box-shadow: 0 8px 25px rgba(0,0,0,0.2);
            z-index: 1000;
            transform: translateX(100%);
            transition: transform 0.3s ease;
            max-width: 300px;
        `;

        document.body.appendChild(notification);
        
        // Initialize icons for notification
        lucide.createIcons();

        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);

        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }

    // Add loading animations
    const style = document.createElement('style');
    style.textContent = `
        .notification-content {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 500;
        }
        
        .btn-hero-primary:active {
            transform: translateY(-1px) scale(0.98);
        }
        
        .feature-card:nth-child(odd) {
            animation-delay: 0.1s;
        }
        
        .feature-card:nth-child(even) {
            animation-delay: 0.2s;
        }
        
        .pricing-card:nth-child(1) {
            animation-delay: 0.1s;
        }
        
        .pricing-card:nth-child(2) {
            animation-delay: 0.2s;
        }
        
        .pricing-card:nth-child(3) {
            animation-delay: 0.3s;
        }
    `;
    document.head.appendChild(style);
    

    // Initialize entrance animations
    setTimeout(() => {
        document.querySelectorAll('.hero-title, .hero-subtitle, .hero-badge').forEach((el, index) => {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        });
    }, 100);
});
