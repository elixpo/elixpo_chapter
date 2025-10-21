// PWA Initialization Script
class PWAManager {
  constructor() {
    this.init();
  }

  async init() {
    // Register service worker
    if ('serviceWorker' in navigator) {
      try {
        await this.registerServiceWorker();
        console.log('PWA: Service Worker registered successfully');
      } catch (error) {
        console.error('PWA: Service Worker registration failed:', error);
      }
    }

    // Handle install prompt
    this.handleInstallPrompt();
    
    // Check if app is running as PWA
    this.checkPWAMode();
    
    // Handle online/offline status
    this.handleNetworkStatus();
  }

  async registerServiceWorker() {
    const registration = await navigator.serviceWorker.register('/service-worker.js', {
      scope: '/'
    });

    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // New content is available, show update notification
          this.showUpdateNotification();
        }
      });
    });

    return registration;
  }

  handleInstallPrompt() {
    let deferredPrompt;

    window.addEventListener('beforeinstallprompt', (e) => {
      console.log('PWA: Install prompt triggered');
      e.preventDefault();
      deferredPrompt = e;
      
      // Show custom install button
      this.showInstallButton(deferredPrompt);
    });

    window.addEventListener('appinstalled', () => {
      console.log('PWA: App was installed');
      this.hideInstallButton();
      // Track installation
      this.trackInstallation();
    });
  }

  showInstallButton(deferredPrompt) {
    // Create install button if it doesn't exist
    let installBtn = document.getElementById('pwa-install-btn');
    if (!installBtn) {
      installBtn = document.createElement('button');
      installBtn.id = 'pwa-install-btn';
      installBtn.className = 'pwa-install-button';
      installBtn.innerHTML = `
        <i class="bx bx-download"></i>
        <span>Install App</span>
      `;
      
      // Add styles
      installBtn.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        padding: 12px 20px;
        border-radius: 25px;
        cursor: pointer;
        font-family: inherit;
        font-size: 14px;
        font-weight: 600;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        z-index: 1000;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: all 0.3s ease;
      `;
      
      document.body.appendChild(installBtn);
    }

    installBtn.style.display = 'flex';
    
    installBtn.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`PWA: User response to install prompt: ${outcome}`);
        deferredPrompt = null;
        this.hideInstallButton();
      }
    });
  }

  hideInstallButton() {
    const installBtn = document.getElementById('pwa-install-btn');
    if (installBtn) {
      installBtn.style.display = 'none';
    }
  }

  checkPWAMode() {
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || 
                  window.navigator.standalone === true;
    
    if (isPWA) {
      console.log('PWA: Running in standalone mode');
      document.body.classList.add('pwa-mode');
      
      // Hide browser-specific elements
      this.hideBrowserElements();
    }
  }

  hideBrowserElements() {
    // Add styles to hide elements that shouldn't show in PWA mode
    const style = document.createElement('style');
    style.textContent = `
      .pwa-mode .browser-only {
        display: none !important;
      }
      .pwa-mode {
        padding-top: env(safe-area-inset-top);
        padding-bottom: env(safe-area-inset-bottom);
      }
    `;
    document.head.appendChild(style);
  }

  handleNetworkStatus() {
    const updateNetworkStatus = () => {
      if (navigator.onLine) {
        document.body.classList.remove('offline');
        document.body.classList.add('online');
        this.hideOfflineNotification();
      } else {
        document.body.classList.remove('online');
        document.body.classList.add('offline');
        this.showOfflineNotification();
      }
    };

    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);
    
    // Initial check
    updateNetworkStatus();
  }

  showOfflineNotification() {
    let offlineNotification = document.getElementById('offline-notification');
    if (!offlineNotification) {
      offlineNotification = document.createElement('div');
      offlineNotification.id = 'offline-notification';
      offlineNotification.innerHTML = `
        <i class="bx bx-wifi-off"></i>
        <span>You're offline. Some features may be limited.</span>
      `;
      
      offlineNotification.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: #f59e0b;
        color: white;
        padding: 10px;
        text-align: center;
        font-size: 14px;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      `;
      
      document.body.appendChild(offlineNotification);
    }
    
    offlineNotification.style.display = 'flex';
  }

  hideOfflineNotification() {
    const offlineNotification = document.getElementById('offline-notification');
    if (offlineNotification) {
      offlineNotification.style.display = 'none';
    }
  }

  showUpdateNotification() {
    let updateNotification = document.getElementById('update-notification');
    if (!updateNotification) {
      updateNotification = document.createElement('div');
      updateNotification.id = 'update-notification';
      updateNotification.innerHTML = `
        <span>New version available!</span>
        <button onclick="window.location.reload()">Update</button>
      `;
      
      updateNotification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #10b981;
        color: white;
        padding: 15px;
        border-radius: 8px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 15px;
        font-size: 14px;
      `;
      
      const button = updateNotification.querySelector('button');
      button.style.cssText = `
        background: rgba(255,255,255,0.2);
        border: 1px solid rgba(255,255,255,0.3);
        color: white;
        padding: 5px 10px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      `;
      
      document.body.appendChild(updateNotification);
    }
    
    updateNotification.style.display = 'flex';
  }

  trackInstallation() {
    // Track PWA installation for analytics
    if (typeof gtag !== 'undefined') {
      gtag('event', 'pwa_install', {
        event_category: 'PWA',
        event_label: 'App Installed'
      });
    }
  }
}

// Initialize PWA when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new PWAManager();
  });
} else {
  new PWAManager();
}