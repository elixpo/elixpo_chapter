document.addEventListener('DOMContentLoaded', function () {
    const bellIcon = document.querySelector('.bell-icon');
    const notificationsPanel = document.getElementById('notificationsPanel');
    const closeButton = document.querySelector('.close-button');

    // Add this near the top of your existing code
    const searchContainer = document.querySelector('.search-container');
    const searchInput = document.querySelector('.search-input');

    // Handle search input focus
    searchInput.addEventListener('focus', function () {
        searchContainer.classList.add('expanded');
    });

    // Close search suggestions when clicking outside
    document.addEventListener('click', function (e) {
        if (!searchContainer.contains(e.target)) {
            searchContainer.classList.remove('expanded');
        }
    });

    // Handle trending item clicks
    document.querySelectorAll('.trending-item').forEach(item => {
        item.addEventListener('click', function () {
            searchInput.value = this.querySelector('span').textContent;
        });
    });

    // Toggle notifications panel when bell icon is clicked
    bellIcon.addEventListener('click', function (e) {
        e.stopPropagation();
        if (notificationsPanel.style.display === 'block') {
            notificationsPanel.style.display = 'none';
        } else {
            notificationsPanel.style.display = 'block';
        }
    });

    // Close notifications panel when close button is clicked
    closeButton.addEventListener('click', function () {
        notificationsPanel.style.display = 'none';
    });

    // Close notifications panel when clicking outside
    document.addEventListener('click', function (e) {
        if (notificationsPanel.style.display === 'block' &&
            !notificationsPanel.contains(e.target) &&
            e.target !== bellIcon) {
            notificationsPanel.style.display = 'none';
        }
    });

    // Switch between tabs
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', function () {
            tabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
        });
    });

    const seeMoreLink = document.querySelector('.see-more');
    const additionalTopics = document.querySelectorAll('.additional-topic');

    seeMoreLink.addEventListener('click', function (e) {
        e.preventDefault();
        additionalTopics.forEach(topic => {
            if (topic.style.display === 'none' || topic.style.display === '') {
                topic.style.display = 'inline-block';
                seeMoreLink.textContent = 'See less';
            } else {
                topic.style.display = 'none';
                seeMoreLink.textContent = 'See more';
            }
        });
    });

    const profileIcon = document.querySelector('.profile-icon');
    const profileDropdown = document.getElementById('profileDropdown');

    // Toggle profile dropdown when profile icon is clicked
    profileIcon.addEventListener('click', function (e) {
        e.stopPropagation();
        if (profileDropdown.style.display === 'block') {
            profileDropdown.style.display = 'none';
        } else {
            profileDropdown.style.display = 'block';
            notificationsPanel.style.display = 'none'; // Close notifications if open
        }
    });

    // Close profile dropdown when clicking outside
    document.addEventListener('click', function (e) {
        if (profileDropdown.style.display === 'block' &&
            !profileDropdown.contains(e.target) &&
            e.target !== profileIcon) {
            profileDropdown.style.display = 'none';
        }
    });

    // Handle three-dots dropdown
    document.querySelectorAll('.bi-three-dots').forEach(icon => {
        icon.addEventListener('click', function (e) {
            e.stopPropagation();
            const dropdown = this.closest('.article-actions').querySelector('.article-options-dropdown');

            // Close all other dropdowns first
            document.querySelectorAll('.article-options-dropdown').forEach(d => {
                if (d !== dropdown) d.style.display = 'none';
            });

            // Toggle current dropdown
            dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
        });
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', function (e) {
        if (!e.target.closest('.article-actions')) {
            document.querySelectorAll('.article-options-dropdown').forEach(d => {
                d.style.display = 'none';
            });
        }
    });

    // Navigation tabs scrolling functionality
    const tabsContainer = document.querySelector('.nav-tabs');
    const leftButton = document.querySelector('.scroll-button.left');
    const rightButton = document.querySelector('.scroll-button.right');

    function updateScrollButtons() {
        const isScrollable = tabsContainer.scrollWidth > tabsContainer.clientWidth;
        const isAtStart = tabsContainer.scrollLeft <= 0;
        const isAtEnd = tabsContainer.scrollLeft >= (tabsContainer.scrollWidth - tabsContainer.clientWidth);

        leftButton.classList.toggle('hidden', isAtStart || !isScrollable);
        rightButton.classList.toggle('hidden', isAtEnd || !isScrollable);
    }

    function scrollTabs(direction) {
        const scrollAmount = tabsContainer.clientWidth / 2;
        tabsContainer.scrollBy({
            left: direction === 'left' ? -scrollAmount : scrollAmount,
            behavior: 'smooth'
        });
    }

    leftButton.addEventListener('click', () => scrollTabs('left'));
    rightButton.addEventListener('click', () => scrollTabs('right'));

    // Update buttons on scroll
    tabsContainer.addEventListener('scroll', updateScrollButtons);

    // Update buttons on resize
    window.addEventListener('resize', updateScrollButtons);

    // Initial check
    updateScrollButtons();

    // Make tabs clickable
    const navButtons = tabsContainer.querySelectorAll('button:not(.icon-btn)');
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            navButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
        });
    });

    // Author card follow button functionality
    document.querySelectorAll('.author-card-follow').forEach(button => {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            button.classList.toggle('following');
            button.textContent = button.classList.contains('following') ? 'Following' : 'Follow';
        });
    });

    // Scroll to top functionality
    const scrollToTopButton = document.querySelector('.scroll-to-top');

    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
            scrollToTopButton.classList.add('show');
        } else {
            scrollToTopButton.classList.remove('show');
        }
    });

    scrollToTopButton.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });

    // Add this to your existing DOMContentLoaded listener
    const plusIcon = document.querySelector('.icon-btn');
    const recommendationsCard = document.querySelector('.recommendations-card');

    plusIcon.addEventListener('click', function (e) {
        e.stopPropagation();
        recommendationsCard.style.display = recommendationsCard.style.display === 'block' ? 'none' : 'block';
    });

    document.addEventListener('click', function (e) {
        if (!recommendationsCard.contains(e.target) && !plusIcon.contains(e.target)) {
            recommendationsCard.style.display = 'none';
        }
    });

    // Handle tab switching
    const recTabs = document.querySelectorAll('.rec-tab');
    recTabs.forEach(tab => {
        tab.addEventListener('click', function () {
            recTabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // Handle follow buttons
    const followButtons = document.querySelectorAll('.follow-btn');
    followButtons.forEach(button => {
        // Set initial text to "Following" for buttons in following-section
        if (button.closest('#following-section')) {
            button.textContent = 'Following';
            button.classList.add('following');
        }

        button.addEventListener('click', function () {
            this.classList.toggle('following');
            this.textContent = this.classList.contains('following') ? 'Following' : 'Follow';
        });
    });

    // Create and append overlay
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    document.body.appendChild(overlay);

    // Plus icon click handling
    plusIcon.addEventListener('click', function (e) {
        e.stopPropagation();
        overlay.style.display = 'block';
        recommendationsCard.style.display = 'block';
        document.body.style.overflow = 'hidden'; // Prevent scrolling
        assignRandomColors(); // Add this line
    });

    // Close on overlay click
    overlay.addEventListener('click', function () {
        closeRecommendations();
    });

    // Close on ESC key
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            closeRecommendations();
        }
    });

    function closeRecommendations() {
        overlay.style.display = 'none';
        recommendationsCard.style.display = 'none';
        document.body.style.overflow = ''; // Restore scrolling
    }

    // Prevent closing when clicking inside the card
    recommendationsCard.addEventListener('click', function (e) {
        e.stopPropagation();
    });

    // Handle tab switching and section toggling
    recTabs.forEach(tab => {
        tab.addEventListener('click', function () {
            // Remove active class from all tabs
            recTabs.forEach(t => t.classList.remove('active'));
            // Add active class to clicked tab
            this.classList.add('active');

            // Get the sections
            const suggestionsSection = document.getElementById('suggestion-section');
            const followingSection = document.getElementById('following-section');

            // Toggle sections based on clicked tab
            if (this.textContent === 'Following') {
                suggestionsSection.style.display = 'none';
                followingSection.style.display = 'block';
            } else {
                suggestionsSection.style.display = 'block';
                followingSection.style.display = 'none';
            }
        });
    });

    // Add this after the DOMContentLoaded event starts
    function assignRandomColors() {
        const avatars = document.querySelectorAll('.writer-avatar');
        avatars.forEach((avatar, index) => {
            const colorIndex = (index % 10) + 1; // Cycle through 10 colors
            avatar.classList.add(`color-${colorIndex}`);
        });
    }

    // Update the tab switching logic
    recTabs.forEach(tab => {
        tab.addEventListener('click', function () {
            recTabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');

            // Get all sections
            const suggestionsSection = document.getElementById('suggestion-section');
            const followingSection = document.getElementById('following-section');
            const readingSection = document.getElementById('reading-section');

            // Hide all sections first
            [suggestionsSection, followingSection, readingSection].forEach(section => {
                section.style.display = 'none';
            });

            // Show the selected section
            if (this.textContent === 'Following') {
                followingSection.style.display = 'block';
            } else if (this.textContent === 'Reading History') {
                readingSection.style.display = 'block';
            } else {
                suggestionsSection.style.display = 'block';
            }
        });
    });

    recTabs.forEach(tab => {
        tab.addEventListener('click', function () {
            // Remove active class from all tabs
            recTabs.forEach(t => t.classList.remove('active'));
            // Add active class to clicked tab
            this.classList.add('active');

            // Get all sections
            const suggestionsSection = document.getElementById('suggestion-section');
            const followingSection = document.getElementById('following-section');
            const readingSection = document.getElementById('reading-section');

            // First hide all sections
            [suggestionsSection, followingSection, readingSection].forEach(section => {
                if (section) section.style.display = 'none';
            });

            // Show the selected section
            switch (this.textContent.trim()) {
                case 'Following':
                    followingSection.style.display = 'block';
                    break;
                case 'Reading History':
                    readingSection.style.display = 'block';
                    break;
                case 'Suggestions':
                    suggestionsSection.style.display = 'block';
                    break;
                default:
                    suggestionsSection.style.display = 'block';
            }
        });
    });

    // Initialize the scroll animations for topic items
    const topicItems = document.querySelectorAll('.topic-item');
    topicItems.forEach(item => {
        item.addEventListener('mouseenter', () => {
            gsap.to(item, {
                y: -5,
                duration: 0.2,
                ease: 'power2.out'
            });
        });

        item.addEventListener('mouseleave', () => {
            gsap.to(item, {
                y: 0,
                duration: 0.2,
                ease: 'power2.out'
            });
        });
    });

    // Add close icon click handler
    const closeIcon = document.querySelector('.recommendations-card .close-icon');
    if (closeIcon) {
        closeIcon.addEventListener('click', closeRecommendations);
    }
});

// Editor functionality
document.addEventListener('DOMContentLoaded', function () {
    const writeButton = document.querySelector('.bi-box-arrow-in-down-left').parentElement;
    const editor = document.querySelector('.floating-editor');

    writeButton.addEventListener('click', () => {
        editor.style.display = 'flex';
    });

    // Editor controls
    const expandBtn = editor.querySelector('.expand');
    const closeBtn = editor.querySelector('.close');

    expandBtn.addEventListener('click', () => {
        editor.classList.toggle('expanded');
    });

    closeBtn.addEventListener('click', () => {
        editor.style.display = 'none';
    });

    // Formatting buttons
    const formatButtons = editor.querySelectorAll('.format-btn');
    formatButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const format = btn.dataset.format;
            document.execCommand(format, false, null);
            btn.classList.toggle('active');
        });
    });

    // Handle drag functionality
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    const editorHeader = editor.querySelector('.editor-header');

    editorHeader.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);

    function dragStart(e) {
        if (!editor.classList.contains('expanded')) {
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;

            if (e.target === editorHeader) {
                isDragging = true;
            }
        }
    }

    function drag(e) {
        if (isDragging) {
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;

            xOffset = currentX;
            yOffset = currentY;

            setTranslate(currentX, currentY, editor);
        }
    }

    function setTranslate(xPos, yPos, el) {
        el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
    }

    function dragEnd() {
        initialX = currentX;
        initialY = currentY;
        isDragging = false;
    }
});