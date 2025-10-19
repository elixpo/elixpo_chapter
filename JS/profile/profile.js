const MAX_NOTIFICATIONS = 5;
let activeNotifications = 0;
function showNotification(message, duration = 3500) {
    if (activeNotifications >= MAX_NOTIFICATIONS) {
        notificationQueue.push({ message, duration });
        return;
    }
    activeNotifications++;
    const notif = document.createElement('div');
    notif.className = 'notification-instance fixed top-10 left-1/2 transform -translate-x-1/2 z-50 bg-[#1D202A] text-white px-6 py-3 rounded-lg shadow-lg border border-[#7ba8f0] transition-all duration-300 mb-2';
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


async function checkURLParam()
{
    const urlParams = new URLSearchParams(window.location.search);
    if(urlParams.has("profile_set"))
    {
        let completedAt = urlParams.get("completedAt");
        let scope = urlParams.get("scope");
        const date = new Date();
        const time_now = date.toISOString();

        //get the params from the localstorage
        let bio = localStorage.getItem("entryProfile")
        if(completedAt - time_now < 60000 && urlParams.get("profile_set"))
        {
            const entries = await localStorage.getItem("entryProfile").then((res) => JSON.parse(res)) || {};
            let bio = entries.bio || "";
            let displayName = entries.displayName || "";
            let profilePic = entries.profilePic || "";
            let bannerPic = entries.bannerPic || "";
            const res = await fetch("http://localhost:5000/api/checkAuth", {
                credentials: 'include',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ bio, displayName, profilePic, bannerPic })
            });
            const data = await res.json();
            if(data.status)
            {
                showNotification("✅ Profile updated successfully!");
                localStorage.removeItem("entryProfile");
                setTimeout(() => {
                    window.location.href = `/profile/${data.username}`;
                }, 1500);
            }

        }
    }
}

showNotification("test notification")