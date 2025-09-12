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

document.getElementById("renderMarkdownResult").innerHTML = marked.parse("This is **bold** and this is *italic* `code`");