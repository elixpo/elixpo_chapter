// Constants
const SERVER_URL = "http://127.0.0.1:5000";

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

// Initialize app
function init() {
    console.log('Initializing ChatGPT interface...');
    
    // Ensure all elements exist
    if (!messageInput || !sendBtn || !plusBtn || !plusMenu || !conversation || !initialTitle) {
        console.error('Required DOM elements not found');
        return;
    }
    
    // Event listeners
    sendBtn.addEventListener('click', handleSend);
    plusBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        togglePlusMenu();
    });
    
    messageInput.addEventListener('input', function() {
        updateSendButton();
        autoResize();
    });
    
    messageInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });
    
    // Menu item clicks
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(function(item) {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const action = this.getAttribute('data-action');
            handleMenuAction(action);
        });
    });
    
    // Close menu when clicking outside
    document.addEventListener('click', function(e) {
        if (!plusBtn.contains(e.target) && !plusMenu.contains(e.target)) {
            closePlusMenu();
        }
    });
    
    updateSendButton();
    console.log('App initialized successfully');
}

// Toggle plus menu
function togglePlusMenu() {
    console.log('Toggling plus menu');
    if (plusMenu.classList.contains('hidden')) {
        plusMenu.classList.remove('hidden');
        console.log('Menu opened');
    } else {
        plusMenu.classList.add('hidden');
        console.log('Menu closed');
    }
}

// Close plus menu
function closePlusMenu() {
    plusMenu.classList.add('hidden');
}

// Handle menu actions
function handleMenuAction(action) {
    console.log('Menu action:', action);
    closePlusMenu();
    
    if (action === 'deep_research') {
        isDeepResearch = true;
        messageInput.placeholder = "Ask for deep research...";
        messageInput.focus();
        console.log('Deep research mode enabled');
    } else {
        isDeepResearch = false;
        messageInput.placeholder = "Message ChatGPT";
        messageInput.focus();
        console.log('Action selected:', action);
    }
}

// Auto resize textarea
function autoResize() {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + 'px';
}

// Update send button state
function updateSendButton() {
    const hasText = messageInput.value.trim().length > 0;
    sendBtn.disabled = !hasText || isGenerating;
}

// Handle send message
function handleSend() {
    const message = messageInput.value.trim();
    
    if (!message || isGenerating) {
        console.log('Cannot send: empty message or generating');
        return;
    }
    
    console.log('Sending message:', message);
    
    // Hide initial title on first message
    if (!initialTitle.classList.contains('hidden')) {
        initialTitle.classList.add('hidden');
    }
    
    // Add user message
    addMessage('user', message);
    
    // Clear input
    messageInput.value = '';
    autoResize();
    updateSendButton();
    closePlusMenu();
    
    // Show typing indicator
    showTypingIndicator();
    
    // Send to backend
    sendToBackend(message, isDeepResearch);
    
    // Reset deep research flag
    if (isDeepResearch) {
        isDeepResearch = false;
        messageInput.placeholder = "Message ChatGPT";
    }
}

// Add message to conversation
function addMessage(role, content) {
    console.log('Adding message:', role, content);
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message ' + role;
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user' ? 'Y' : 'AI';
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    messageContent.textContent = content;
    
    if (role === 'user') {
        messageDiv.appendChild(messageContent);
        messageDiv.appendChild(avatar);
    } else {
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(messageContent);
    }
    
    conversation.appendChild(messageDiv);
    scrollToBottom();
}

// Show typing indicator
function showTypingIndicator() {
    console.log('Showing typing indicator');
    isGenerating = true;
    updateSendButton();
    
    const typingDiv = document.createElement('div');
    typingDiv.className = 'typing-indicator';
    typingDiv.id = 'typing-indicator';
    
    for (let i = 0; i < 3; i++) {
        const dot = document.createElement('div');
        dot.className = 'typing-dot';
        typingDiv.appendChild(dot);
    }
    
    conversation.appendChild(typingDiv);
    scrollToBottom();
}

// Remove typing indicator
function removeTypingIndicator() {
    console.log('Removing typing indicator');
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
    isGenerating = false;
    updateSendButton();
}

// Scroll to bottom
function scrollToBottom() {
    const container = document.querySelector('.conversation-container');
    if (container) {
        setTimeout(function() {
            container.scrollTop = container.scrollHeight;
        }, 10);
    }
}

// Send message to backend
function sendToBackend(message, deepResearch) {
    console.log('Sending to backend:', message, 'Deep research:', deepResearch);
    
    const payload = {
        stream: false,
        messages: [{
            role: "user",
            content: [{ type: "text", text: message }]
        }],
        deep: deepResearch || false
    };
    
    fetch(SERVER_URL + '/search', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    })
    .then(function(response) {
        if (!response.ok) {
            throw new Error('Server responded with ' + response.status + ': ' + response.statusText);
        }
        return response.json();
    })
    .then(function(data) {
        removeTypingIndicator();
        console.log('Backend response:', data);
        
        let responseText = '';
        if (data.error) {
            responseText = 'Error: ' + data.error;
        } else if (data.result) {
            responseText = data.result;
        } else if (data.choices && data.choices[0] && data.choices[0].message) {
            responseText = data.choices[0].message.content;
        } else {
            responseText = "I received your message but couldn't generate a proper response.";
        }
        
        addMessage('assistant', responseText);
    })
    .catch(function(error) {
        removeTypingIndicator();
        console.error('Backend error:', error);
        
        const fallbackMessage = "An error occured! Please try again later.";
        
        addMessage('assistant', fallbackMessage);
    });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
