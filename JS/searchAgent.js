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

const SERVER_URL = "http://127.0.0.1:5000";
// const SERVER_URL = "https://search.pollinations.ai";
const input = document.getElementById('queryInput');
const submitButton = document.getElementById('submitButton');
const sseFeed = document.getElementById('sseFeed');
const finalOutput = document.getElementById('finalOutput');
const sseToggle = document.getElementById('sseToggle');
const classicBtn = document.getElementById('classicBtn');
const chatBtn = document.getElementById('chatBtn');
const imageUrlInput = document.getElementById('imageUrlInput');
const statusMessage = document.getElementById('sseFeed');

let useChatApi = false;
let hasReachedSuccess = false;


function clearOutputs() {
    sseFeed.innerHTML = '';
    finalOutput.innerHTML = '';
    statusMessage.innerHTML = '';
    statusMessage.classList.add('hidden');
    sseFeed.style.display = sseToggle.checked ? 'flex' : 'none';
}

function updateStatus(msg, type = "info") {
    let msgNode = `<span> <span class="information_type"> [INFO] </span> ${msg}  </span>`;
    statusMessage.innerHTML += msgNode;
    statusMessage.classList.remove('hidden');
    statusMessage.className = `text-center mb-6 ${type === "error" ? "text-red-400" : "text-blue-400"}`;
}

classicBtn.addEventListener('click', () => {
    useChatApi = false;
    classicBtn.classList.add('active');
    chatBtn.classList.remove('active');
    clearOutputs();
});

chatBtn.addEventListener('click', () => {
    useChatApi = true;
    chatBtn.classList.add('active');
    classicBtn.classList.remove('active');
    clearOutputs();
});

function showResult(label, data) {
    finalOutput.innerHTML = '';
    let div = document.createElement('div');
    if (typeof data === 'object' && data !== null && data.error) {
        div.innerText = `[${label}] ERROR: ${data.error}`;
        div.className = 'text-red-400';
    } else if (typeof data === 'object' && data !== null && data.result !== undefined) {
        div.innerHTML = marked.parse(data.result);
    } else if (typeof data === 'object' && data.choices && data.choices[0]) {
        div.innerHTML = marked.parse(data.choices[0].message.content);
    } else {
        div.innerText = `[${label}] ${typeof data === 'string' ? data : JSON.stringify(data, null, 2)}`;
    }
    finalOutput.appendChild(div);
}

function renderFinalOutput(markdown) {
    let html = marked.parse(markdown);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    const images = Array.from(tempDiv.querySelectorAll('img'));
    if (images.length > 0) {
        const imageGrid = document.createElement('div');
        imageGrid.className = 'image-grid';
        images.forEach(img => imageGrid.appendChild(img));
        tempDiv.querySelectorAll('img').forEach(img => img.remove());
        tempDiv.append(imageGrid);
    }
    finalOutput.innerHTML = tempDiv.innerHTML;
}


function doSearch() {
    clearOutputs();
    const query = input.value;
    const imageUrl = imageUrlInput.value.trim();
    input.value = '';
    imageUrlInput.value = '';

    let chatPayload;
    if (useChatApi) {
        chatPayload = {
            stream: sseToggle.checked,
            messages: [{ role: "user", content: query }]
        };
        if (imageUrl) {
            chatPayload.image = imageUrl;
        }
    } else {
        chatPayload = {
            stream: sseToggle.checked,
            messages: [{
                role: "user",
                content: [
                    { type: "text", text: query }
                ]
            }]
        };
        if (imageUrl) {
            chatPayload.messages[0].content.push({
                type: "image_url",
                image_url: { url: imageUrl }
            });
        }
    }

    if (sseToggle.checked) {
        sseFeed.style.display = 'flex';
        const finalChunks = [];

        fetch(`${SERVER_URL}/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(chatPayload)
        })
        .then(response => {
            if (!response.ok) throw new Error("Network error");
            const reader = response.body.getReader();
            let decoder = new TextDecoder();
            let buffer = '';

            function processChunk({ done, value }) {
                if (done) return;
                buffer += decoder.decode(value, { stream: true });
                let lines = buffer.split('\n');
                buffer = lines.pop();
            
                lines.forEach(line => {
                    if (line.startsWith('data:')) {
                        let data = line.slice(5).trim();
            
                        if (data === '[DONE]') {
                            esClose();
                        } else {
                            try {
                                const parsed = JSON.parse(data);
                                const delta = parsed?.choices?.[0]?.delta?.content;
            
                                if (delta) {
                                    if (!hasReachedSuccess) {
                                        if (delta.trim() === 'SUCCESS') {
                                            hasReachedSuccess = true;
                                        } else {
                                            updateStatus(delta, 'info');
                                        }
                                    } else {
                                        finalChunks.push(delta);
                                    }
                                } else {
                                    updateStatus(data, 'info'); // fallback
                                }
                            } catch (e) {
                                updateStatus(data, 'info'); // fallback for raw
                            }
                        }
                    }
                });
            
                return reader.read().then(processChunk);
            }
            
            function esClose() {
                statusMessage.classList.add('hidden');
                const joined = finalChunks.join('');
                if (joined.trim()) {
                    renderFinalOutput(joined);
                }
            }

            
            return reader.read().then(processChunk);
        })
        .catch(e => {
            updateStatus(`[ERROR] ${e.toString()}`, "error");
            finalOutput.innerHTML = `<span class="text-red-400">[ERROR] ${e.toString()}</span>`;
        });
    }

    else if (useChatApi) {
        finalOutput.innerHTML = '<span class="text-gray-400">Loading (Chat API)...</span>';
        fetch(`${SERVER_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(chatPayload)
        })
        .then(r => r.json())
        .then(data => showResult('Chat API', data))
        .catch(e => showResult('Chat API', { error: e.toString() }));
    }

    else {
        sseFeed.style.display = 'none';
        finalOutput.innerHTML = '<span class="text-gray-400">Loading...</span>';
        fetch(`${SERVER_URL}/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(chatPayload)
        })
        .then(r => r.json())
        .then(data => showResult('POST', data))
        .catch(e => showResult('POST', { error: e.toString() }));
    }
}


submitButton.onclick = (e) => {
    e.preventDefault();
    doSearch();
};

sseToggle.onchange = () => {
    clearOutputs();
};

input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        doSearch();
    }
});
