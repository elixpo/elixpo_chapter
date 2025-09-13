// Constants
const SERVER_URL = "http://127.0.0.1:5001";

// DOM elements
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const plusBtn = document.getElementById('plusBtn');
const plusMenu = document.getElementById('plusMenu');
const conversation = document.getElementById('conversation');
const initialTitle = document.querySelector('.initial-title');

// State
let isGenerating = false;
let isDeepResearch = false;


sendBtn.addEventListener('click', function() {
    sendMessage(messageInput.value);
});

messageInput.addEventListener('keydown', function(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault(); 
        sendMessage(messageInput.value);
    }
});

async function sendMessage(prompt) 
{
    const sectionUID = sectionHandler(prompt, null, "create");
    const response = await fetch(`${SERVER_URL}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "X45110" })
    });

    if (!response.body) return;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let parts = buffer.split("\n\n");
        buffer = parts.pop(); 

        for (let part of parts) {
            if (part.startsWith("event: end")) {
                return;
            }
            const match = part.match(/^data:\s*(.*)$/m);
            if (match) {
                const data = JSON.parse(match[1]);
                if (data.status) {
                    sectionHandler(prompt, sectionUID, "sseEvents", data.status);
                } else if (data.choices) {
                    const content = data.choices[0].message.content;
                    // Separate main content and sources
                    const sourcesMatch = content.match(/\*\*Sources:\*\*([\s\S]*)/);
                    const imagesMatch = content.match(/\*\*Related Images:\*\*([\s\S]*)/);
                    let mainContent = content;
                    let sources = [];
                    let images = [];
                    if (sourcesMatch) {
                        mainContent = content.replace(/\*\*Sources:\*\*[\s\S]*/i, '').trim();
                        const sourcesText = sourcesMatch[1];
                        const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
                        let linkMatch;
                        while ((linkMatch = linkRegex.exec(sourcesText)) !== null) {
                            sources.push({ title: linkMatch[1], url: linkMatch[2] });
                        }
                    } 
                    
                    if (imagesMatch) {
                        mainContent = content.replace(/\*\*Related Images:\*\*[\s\S]*/i, '').trim();
                        const imagesText = imagesMatch[1];
                        const imageUrlRegex = /(https?:\/\/[^\s)]+)/g;
                        let imageMatch;
                        while ((imageMatch = imageUrlRegex.exec(imagesText)) !== null) {
                            images.push({ url: imageMatch[1] });
                        }
                    }

                    else {
                        mainContent = content.trim();
                    }
                    sectionHandler(prompt, sectionUID, "finalResponse", null, mainContent);
                    if (sources.length > 0) {
                        sectionHandler(prompt, sectionUID, "addSources", null, null, sources);
                    }
                    if (images.length > 0) {
                        sectionHandler(prompt, sectionUID, "addImages", null, null, null, images);
                    }
                }
            }
        }
    }
}
// document.getElementById("renderMarkdownResult").innerHTML = marked.parse("This is **bold** and this is *italic* `code`");