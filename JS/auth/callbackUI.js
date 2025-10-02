// Enhanced UI controller for the authentication callback page
class CallbackUI {
    constructor() {
        this.progressBar = document.getElementById('progressBar');
        this.progressText = document.getElementById('progressText');
        this.statusIcon = document.getElementById('statusIcon');
        this.statusTitle = document.getElementById('statusTitle');
        this.status = document.getElementById('status');
        this.providerIcon = document.getElementById('providerIcon');
        this.userAvatar = document.getElementById('userAvatar');
        this.userInfo = document.getElementById('userInfo');
        this.userName = document.getElementById('userName');
        this.userEmail = document.getElementById('userEmail');
        this.loadingUser = document.getElementById('loadingUser');
        this.actionButtons = document.getElementById('actionButtons');
        this.retryBtn = document.getElementById('retryBtn');
        this.backBtn = document.getElementById('backBtn');
        
        this.currentProvider = null;
        this.currentProgress = 0;
        
        this.init();
    }
    
    init() {
        // Detect provider from URL state parameter
        this.detectProvider();
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Start the authentication process animation
        this.startAuthProcess();
    }
    
    detectProvider() {
        const params = new URLSearchParams(window.location.search);
        const state = params.get('state');
        
        if (state === 'elixpo-blogs-github') {
            this.currentProvider = 'github';
            this.setProviderUI('github');
        } else if (state === 'elixpo-blogs-google') {
            this.currentProvider = 'google';
            this.setProviderUI('google');
        } else {
            this.currentProvider = 'unknown';
            this.setProviderUI('unknown');
        }
    }
    
    setProviderUI(provider) {
        const providerConfigs = {
            github: {
                icon: '<div class="flex items-center justify-center w-12 h-12 rounded-full bg-[#24292e] text-white"><ion-icon name="logo-github" class="text-2xl"></ion-icon></div>',
                name: 'GitHub',
                color: '#24292e'
            },
            google: {
                icon: '<div class="flex items-center justify-center w-12 h-12 rounded-full bg-white text-[#4285f4] border border-gray-200"><ion-icon name="logo-google" class="text-2xl"></ion-icon></div>',
                name: 'Google',
                color: '#4285f4'
            },
            unknown: {
                icon: '<div class="flex items-center justify-center w-12 h-12 rounded-full bg-[#1D202A] text-gray-400"><ion-icon name="help-circle-outline" class="text-2xl"></ion-icon></div>',
                name: 'Unknown',
                color: '#6b7280'
            }
        };
        
        const config = providerConfigs[provider];
        this.providerIcon.innerHTML = config.icon;
        
        // Update status text based on provider
        if (provider !== 'unknown') {
            this.statusTitle.innerHTML = `Authenticating with ${config.name}<span class="loading-dots"></span>`;
            this.status.textContent = `Verifying your ${config.name} credentials and setting up your account.`;
        }
    }
    
    setupEventListeners() {
        this.retryBtn.addEventListener('click', () => {
            window.location.reload();
        });
        
        this.backBtn.addEventListener('click', () => {
            redirectTo('src/auth/login');
        });
    }
    
    startAuthProcess() {
        // Simulate progress for better UX
        this.updateProgress(20);
        
        setTimeout(() => {
            this.updateProgress(40);
        }, 500);
        
        setTimeout(() => {
            this.updateProgress(60);
        }, 1000);
    }
    
    updateProgress(percentage) {
        this.currentProgress = percentage;
        this.progressBar.style.width = `${percentage}%`;
        this.progressText.textContent = `${percentage}%`;
    }
    
    showSuccess(userData) {
        this.updateProgress(100);
        
        // Update status icon to success
        this.statusIcon.innerHTML = `
            <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 border-2 border-green-500">
                <ion-icon name="checkmark-circle" class="text-4xl text-green-500 success-checkmark"></ion-icon>
            </div>
        `;
        
        // Update status text
        this.statusTitle.innerHTML = 'Authentication Successful!';
        this.status.textContent = 'Welcome! You will be redirected to your dashboard shortly.';
        
        // Show user information if available
        if (userData) {
            this.showUserInfo(userData);
        }
        
        // Hide loading state
        this.loadingUser.classList.add('hidden');
    }
    
    showError(errorMessage) {
        this.updateProgress(0);
        
        // Update status icon to error
        this.statusIcon.innerHTML = `
            <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500">
                <ion-icon name="close-circle" class="text-4xl text-red-500"></ion-icon>
            </div>
        `;
        
        // Update status text
        this.statusTitle.innerHTML = 'Authentication Failed';
        this.status.textContent = errorMessage || 'Something went wrong during authentication. Please try again.';
        
        // Show action buttons
        this.actionButtons.classList.remove('hidden');
        
        // Hide loading state
        this.loadingUser.classList.add('hidden');
    }
    
    showUserInfo(userData) {
        const { name, email, avatar } = userData;
        
        // Set user avatar
        if (avatar) {
            this.userAvatar.style.backgroundImage = `url(${avatar})`;
            this.userAvatar.style.backgroundSize = 'cover';
            this.userAvatar.style.backgroundPosition = 'center';
            this.userAvatar.textContent = '';
        } else if (name) {
            this.userAvatar.textContent = name.charAt(0).toUpperCase();
        } else if (email) {
            this.userAvatar.textContent = email.charAt(0).toUpperCase();
        }
        
        // Set user name and email
        this.userName.textContent = name || 'User';
        this.userEmail.textContent = email || 'Verified Account';
        
        // Show user info and hide loading
        this.userAvatar.classList.remove('hidden');
        this.userInfo.classList.remove('hidden');
        this.loadingUser.classList.add('hidden');
    }
    
    setLoadingState(message) {
        this.status.textContent = message;
        this.updateProgress(Math.min(this.currentProgress + 10, 90));
    }
}

// Initialize the UI controller when DOM is loaded
let callbackUI;
document.addEventListener('DOMContentLoaded', () => {
    console.log("🎨 Initializing CallbackUI...");
    callbackUI = new CallbackUI();
    window.callbackUI = callbackUI;
    console.log("✅ CallbackUI initialized and attached to window");
});
