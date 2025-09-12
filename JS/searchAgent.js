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

function sendMessage(prompt) 
{
    sectionHandler(prompt, null, "create");
}
// document.getElementById("renderMarkdownResult").innerHTML = marked.parse("This is **bold** and this is *italic* `code`");