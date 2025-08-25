const otpInputs = document.querySelectorAll('#otpLabel input[type="text"]');
let token = "bljY0G";
let emailResp = "ayushbhatt633@gmail.com";
let userInpEmail = "ayushbhatt633@gmail.com";
const MAX_NOTIFICATIONS = 3;
let notificationQueue = [];
let activeNotifications = 0;

window.onload = function() {
    hideElement('inputLabel');
    showElement('otpLabel');
    checkURLParamsLogin();
};



function hideElement(id)
{
    document.getElementById(id).style.cssText = `
    opacity: 0;
    pointer-events: none;
    filter: blur(2px);
    transition: opacity 0.3s ease;
    `
    setTimeout(() => {
      document.getElementById(id).style.display = "none";
    }, 500);
}

function showElement(id)
{
    document.getElementById(id).style.display = "block";
    document.getElementById(id).classList.remove('hidden');
    setTimeout(() => {
      document.getElementById(id).style.cssText = `
      opacity: 1;
      pointer-events: auto;
      filter: blur(0px);
      transition: opacity 0.3s ease;
      `
    }, 100);
}


function checkURLParamsLogin() {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get('token');
    const operation = urlParams.get('operation');
    const state = urlParams.get('state');
    let callback = urlParams.get('callback');
    console.log("URL Parameters:", { tokenParam, operation, state, callback });
    if (callback === 'true' && operation === 'login' && state === 'elixpo-blogs' && tokenParam) {
        verifyOTP(tokenParam, null, operation, state, otp=null, callback=true);
    }
    else if(operation != null && operation != "login" || state!= null && state != "elixpo-blogs")
    {
        showNotification("Invalid login request. Please try logging in again.");
        resetLoginForm();
    }
}


document.getElementById("loginBtn").addEventListener("click", function() {
    showNotification("Sending OTP via email...");
    userInpEmail = document.getElementById("email").value;
    var verifiedEmail = safeInputEmail(userInpEmail);
    if (!verifiedEmail) {
        showNotification("Ooppss crack!! Please enter a valid email address buddy.");
        return;
    }
    const response = fetch('http://127.0.0.1:5000/api/loginRequest?email=' + encodeURIComponent(verifiedEmail), {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        },
    });
    response.then(res => res.json()).then(data => {
        if (data.error) {
            showNotification(data.error); 
        } else {
            let msg = data.message || "OTP sent! Please check your email.";
            [emailResp, token] = (data.data || data.message).split(',');
            sessionStorage.setItem('email', emailResp);
            sessionStorage.setItem('token', token);
            showNotification(msg);
            hideElement('inputLabel');
            showElement('otpLabel');
        }
    }).catch(() => {
        showNotification("Network error. Please check your connection and try again.");
    });
});


otpInputs.forEach((input, idx) => {
    input.addEventListener('input', function () {
        this.value = this.value.replace(/[^0-9]/g, '');
        if (this.value.length === 1 && idx < otpInputs.length - 1) {
            otpInputs[idx + 1].focus();
        }
        // If all inputs are filled, call verifyOTP
        if ([...otpInputs].every(inp => inp.value.length === 1)) {
            verifyOTP(token, emailResp=emailResp, operation=null, state=null, [...otpInputs].map(inp => inp.value).join(''), callback=false);
        }
    });

    input.addEventListener('keydown', function (e) {
        if (e.key === 'Backspace' && this.value === '' && idx > 0) {
            otpInputs[idx - 1].focus();
        }
    });
});


function resetLoginForm() {
    otpInputs.forEach(input => input.value = '');
    document.getElementById("email").value = '';
    hideElement('otpLabel');
    showElement('inputLabel');
    sessionStorage.removeItem('email');
    sessionStorage.removeItem('token');
    token = null;
    emailResp = null;
    userInpEmail = null;
}

function verifyOTP(token, emailResp=null, operation=null, state=null, otp=null, callback=false) {
    console.log("Verifying OTP with:", { token, emailResp, operation, state, otp, callback });
    showNotification("Verifying OTP, just a moment...");
    if (callback === true) {
        console.log("checking from the callback")
        const response = fetch(`http://127.0.0.1:5000/api/verifyOTP?token=${encodeURIComponent(token)}&email=${encodeURIComponent(emailResp)}&time=${encodeURIComponent(Date.now())}&state=${encodeURIComponent(state)}&operation=${encodeURIComponent(operation)}&callback=${true}`, 
        { method: 'GET',
            headers: {
            'Content-Type': 'application/json'
        },
         })
    response.then((res) => res.json()).then((data) => {
        if (data.status) {
            showNotification(data.message || "🎉 OTP verified! Welcome!");
            resetLoginForm();
        } else {
            showNotification(data.error || "❗ OTP verification failed. Please try again.");
        }
    }).catch(() => {
        showNotification("🔥 Network error during OTP verification.");
    });
    return;
    }

    else if (!token || emailResp != userInpEmail) {
        showNotification("❗ Oops! OTP verification failed. Please try logging in again.");
        resetLoginForm();
        return;
    }
    else 
    {
        const response = fetch('http://127.0.0.1:5000/api/verifyOTP?otp=' + encodeURIComponent(otp) + '&token=' + encodeURIComponent(token) + '&email=' + encodeURIComponent(emailResp) + '&time=' + encodeURIComponent(Date.now()), 
        { method: 'GET',
            headers: {
            'Content-Type': 'application/json'
        },
         })
    response.then((res) => res.json()).then((data) => {
        if (data.status) {
            showNotification(data.message);
            sessionStorage.removeItem('email');
            sessionStorage.removeItem('token');
        } else {
            showNotification(data.error || "❗ Oops! Please try logging in again");
            resetLoginForm();
        }
    }).catch(() => {
        showNotification("🔥 Network error during OTP verification.");
    });
    }
    
}

function showNotification(message, duration = 3500) {
    if (activeNotifications >= MAX_NOTIFICATIONS) {
        notificationQueue.push({ message, duration });
        return;
    }
    activeNotifications++;

    // Create notification element
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
    if (!emailRegex.test(email)) {
        return;
    }
    const sqlInjectionPattern = /('|--|;|\/\*|\*\/|xp_|exec|union|select|insert|delete|update|drop|alter|create|truncate|script|<|>)/i;
    if (sqlInjectionPattern.test(email)) {
        return;
    }
    console.log("Logging in user:", email);
    return email;
}
