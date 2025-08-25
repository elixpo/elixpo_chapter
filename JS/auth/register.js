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
        hideElement('inputLabel');
        hideElement('otpLabel');
        disableElement('registerBtn');
        verifyRegisterOTP(tokenParam, null, operation, state, otp=null, callback=true);
    }
    else if(operation != null && operation != "register" || state!= null && state != "elixpo-blogs")
    {
        showNotification("Invalid registration request. Please try registering again.");
        resetRegisterForm();
    }
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
    // const emailEl = document.getElementById("email");
    // if (emailEl) emailEl.value = '';
    hideElement('otpLabel');
    showElement('inputLabel');
    token = null;
    emailResp = null;
    userInpEmail = null;
}

// --- Email Submit Handler ---
document.getElementById("registerBtn").addEventListener("click", function(e) {
    e.preventDefault();
    showNotification("Sending OTP for registration...");
    userInpEmail = document.getElementById("email").value;
    const verifiedEmail = safeInputEmail(userInpEmail);
    if (!verifiedEmail) {
        showNotification("Please enter a valid email address.");
        return;
    }
    fetch('http://127.0.0.1:5000/api/registerRequest?email=' + encodeURIComponent(verifiedEmail), {
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

function verifyRegisterOTP(token, email, otp) {
    showNotification("Verifying OTP...");
    if (!token || !email || !otp) {
        showNotification("Invalid registration attempt. Please try again.");
        resetRegisterForm();
        return;
    }
    fetch(`http://127.0.0.1:5000/api/verifyRegisterOTP?otp=${encodeURIComponent(otp)}&token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}&time=${encodeURIComponent(Date.now())}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(res => res.json())
    .then(data => {
        if (data.status) {
            showNotification(data.message || "🎉 Registration successful!");
            console.log("Registered User ");
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