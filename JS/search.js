// DOM Elements
const messageInput = document.getElementById('messageInput');
const suggestionButtons = document.querySelectorAll('.suggestion-button');
const conversationItems = document.querySelectorAll('.conversation-item');
const inputActionButtons = document.querySelectorAll('.input-action-button');
const glassButtons = document.querySelectorAll('.glass-button');
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');

// Input functionality
messageInput.addEventListener('input', function (e) {
    const value = e.target.value;

    // Add visual feedback when typing
    if (value.length > 0) {
        e.target.parentElement.style.borderColor = 'rgba(255, 255, 255, 0.3)';
    } else {
        e.target.parentElement.style.borderColor = 'rgba(255, 255, 255, 0.15)';
    }
});

messageInput.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        handleSendMessage();
    }
});

// Suggestion button functionality
suggestionButtons.forEach(button => {
    button.addEventListener('click', function () {
        const suggestion = this.textContent;
        messageInput.value = suggestion;
        messageInput.focus();

        // Add click animation
        this.style.transform = 'scale(0.95)';
        setTimeout(() => {
            this.style.transform = 'scale(1.05)';
            setTimeout(() => {
                this.style.transform = 'scale(1)';
            }, 100);
        }, 100);
    });
});

// Conversation item functionality
conversationItems.forEach(item => {
    item.addEventListener('click', function () {
        // Remove active class from all items
        conversationItems.forEach(i => i.classList.remove('active'));

        // Add active class to clicked item
        this.classList.add('active');

        // Simulate loading conversation
        simulateConversationLoad(this.textContent);
    });
});

// Input action buttons
inputActionButtons.forEach(button => {
    button.addEventListener('click', function (e) {
        e.preventDefault();

        // Add click animation
        this.style.transform = 'scale(0.9)';
        setTimeout(() => {
            this.style.transform = 'scale(1)';
        }, 150);

        // Handle different actions based on button position
        const buttonIndex = Array.from(inputActionButtons).indexOf(this);

        switch (buttonIndex) {
            case 0: // Plus button
                handleAddAttachment();
                break;
            case 1: // Settings button
                handleSettings();
                break;
            case 2: // Microphone button
                handleVoiceInput();
                break;
        }
    });
});

// Glass buttons in header
glassButtons.forEach(button => {
    button.addEventListener('click', function () {
        // Add click animation
        this.style.transform = 'scale(0.9) translateY(-1px)';
        setTimeout(() => {
            this.style.transform = 'translateY(-1px)';
        }, 150);
    });
});

// Sidebar toggle functionality
sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');

    // Animate main content
    const mainContent = document.querySelector('.main-content');
    if (sidebar.classList.contains('collapsed')) {
        mainContent.style.marginLeft = '60px';
        // Add blur effect during transition
        mainContent.style.filter = 'blur(2px)';
        setTimeout(() => {
            mainContent.style.filter = 'none';
        }, 300);
    } else {
        mainContent.style.marginLeft = '0';
        mainContent.style.filter = 'blur(2px)';
        setTimeout(() => {
            mainContent.style.filter = 'none';
        }, 300);
    }
});

// Functions
function handleSendMessage() {
    const message = messageInput.value.trim();

    if (message) {
        // Simulate sending message
        console.log('Sending message:', message);

        // Add visual feedback
        const inputWrapper = messageInput.parentElement;
        inputWrapper.style.background = 'rgba(255, 255, 255, 0.15)';

        // Clear input
        messageInput.value = '';

        // Reset visual feedback
        setTimeout(() => {
            inputWrapper.style.background = 'rgba(255, 255, 255, 0.08)';
            inputWrapper.style.borderColor = 'rgba(255, 255, 255, 0.15)';
        }, 200);

        // Simulate response
        setTimeout(() => {
            simulateResponse(message);
        }, 1000);
    }
}

function simulateConversationLoad(conversationTitle) {
    console.log('Loading conversation:', conversationTitle);

    // Add loading animation to the main content
    const contentArea = document.querySelector('.content-area');
    contentArea.style.opacity = '0.5';

    setTimeout(() => {
        contentArea.style.opacity = '1';
        // Here you would typically load the actual conversation content
    }, 500);
}

function handleAddAttachment() {
    console.log('Add attachment clicked');

    // Create a subtle notification
    showNotification('Attachment feature coming soon!');
}

function handleSettings() {
    console.log('Settings clicked');

    // Create a subtle notification
    showNotification('Settings panel coming soon!');
}

function handleVoiceInput() {
    console.log('Voice input clicked');

    // Check if browser supports speech recognition
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        startVoiceRecognition();
    } else {
        showNotification('Voice input not supported in this browser');
    }
}

function startVoiceRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = function () {
        showNotification('Listening... Speak now!');
        messageInput.placeholder = 'Listening...';
    };

    recognition.onresult = function (event) {
        const transcript = event.results[0][0].transcript;
        messageInput.value = transcript;
        messageInput.focus();
        showNotification('Voice input captured!');
    };

    recognition.onerror = function (event) {
        showNotification('Voice recognition error: ' + event.error);
    };

    recognition.onend = function () {
        messageInput.placeholder = 'Message Copilot';
    };

    recognition.start();
}

function simulateResponse(userMessage) {
    // This would typically handle the AI response
    console.log('Simulating response to:', userMessage);

    // Add a subtle animation to show "thinking"
    const inputWrapper = document.querySelector('.input-wrapper');
    inputWrapper.style.boxShadow = '0 8px 32px 0 rgba(59, 130, 246, 0.2)';

    setTimeout(() => {
        inputWrapper.style.boxShadow = '0 8px 32px 0 rgba(0, 0, 0, 0.2)';
        showNotification('Response generated! (This is a demo)');
    }, 2000);
}

function showNotification(message) {
    // Create a temporary notification
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 12px;
        padding: 12px 16px;
        color: rgb(255, 250, 235);
        font-size: 14px;
        z-index: 1000;
        opacity: 0;
        transform: translateY(-10px);
        transition: all 0.3s ease;
    `;

    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateY(0)';
    }, 100);

    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(-10px)';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// Add CSS for active conversation item
const style = document.createElement('style');
style.textContent = `
    .conversation-item.active {
        background: rgba(255, 255, 255, 0.15);
        color: rgb(255, 250, 235);
        border-left: 2px solid rgba(59, 130, 246, 0.8);
    }
`;
document.head.appendChild(style);

// Initialize the app
document.addEventListener('DOMContentLoaded', function () {
    console.log('Elixpo Search UI loaded');

    // Focus on input when page loads
    messageInput.focus();

    // Add subtle entrance animations
    const elements = document.querySelectorAll('.sidebar, .main-content');
    elements.forEach((el, index) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';

        setTimeout(() => {
            el.style.transition = 'all 0.6s ease';
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        }, index * 200);
    });
});

// Handle window resize
window.addEventListener('resize', function () {
    // Adjust layout for mobile if needed
    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
        document.body.classList.add('mobile-layout');
    } else {
        document.body.classList.remove('mobile-layout');
    }
});

// Add keyboard shortcuts
document.addEventListener('keydown', function (e) {
    // Ctrl/Cmd + K to focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        messageInput.focus();
        messageInput.select();
    }

    // Escape to clear input
    if (e.key === 'Escape') {
        messageInput.value = '';
        messageInput.blur();
    }
});