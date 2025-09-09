

function disableElement(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.cssText = `
        opacity: 0.6;
        pointer-events: none;
        filter: blur(1px);
        transition: opacity 0.3s ease;
    `;
}

function enableElement(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.cssText = `
        opacity: 1;
        pointer-events: auto;
        filter: blur(0px);
        transition: opacity 0.3s ease;
    `;
}

function hideElement(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.cssText = `
        opacity: 0;
        pointer-events: none;
        filter: blur(2px);
        transition: opacity 0.3s ease;
    `;
    setTimeout(() => { el.style.display = "none"; }, 500);
}

function showElement(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = "block";
    el.classList.remove('hidden');
    setTimeout(() => {
        el.style.cssText = `
            opacity: 1;
            pointer-events: auto;
            filter: blur(0px);
            transition: opacity 0.3s ease;
        `;
    }, 100);
}

function showNotification(message, duration = 3500) {
    if (activeNotifications >= MAX_NOTIFICATIONS) {
        notificationQueue.push({ message, duration });
        return;
    }
    activeNotifications++;
    const notif = document.createElement('div');
    notif.className = 'notification-instance fixed top-6 left-1/2 transform -translate-x-1/2 z-50 bg-[#1D202A] text-white px-6 py-3 rounded-lg shadow-lg border border-[#7ba8f0] transition-all duration-300 mb-2';
    notif.style.position = 'fixed';
    notif.style.top = `${1.5 + (activeNotifications - 1) * 4}rem`;
    notif.style.left = '50%';
    notif.style.transform = 'translateX(-50%)';
    notif.innerHTML = `<span>${message}</span>`;
    notif.id = `notification-${Date.now().toString().slice(0, 5)}`;
    document.body.appendChild(notif);
    setTimeout(() => {
        hideElement(notif.id);
        setTimeout(() => {
            notif.remove();
            activeNotifications--;
            if (notificationQueue.length > 0) {
                const next = notificationQueue.shift();
                showNotification(next.message, next.duration);
            }
        }, 500);
    }, duration);
}