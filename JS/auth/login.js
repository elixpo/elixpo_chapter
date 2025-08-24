
const otpInputs = document.querySelectorAll('#otpLabel input[type="text"]');
document.getElementById("loginBtn").addEventListener("click", function(event) {
    var email = document.getElementById("email").value;
    var verifiedEmail = safeInputEmail(email);
    const response = fetch('http://127.0.0.1:5000/api/loginRequest?email=' + encodeURIComponent(verifiedEmail), {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        },
        
    });
    response.then(res => res.json()).then(data => {
        if (data.error) {
            alert("Error: " + data.error);
        } else {
            console.log("OTP sent successfully!");
        }
    });
});




otpInputs.forEach((input, idx) => {
    input.addEventListener('input', function () {
        // Only allow digits
        this.value = this.value.replace(/[^0-9]/g, '');
        if (this.value.length === 1 && idx < otpInputs.length - 1) {
            otpInputs[idx + 1].focus();
        }
        // If all inputs are filled, call verifyOTP
        if ([...otpInputs].every(inp => inp.value.length === 1)) {
            verifyOTP([...otpInputs].map(inp => inp.value).join(''));
        }
    });

    input.addEventListener('keydown', function (e) {
        if (e.key === 'Backspace' && this.value === '' && idx > 0) {
            otpInputs[idx - 1].focus();
        }
    });
});

function verifyOTP(otp) {
    console.log('Verifying OTP:', otp);
    // Example: send OTP to backend for verification
    // fetch('/api/verifyOTP', { method: 'POST', body: JSON.stringify({ otp }) })
}


function safeInputEmail(email) {
    // Basic email regex validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        alert("Please enter a valid email address.");
        return;
    }

    // Check for common SQL injection patterns
    const sqlInjectionPattern = /('|--|;|\/\*|\*\/|xp_|exec|union|select|insert|delete|update|drop|alter|create|truncate|script|<|>)/i;
    if (sqlInjectionPattern.test(email)) {
        alert("Invalid characters detected in email address.");
        return;
    }

    // Further security checks can be added here

    // Implement your login logic here
    console.log("Logging in user:", email);
    return email;
}
