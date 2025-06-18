document.getElementById("supportServer").addEventListener("click", () => {
    showNotification("Support Server yet to be setup!", "info");  
  });


  function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i data-lucide="${type === 'success' ? 'check-circle' : 'info'}" class="w-5 h-5"></i>
            <span>${message}</span>
        </div>
    `;

    // Add notification styles
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#059669' : '#3b82c5'};
        color: white;
        padding: 16px 20px;
        border-radius: 12px;
        box-shadow: 0 8px 25px rgba(0,0,0,0.2);
        z-index: 1000;
        transform: translateX(100%);
        transition: transform 0.3s ease;
        max-width: 300px;
    `;

    document.body.appendChild(notification);
    
    // Initialize icons for notification
    lucide.createIcons();

    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);

    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// Add loading animations
const style = document.createElement('style');
style.textContent = `
    .notification-content {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 500;
    }
    
    .btn-hero-primary:active {
        transform: translateY(-1px) scale(0.98);
    }
    
    .feature-card:nth-child(odd) {
        animation-delay: 0.1s;
    }
    
    .feature-card:nth-child(even) {
        animation-delay: 0.2s;
    }
    
    .pricing-card:nth-child(1) {
        animation-delay: 0.1s;
    }
    
    .pricing-card:nth-child(2) {
        animation-delay: 0.2s;
    }
    
    .pricing-card:nth-child(3) {
        animation-delay: 0.3s;
    }
`;
document.head.appendChild(style);


// Initialize entrance animations
setTimeout(() => {
    document.querySelectorAll('.hero-title, .hero-subtitle, .hero-badge').forEach((el, index) => {
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
    });
}, 100);