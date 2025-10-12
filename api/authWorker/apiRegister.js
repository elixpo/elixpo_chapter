import { db, collec } from "../initializeFirebase.js";
import { generateOTP, generatetoken, sendOTPMail, createFirebaseUser, generateUID } from "../utility.js";
import {checkInBloomFilter, checkUserNameFormat, suggestUserName, addNameToBloomRedisDB } from "./bloomfiltercheck.js";
import MAX_EXPIRE_TIME from "../config.js";




export async function registerRequest(email, req, res) {
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
}

export async function verifyRegisterOTP(otp, token, email, time, callback, req, res)
{
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

        const uid = generatetoken(email, Date.now(), 12);

        checkExistingUserEmail(uid).then((exists) => {
            if (exists) {
                return res.status(400).json({ status: false, error: "🚫 Email already registered. Please log in instead." });
            }
        });


        let country = "";
        try {
            const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.connection.remoteAddress;
            const fetch = (await import("node-fetch")).default;
            const geoRes = await fetch(`http://ip-api.com/json/${ip}`);
            const geoData = await geoRes.json();
            if (geoData && geoData.country) {
            country = geoData.country;
            }
        } catch (e) {
            country = "";
        }

        await createFirebaseUser(email, "", "", "email").then(async (newUid) => {
            console.log("New user created with UID:", newUid);
            uid = newUid;
            const userData = {
            uid: uid, 
            email
            };
            firebaseUser = await auth.createUser(userData);
            if (firebaseUser) 
            {
                console.log("Firebase Auth user created:", firebaseUser.uid);
            }
            else 
            {
                throw new Error("Firebase Auth user creation failed");
            }
            return
            
        }).catch((error) => {
            console.error("Error creating user:", error);
            throw error;
        });
        await regRef.remove();
        res.status(200).json({ status: true, message: "✅ Registration successful! Welcome to Elixpo Blogs." });
        } catch (error) {
        res.status(500).json({ status: false, error: "🔥 Internal server error during registration. Please try again!" });
    }
}


async function checkExistingUserEmail(uid)
{
    const generateUID = generateUID(email, 12);
    const userRef = collec.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (userSnap.exists) {
        return true;
    }

}

// Function connects with api gateway
export async function registerDisplayName(username, uid, req, res)
{
    const sanitized = checkUserNameFormat(username);
  if (sanitized !== username) {
    return res.status(400).json({ success: false, message: sanitized });
  }
  const exists = await checkInBloomFilter(sanitized.toLowerCase());
  if (exists) {
    const userNameSuggested = suggestUserName(sanitized);
    return res.status(200).json({ success: false, message: "Username is already taken.", suggestion: userNameSuggested });
  } else {

    const added = addNameToBloomRedisDB(sanitized, uid);
    if (added) {

      return res.status(200).json({ success: true, message: "Username is available!" });

    } else {
      return res.status(500).json({ success: false, message: "Failed to add username to bloom filter." });
    }
  }
}

