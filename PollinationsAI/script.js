document.addEventListener('DOMContentLoaded', function () {
    // Mobile menu toggle
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const navbar = document.querySelector('.navbar');

    mobileMenuBtn.addEventListener('click', function () {
        navbar.classList.toggle('mobile-menu-active');
    });

    // Close mobile menu when clicking outside
    document.addEventListener('click', function (event) {
        if (!navbar.contains(event.target) && navbar.classList.contains('mobile-menu-active')) {
            navbar.classList.remove('mobile-menu-active');
        }
    });

    // Dropdown hover effect for desktop
    const dropdowns = document.querySelectorAll('.dropdown');

    dropdowns.forEach(dropdown => {
        dropdown.addEventListener('mouseenter', function () {
            if (window.innerWidth > 768) {
                const dropdownContent = this.querySelector('.dropdown-content');
                dropdownContent.style.display = 'block';
                setTimeout(() => {
                    dropdownContent.style.opacity = '1';
                }, 10);
            }
        });

        dropdown.addEventListener('mouseleave', function () {
            if (window.innerWidth > 768) {
                const dropdownContent = this.querySelector('.dropdown-content');
                dropdownContent.style.opacity = '0';
                setTimeout(() => {
                    dropdownContent.style.display = 'none';
                }, 300);
            }
        });

        // For mobile - toggle dropdown on click
        dropdown.addEventListener('click', function (e) {
            if (window.innerWidth <= 768) {
                e.preventDefault();
                const dropdownContent = this.querySelector('.dropdown-content');
                if (dropdownContent.style.display === 'block') {
                    dropdownContent.style.opacity = '0';
                    setTimeout(() => {
                        dropdownContent.style.display = 'none';
                    }, 300);
                } else {
                    dropdownContent.style.display = 'block';
                    setTimeout(() => {
                        dropdownContent.style.opacity = '1';
                    }, 10);
                }
            }
        });
    });

    // Add subtle parallax effect to hero section
    const hero = document.querySelector('.hero');

    window.addEventListener('scroll', function () {
        const scrollPosition = window.scrollY;
        if (scrollPosition < 500) {
            hero.style.transform = `translateY(${scrollPosition * 0.1}px)`;
        }
    });

    // Animate feature cards on scroll
    const featureCards = document.querySelectorAll('.feature-card');

    // Check if element is in viewport
    function isInViewport(element) {
        const rect = element.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
    }

    // Add animation to elements in viewport
    function animateOnScroll() {
        featureCards.forEach((card, index) => {
            if (isInViewport(card)) {
                setTimeout(() => {
                    card.style.opacity = '1';
                    card.style.transform = 'translateY(0)';
                }, index * 100);
            }
        });
    }

    // Set initial state for animation
    featureCards.forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    });

    // Run animation on load and scroll
    window.addEventListener('load', animateOnScroll);
    window.addEventListener('scroll', animateOnScroll);

    // Add hover effect to navbar
    const navItems = document.querySelectorAll('.nav-item a');

    navItems.forEach(item => {
        item.addEventListener('mouseenter', function () {
            this.style.transition = 'all 0.3s ease';
        });
    });
});