
function typeMarkdownFormatted(containerId, markdown, options = {}) {
    const {
        delay = 150,
        initialDelay = 0,
        clear = true
    } = options;

    const container = document.getElementById(containerId);
    if (!container) return;

    if (clear) container.innerHTML = '';

    // Step 1: Convert Markdown → HTML
    const html = marked.parse(markdown);
    const tempWrapper = document.createElement('div');
    tempWrapper.innerHTML = html;

    // Step 2: Break into block-level elements (paragraphs, headers, etc.)
    const nodes = Array.from(tempWrapper.children);

    let index = 0;

    const revealNext = () => {
        if (index >= nodes.length) {
            clearInterval(timer);
            return;
        }

        const node = nodes[index];
        const wrapper = document.createElement('div');
        wrapper.classList.add('fadeChunk');
        wrapper.appendChild(node);
        container.appendChild(wrapper);

        // Force reflow to apply fade-in
        void wrapper.offsetWidth;
        wrapper.classList.add('visible');

        index++;
    };

    if (initialDelay > 0) {
        setTimeout(revealNext, initialDelay);
    } else {
        revealNext();
    }

    const timer = setInterval(revealNext, delay);

    return () => clearInterval(timer); // Return a cleanup function
}


function showSkeletons() {
    const elements = [
        '.location-info',
        '.weather-type',
        '.current-weather',
        '.temp-range',
        '.forecast'
    ];

    elements.forEach(sel => {
        const el = document.querySelector(sel);
        if (el) {
            el.classList.add('skeleton');
            el.textContent = '⏳';
        }
    });

    // Forecast placeholders
    const forecastContainer = document.querySelector('.forecast');
    if (forecastContainer) {
        forecastContainer.innerHTML = '';
        for (let i = 0; i < 5; i++) {
            const skeletonDay = document.createElement('div');
            skeletonDay.className = 'day skeleton';
            skeletonDay.style.height = '60px';
            forecastContainer.appendChild(skeletonDay);
        }
    }
}

function hideSkeletons() {
    document.querySelectorAll('.skeleton').forEach(el => {
        el.classList.remove('skeleton');
        el.textContent = ''; // Clear placeholder text
    });
}
