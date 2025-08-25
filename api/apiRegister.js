import { db } from "./initializeFirebase.js";
import { appExpress, router } from "./initializeExpress.js";
import { generateOTP, generatetoken, sendOTPMail } from "./utility.js";
import MAX_EXPIRE_TIME from "./config.js";


// Registration request: send OTP to email
router.get("/registerRequest", async (req, res) => {
    const email = req.query.email;
    if (!email) {
        return res.status(400).json({ error: "🚫 Email is required to proceed with registration. Please provide a valid email address!" });
    }

    let otp = generateOTP();
    let token = generatetoken(email, otp);
    let otpConfirmation = await sendOTPMail(email, otp, token, "elixpo-blogs", "register", false);

    if (!otpConfirmation) {
        return res.status(500).json({ error: "❌ Failed to send OTP email. Please check your email address or try again later!" });
    }

    try {
        const regRef = db.ref(`registerAttempt/${token}`);
        await regRef.set({
            timestamp: Date.now(),
            email: email,
            otp: otp,
            requestType: "register",
            token: token,
            state: "elixpo-blogs",
            method: "email"
        });

        res.status(200).json({ message: `✅ OTP sent to ${email}! Please check your inbox.`, data: `${email},${token}` });
    } catch (error) {
        res.status(500).json({ error: "🔥 Internal server error while recording registration attempt. Please try again!" });
    }
});

// OTP verification and user creation
router.get("/verifyRegisterOTP", async (req, res) => {
    const { otp, token, email, time, callback } = req.query;
    if (!token) {
        return res.status(400).json({ error: "🔑 Request ID (token) missing. Please retry the registration process." });
    }

    try {
        const regRef = db.ref(`registerAttempt/${token}`);
        const snapshot = await regRef.once("value");
        const regData = snapshot.val();

        if (!regData || regData.token !== token || regData.email !== email) {
            return res.status(400).json({ error: "❗ Invalid/Expired registration request. Please check your email and try again." });
        }
        if (regData.timestamp < time - MAX_EXPIRE_TIME) {
            return res.status(400).json({ status: false, error: "⏰ OTP expired. Please request a new OTP." });
        }
        if (regData.otp !== otp) {
            return res.status(400).json({ status: false, error: "🚫 Invalid OTP entered. Please check and try again." });
        }

        // Check if user already exists
        const userRef = db.ref(`user/${email}`);
        const userSnap = await userRef.once("value");
        if (userSnap.exists()) {
            await regRef.remove();
            return res.status(400).json({ error: "⚠️ User already registered with this email." });
        }

        // Create user
        const uid = generatetoken(email, Date.now(), 12);
        await userRef.set({
            "name": "",
            "uid": uid,
            "datejoined": Date.now(),
            "blogs-written": [],
            "org-joined": [],
            "org-subdomain": "",
            "blog-reports": [],
            "profile pic link url": "",
            "org-id": "",
            "followers": [],
            "following": [],
            "locale": ""
        });

        await regRef.remove();
        res.status(200).json({ status: true, message: "✅ Registration successful! Welcome to Elixpo Blogs." });
    } catch (error) {
        res.status(500).json({ status: false, error: "🔥 Internal server error during registration. Please try again!" });
    }
});

// Start server
appExpress.listen(5000, "0.0.0.0", () => {
    console.log("Register server listening on http://0.0.0.0:5000");
});