// --- Selectors and State ---
const MAX_NOTIFICATIONS = 3;
let notificationQueue = [];
let activeNotifications = 0;

let token = null;
let emailResp = null;
let userInpEmail = null;

const otpInputs = document.querySelectorAll('#otpLabel input[type="text"]');

// --- On Load: Hide OTP, Show Email ---
window.onload = function() {
    hideElement('otpLabel');
    showElement('inputLabel');
    checkURLParamsRegister();
    resetRegisterForm();
};


function checkURLParamsRegister()
{
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get('token');
    const operation = urlParams.get('operation');
    const state = urlParams.get('state');
    let callback = urlParams.get('callback');
    console.log("URL Parameters:", { tokenParam, operation, state, callback });
    if (callback === 'true' && operation === 'register' && state === 'elixpo-blogs' && tokenParam) {
        verifyOTP(tokenParam, null, operation, state, otp=null, callback=true);
    }
    else if(operation != null && operation != "register" || state!= null && state != "elixpo-blogs")
    {
        showNotification("Invalid registration request. Please try registering again.");
        resetRegisterForm();
    }
}


// --- Helper Functions ---
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

function safeInputEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return;
    const sqlPattern = /('|--|;|\/\*|\*\/|xp_|exec|union|select|insert|delete|update|drop|alter|create|truncate|script|<|>)/i;
    if (sqlPattern.test(email)) return;
    return email;
}

function resetRegisterForm() {
    if (otpInputs.length) otpInputs.forEach(input => input.value = '');
    const emailEl = document.getElementById("email");
    if (emailEl) emailEl.value = '';
    hideElement('otpLabel');
    showElement('inputLabel');
    token = null;
    emailResp = null;
    userInpEmail = null;
}

// --- Email Submit Handler ---
document.querySelector("form").addEventListener("submit", function(e) {
    e.preventDefault();
    showNotification("Sending OTP for registration...");
    userInpEmail = document.getElementById("email").value;
    const verifiedEmail = safeInputEmail(userInpEmail);
    if (!verifiedEmail) {
        showNotification("Please enter a valid email address.");
        return;
    }
    fetch('http://127.0.0.1:5000/registerRequest?email=' + encodeURIComponent(verifiedEmail), {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            showNotification(data.error);
        } else {
            let msg = data.message || "OTP sent! Please check your email.";
            [emailResp, token] = (data.data || data.message).split(',');
            showNotification(msg);
            hideElement('inputLabel');
            showElement('otpLabel');
        }
    })
    .catch(() => {
        showNotification("Network error. Please try again.");
    });
});

// --- OTP Input Handler ---
if (otpInputs.length) {
    otpInputs.forEach((input, idx) => {
        input.addEventListener('input', function () {
            this.value = this.value.replace(/[^0-9]/g, '');
            if (this.value.length === 1 && idx < otpInputs.length - 1) {
                otpInputs[idx + 1].focus();
            }
            if ([...otpInputs].every(inp => inp.value.length === 1)) {
                verifyRegisterOTP(token, emailResp, [...otpInputs].map(inp => inp.value).join(''));
            }
        });
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Backspace' && this.value === '' && idx > 0) {
                otpInputs[idx - 1].focus();
            }
        });
    });
}

// --- OTP Verification ---
function verifyRegisterOTP(token, email, otp) {
    showNotification("Verifying OTP...");
    if (!token || !email || !otp) {
        showNotification("Invalid registration attempt. Please try again.");
        resetRegisterForm();
        return;
    }
    fetch(`http://127.0.0.1:5000/verifyRegisterOTP?otp=${encodeURIComponent(otp)}&token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}&time=${encodeURIComponent(Date.now())}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(res => res.json())
    .then(data => {
        if (data.status) {
            showNotification(data.message || "🎉 Registration successful!");
            resetRegisterForm();
        } else {
            showNotification(data.error || "❗ OTP verification failed. Please try again.");
            resetRegisterForm();
        }
    })
    .catch(() => {
        showNotification("🔥 Network error during OTP verification.");
    });
}