
marked.setOptions({
    breaks: true, 
    gfm: true,    
    headerIds: false,
    headerPrefix: '',
    smartLists: true,
    smartypants: true,
    xhtml: false,
    highlight: function(code, lang) {
        return `<code class="language-${lang || 'text'}">${code}</code>`;
    }
});

const queryInput = document.getElementById('queryInput');
const submitButton = document.getElementById('submitButton');
const statusMessage = document.getElementById('statusMessage');
const resultsContainer = document.getElementById('resultsContainer');
const API_SEARCH_URL = "https://search.pollinations.ai/search";


function performSearch(query) {
    if (!query.trim()) {
        showStatus('Please enter a query.', 'error');
        return;
    }

    
    showLoadingResults();
    submitButton.disabled = true;
    
    const requestBody = {
        messages: [
            { role: 'user', content: query }
        ],
    };

    fetch(API_SEARCH_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
    })
    .then(response => {
        queryInput.value = '';
        if (!response.ok) {
            return response.json().then(errData => {
                const errorMsg = errData.error || response.statusText;
                throw new Error(`HTTP ${response.status}: ${errorMsg}`);
            }).catch(() => {
                throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`);
            });
        }
        return response.json();
    })
    .then(data => {
        // console.log("Received data:", data);
        hideStatus();

        if (data.error) {
            showStatus('API Error: ' + data.error, 'error');
            showErrorResults(data.error);
        } else if (data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content !== undefined) {
            displayResults(data);
        } else {
            showStatus('Error: Unexpected response format from API.', 'error');
            showErrorResults('Received an unexpected response format from the API.');
            console.error("Unexpected API response structure:", data);
        }
    })
    .catch(error => {
        console.error('Fetch Error:', error);
        showStatus('Error: ' + error.message, 'error');
        showErrorResults(error.message);
    })
    .finally(() => {
        submitButton.disabled = false;
    });
}


function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `text-center p-4 rounded-lg ${getStatusClasses(type)}`;
    statusMessage.classList.remove('hidden');
}

function hideStatus() {
    statusMessage.classList.add('hidden');
}

function getStatusClasses(type) {
    switch (type) {
        case 'loading':
            return 'bg-blue-900/20 text-blue-300 border border-blue-800';
        case 'error':
            return 'bg-red-900/20 text-red-300 border border-red-800';
        default:
            return 'bg-gray-800 text-gray-300 border border-gray-700';
    }
}


function showLoadingResults() {
    resultsContainer.innerHTML = `
        <div class="result-card p-8 max-w-4xl mx-auto">
            <div class="flex items-center justify-center mb-6">
                <div class="relative">
                    <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                    <div class="absolute inset-0 animate-ping rounded-full h-12 w-12 border border-primary opacity-20"></div>
                </div>
            </div>
            <div class="prose prose-invert max-w-none text-center">
                <h3 class="text-2xl font-semibold mb-4 text-white">🏄‍♂️ Surfing the web...</h3>
                <p class="text-gray-300 mb-4">Crawling through multiple sources to find the best information for you</p>
                <div class="flex justify-center items-center space-x-4 text-sm text-gray-400">
                    <div class="flex items-center">
                        <div class="w-2 h-2 bg-primary rounded-full animate-pulse mr-2"></div>
                        Searching web sources
                    </div>
                    <div class="flex items-center">
                        <div class="w-2 h-2 bg-blue-400 rounded-full animate-pulse mr-2" style="animation-delay: 0.5s"></div>
                        Processing content
                    </div>
                    <div class="flex items-center">
                        <div class="w-2 h-2 bg-green-400 rounded-full animate-pulse mr-2" style="animation-delay: 1s"></div>
                        Synthesizing results
                    </div>
                </div>
                <p class="text-gray-500 text-sm mt-6">This may take a couple of minutes depending on query complexity</p>
            </div>
        </div>
    `;
}

function showErrorResults(errorMessage) {
    resultsContainer.innerHTML = `
        <div class="result-card p-8 max-w-4xl mx-auto border-red-800">
            <div class="prose prose-invert max-w-none">
                <h3 class="text-xl font-semibold mb-4 text-red-300">Error</h3>
                <p class="text-gray-300">An error occurred:</p>
                <pre class="bg-gray-800 p-4 rounded-lg text-red-300 mt-4"><code>${escapeHTML(errorMessage)}</code></pre>
            </div>
        </div>
    `;
}

function displayResults(data) {
    const markdownText = data.choices[0].message.content;
    
    
    let htmlOutput = marked.parse(markdownText);
    
    // Enhance code blocks with better formatting
    htmlOutput = htmlOutput.replace(
        /<pre><code class="language-(\w+)">([\s\S]*?)<\/code><\/pre>/g,
        '<pre><code class="language-$1">$2</code></pre>'
    );

    
    if (data.sources) {
        htmlOutput += generateSourcesHTML(data.sources);
    }

    
    if (data.images !== undefined) {
        htmlOutput += generateImagesHTML(data.images);
    }

    resultsContainer.innerHTML = `
        <div class="space-y-6">
            <div class="result-card p-8 max-w-4xl mx-auto">
                <div class="flex items-center mb-6">
                    <div class="w-3 h-3 bg-green-400 rounded-full mr-3"></div>
                    <h2 class="text-xl font-semibold text-white">Search Results</h2>
                </div>
                <div class="prose prose-invert max-w-none">
                    ${htmlOutput}
                </div>
            </div>
        </div>
    `;
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

function generateSourcesHTML(sources) {
    let sourcesHtml = '<div class="border-t border-gray-700 mt-8 pt-8"><h2 class="text-2xl font-bold mb-6 text-white">Sources</h2>';
    let hasSourcesContent = false;

    if (sources.native_knowledge && sources.native_knowledge !== 'None') {
        sourcesHtml += `<div class="mb-6"><p class="text-gray-300"><strong class="text-white">Answered Natively:</strong> ${escapeHTML(sources.native_knowledge)}</p></div>`;
        hasSourcesContent = true;
    }

    const scrapedWebsites = sources.scraped_websites ?? [];
    if (scrapedWebsites.length > 0) {
        sourcesHtml += '<div class="mb-6"><h3 class="text-xl font-semibold mb-4 text-white">Text Sources (Scraped Websites)</h3><ul class="space-y-2">';
        scrapedWebsites.forEach(url => {
            sourcesHtml += `<li class="break-all"><a href="${escapeHTML(url)}" target="_blank" class="text-primary hover:text-primaryHover transition-colors">${escapeHTML(url)}</a></li>`;
        });
        sourcesHtml += '</ul></div>';
        hasSourcesContent = true;
    }

    const processedYoutube = sources.processed_youtube ?? [];
    if (processedYoutube.length > 0) {
        sourcesHtml += '<div class="mb-6"><h3 class="text-xl font-semibold mb-4 text-white">Transcript Sources (Processed YouTube Videos)</h3><ul class="space-y-2">';
        processedYoutube.forEach(url => {
            sourcesHtml += `<li class="break-all"><a href="${escapeHTML(url)}" target="_blank" class="text-primary hover:text-primaryHover transition-colors">${escapeHTML(url)}</a></li>`;
        });
        sourcesHtml += '</ul></div>';
        hasSourcesContent = true;
    }

    const failedYoutube = sources.failed_youtube ?? [];
    if (failedYoutube.length > 0) {
        sourcesHtml += '<div class="mb-6"><h3 class="text-xl font-semibold mb-4 text-white">Failed YouTube Sources</h3><p class="text-gray-300">';
        sourcesHtml += failedYoutube.map(url => `<a href="${escapeHTML(url)}" target="_blank" class="text-primary hover:text-primaryHover transition-colors">${escapeHTML(url)}</a>`).join(', ');
        sourcesHtml += '</p></div>';
        hasSourcesContent = true;
    }

    if (!hasSourcesContent) {
        sourcesHtml += '<p class="text-gray-400">No source information available for this query.</p>';
    }

    return sourcesHtml + '</div>';
}

function generateImagesHTML(images) {
    let imagesHtml = '<div class="border-t border-gray-700 mt-8 pt-8"><h2 class="text-2xl font-bold mb-6 text-white">Images Found on Processed Sources</h2>';
    
    if (images && images.length > 0) {
        imagesHtml += '<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">';
        images.forEach(imgUrl => {
            imagesHtml += `
                <div class="bg-darkBg2 rounded-lg overflow-hidden border border-gray-700 hover:border-primary transition-colors">
                    <img src="${escapeHTML(imgUrl)}" alt="Image from source" class="w-full h-32 object-cover">
                </div>
            `;
        });
        imagesHtml += '</div>';
    } else {
        imagesHtml += '<p class="text-gray-400">No relevant images found.</p>';
    }
    
    return imagesHtml + '</div>';
}

function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}


queryInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        performSearch(queryInput.value);
    }
});


const searchInputSmall = document.getElementById('searchInputSmall');
if (searchInputSmall) {
    searchInputSmall.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 100) + 'px';
    });
    
    searchInputSmall.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            performSearch(searchInputSmall.value);
        }
    });
}

submitButton.addEventListener('click', function() {
    performSearch(queryInput.value);
});

lucide.createIcons();