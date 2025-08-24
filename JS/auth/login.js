
const otpInputs = document.querySelectorAll('#otpLabel input[type="text"]');
let reqID = "ZjqQMN";
let emailResp = "ayushbhatt633@gmail.com";
let userInpEmail = "ayushbhatt633@gmail.com";
document.getElementById("loginBtn").addEventListener("click", function() {
    userInpEmail = document.getElementById("email").value;
    var verifiedEmail = safeInputEmail(userInpEmail);
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
            [emailResp, reqID] = data.message.split(',');
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
            verifyOTP([...otpInputs].map(inp => inp.value).join(''), reqID, emailResp);
        }
    });

    input.addEventListener('keydown', function (e) {
        if (e.key === 'Backspace' && this.value === '' && idx > 0) {
            otpInputs[idx - 1].focus();
        }
    });
});

function verifyOTP(otp, reqID, emailResp) {
    console.log('Verifying OTP:', otp);
    if (!reqID || emailResp != userInpEmail) {
        console.log("Invalid request.");
        return;
    }
    else 
    {
        console.log("Valid request."); 
        const response = fetch('http://127.0.0.1:5000/api/verifyOTP?otp=' + encodeURIComponent(otp) + '&requestID=' + encodeURIComponent(reqID) + '&email=' + encodeURIComponent(emailResp) + '&time=' + encodeURIComponent(Date.now()), 
        { method: 'GET',
            headers: {
            'Content-Type': 'application/json'
        },
         })
    response.then((res) => res.json()).then((data) => {
        if (data.status) {
            console.log("OTP verified successfully!");
        } else {
                if(data.error){
                console.log("Error: " + data.error);
            }
        }
    })
    }
    
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
