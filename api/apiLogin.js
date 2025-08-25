import {db, store, collec} from "./initializeFirebase.js";
import { appExpress, router } from "./initializeExpress.js";
import { generateOTP, generatetoken, sendOTPMail } from "./utility.js";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
dotenv.config();



import MAX_EXPIRE_TIME from "./config.js";

router.get("/loginRequest", async (req, res) => {
  const email = req.query.email;
  
  if (!email) {
    // Fancy error notification for missing email
    return res.status(400).json({ error: "🚫 Email is required to proceed with login. Please provide a valid email address!" });
  }

  let otp = generateOTP();
  let token = generatetoken(email, otp);
  let otpConfirmation = await sendOTPMail(email, otp, token, "elixpo-blogs", "login", false);
  const usersRef = store.collection("users");


  const userSnapshot = await usersRef.where("email", "==", email).limit(1).get();
  if (userSnapshot.empty) {
    return res.status(404).json({ error: "❗ Email not registered. Please sign up before logging in." });
  }
  else if(userSnapshot.size > 1)
  {
    return res.status(500).json({ error: "🔥 Multiple accounts found with this email. Please contact support." });
  }
  else if(userSnapshot.size === 1)
  {
    const userDoc = userSnapshot.docs[0];
    const userData = userDoc.data();
    if(userData.accountStatus && userData.accountStatus === "suspended")
    {
      return res.status(403).json({ error: "🚫 Account suspended. Please contact support for assistance." });
    }
    if(userData.accountStatus && userData.accountStatus === "deactivated")
    {
      return res.status(403).json({ error: "🚫 Account deactivated. Please contact support for assistance." });
    }
    if(userData.joinedVia && userData.joinedVia !== "email")
    {
      return res.status(403).json({ error: "🚫 The account was created using " + userData.joinedVia + " provider. Please use the same provider to log back in!"});
    }
  }

  if(!otpConfirmation)
  {
    return res.status(500).json({ error: "❌ Failed to send OTP email. Please check your email address or try again later!" });
  }

  try {
    console.log("Writing to Firebase:", { email, otp, token });
    const loginRef = db.ref(`loginAttempt/${token}`);
    await loginRef.set({
      timestamp: Date.now(),
      email: email,
      otp: otp,
      requestType: "login",
      token: token,
      state: "elixpo-blogs",
      method: "email"
    });

    res.status(200).json({ message: `✅ OTP sent to ${email}! Please check your inbox.`, data: `${email},${token}`});
  } catch (error) {
    // Fancy error notification for Firebase write error
    res.status(500).json({ error: "🔥 Internal server error while recording login attempt. Please try again!" });
  }
});


router.get("/verifyLoginOTP", async (req, res) => {
  const { otp, token, email, time, operation, state, callback, remember } = req.query;
  if (!token)
  {
    // Fancy error notification for missing token
    return res.status(400).json({ error: "🔑 Request ID (token) missing. Please retry the login process." });
  }

  try {
    if(callback)
    {
      console.log("checking from the callback")
      const loginRef = db.ref(`loginAttempt/${token}`);
      if(!loginRef)
      {
        return res.status(400).json({ error: "❗ Invalid/Expired login request. Please check your email and try again." });
      }
      const snapshot = await loginRef.once("value");
      const loginData = snapshot.val();
      if(loginData && loginData.requestType === operation && loginData.state == state && loginData.token === token && loginData.timestamp >= time - MAX_EXPIRE_TIME){
        const payload = {email: loginData.email, token: loginData.token};
        const expiresIn = remember === true ? "30d" : "2h"; 
        const cookieMaxAge = remember === "true" ? 30 * 24 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000; 
        const jwtToken = jwt.sign(payload, process.env.secretJWTKEY, { expiresIn: expiresIn });
        res.cookie("authToken", jwtToken, { httpOnly: true, secure: false, sameSite: "Lax", maxAge: cookieMaxAge });
        res.status(200).json({ status: true, message: "✅ OTP verified! Welcome to Elixpo Blogs." });
        db.ref(`loginAttempt/${token}`).remove();
      }
    }
    else if(!callback)
    {
      const loginRef = db.ref(`loginAttempt/${token}`);
      if(!loginRef)
      {
        return res.status(400).json({ error: "❗ Invalid/Expired login request. Please check your email and try again." });
      }
      const snapshot = await loginRef.once("value");
      const loginData = snapshot.val();
      if(loginData.otp === otp && loginData.token === token && loginData.email === email && loginData.timestamp >= time - MAX_EXPIRE_TIME){

        const payload = {email: loginData.email, token: loginData.token};
        const expiresIn = remember === true ? "30d" : "2h"; 
        const cookieMaxAge = remember === "true" ? 30 * 24 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000; 
        const jwtToken = jwt.sign(payload, process.env.secretJWTKEY, { expiresIn: expiresIn });
        res.cookie("authToken", jwtToken, { httpOnly: true, secure: false, sameSite: "Lax", maxAge: cookieMaxAge });
       res.status(200).json({ status: true, message: "✅ OTP verified! Welcome to Elixpo Blogs." });
       db.ref(`loginAttempt/${token}`).remove();
       return;
      }
      else if (!loginData || loginData.email !== email) {
      return res.status(400).json({ error: "❗ Invalid login request. Please check your email and try again." });
      }
      else if (loginData.timestamp < time - MAX_EXPIRE_TIME) {
        return res.status(400).json({ status: false, error: "⏰ OTP expired. Please request a new OTP." });
      }
      else if (loginData.otp !== otp) {
        return res.status(400).json({ status: false, error: "🚫 Invalid OTP entered. Please check and try again." });
      }
    }
  } catch (error) {
    res.status(500).json({ status: false, error: "🔥 Internal server error during OTP verification. Please try again!" });
  }
});



// Start server
appExpress.listen(5000, "0.0.0.0", () => {
  console.log("Server listening on http://0.0.0.0:5000");
});
