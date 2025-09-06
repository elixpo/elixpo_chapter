import {OAuth2Client } from 'google-auth-library';
import {db, store, collec} from "./initializeFirebase.js";
import { appExpress, router } from "./initializeExpress.js";
import { generateOTP, generatetoken, sendOTPMail } from "./utility.js";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

dotenv.config();

import MAX_EXPIRE_TIME from "./config.js";

appExpress.use(cookieParser());
const googleClient = new OAuth2Client(process.env.google_auth_client_id);



function authenticateToken(req, res, next) {
    console.log("🔍 Authentication check started");
    console.log("📝 All cookies received:", req.cookies);
    console.log("📝 Raw cookie header:", req.headers.cookie);

    let token;
    try 
    {
      token = req.headers.cookie.split('=')[1];
    }
    catch(err)
    {
      token = null;
    }

    if (!token) {
        console.log("❌ No authToken cookie found");
        console.log("Available cookies:", Object.keys(req.cookies || {}));
        return res.status(401).json({ 
            authenticated: false, 
            error: "No authentication token found",
            debug: {
                cookiesReceived: req.cookies,
                cookieHeader: req.headers.cookie
            }
        });
    }

    console.log("🍪 Auth token found:", token.substring(0, 20) + "...");

    jwt.verify(token, process.env.secretJWTKEY, (err, user) => {
        if (err) {
            console.log("❌ JWT verification failed:", err.message);
            return res.status(403).json({ 
                authenticated: false, 
                error: "Invalid or expired token",
                debug: err.message
            });
        }
        
        console.log("✅ JWT verified for user:", user.email);
        req.user = user;
        next();
    });
}

router.get("/checkAuth", authenticateToken, (req, res) => {
    console.log("✅ Authentication successful for:", req.user.email);
    res.status(200).json({ 
        authenticated: true, 
        user: { 
            email: req.user.email,
            token: req.user.token,
            uid: req.user.uid
        } 
    });
});



router.post("/logout", (req, res) => {
    console.log("🚪 Logout request received");
    console.log("Current cookies before logout:", req.cookies);
    
    res.clearCookie("authToken", { 
        httpOnly: true, 
        secure: false, 
        sameSite: "Lax" 
    });
    
    console.log("✅ Auth cookie cleared");
    res.status(200).json({ message: "✅ Logged out successfully!" });
});


router.post("/googleLogin", async (req, res) => {
    const { idToken, remember } = req.body;
    if (!idToken) {
        return res.status(400).json({ error: "🚫 ID Token is required for Google login." });
    }
    let ticket, payload, email;
    try {
        ticket = await googleClient.verifyIdToken({
            idToken,
            audience: process.env.google_auth_client_id,
        });
        payload = ticket.getPayload();
        email = payload.email;
    } catch (err) {
        return res.status(401).json({ error: "Invalid Google token." });
    }

    const usersRef = collec.collection("users");
    const userSnapshot = await usersRef.where("email", "==", email).limit(1).get();
    let userDoc, userData, uid;

    if (!userSnapshot.empty) {
        
        userDoc = userSnapshot.docs[0];
        userData = userDoc.data();
        uid = userDoc.id;
        if (userData.joinedVia === "github") {
            return res.status(403).json({ error: "Account registered with GitHub. Please use GitHub login." });
        }
        if (userData.accountStatus === "suspended") {
            return res.status(403).json({ error: "Account suspended. Contact support." });
        }
        if (userData.accountStatus === "deactivated") {
            return res.status(403).json({ error: "Account deactivated. Contact support." });
        }
    } else {
        
        uid = generatetoken(email, Date.now(), 12);
        await usersRef.doc(uid).set({
            name: payload.name || "",
            email: email,
            uid: uid,
            dateJoined: Date.now(),
            blogsWritten: {},
            orgJoined: {},
            orgSubdomain: "",
            blogReports: {},
            profilePicLink: payload.picture || "",
            orgId: "",
            followers: {},
            following: {},
            locale: payload.locale || "",
            joinedVia: "google",
            bio: ""
        });
    }


    const jwtPayload = { email, uid, token: generatetoken(email, Date.now()) };
    const expiresIn = "30d";
    const cookieMaxAge = 30 * 24 * 60 * 60 * 1000;
    const jwtToken = jwt.sign(jwtPayload, process.env.secretJWTKEY, { expiresIn });

    res.cookie("authToken", jwtToken, {
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
        maxAge: cookieMaxAge
    });

    res.status(200).json({ status: true, message: "Google login successful!", user: { email, uid } });
});

router.get("/loginRequest", async (req, res) => {
  const email = req.query.email;
  const remember = req.query.remember === 'true';
  if (!email) {
    return res.status(400).json({ error: "🚫 Email is required to proceed with login. Please provide a valid email address!" });
  }

  let otp = generateOTP();
  let token = generatetoken(email, otp);
  let otpConfirmation = await sendOTPMail(email, otp, token, "elixpo-blogs", "login", false);
  const usersRef = collec.collection("users");
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
    console.log("Writing to Firebase:", { email, otp, token, remember });
    const loginRef = db.ref(`loginAttempt/${token}`);
    await loginRef.set({
      timestamp: Date.now(),
      email: email,
      otp: otp,
      requestType: "login",
      token: token,
      state: "elixpo-blogs",
      method: "email",
      remember: remember
    });

    res.status(200).json({ message: `✅ OTP sent to ${email}! Please check your inbox.`, data: `${email},${token}`});
  } catch (error) {
    res.status(500).json({ error: "🔥 Internal server error while recording login attempt. Please try again!" });
  }
});

router.get("/verifyLoginOTP", async (req, res) => {
  const { otp, token, email, time, operation, state, callback, remember } = req.query;
  if (!token)
  {
    return res.status(400).json({ error: "🔑 Request ID (token) missing. Please retry the login process." });
  }
  let userUID = null;
  const usersRef = collec.collection("users");
  const userSnapshot = await usersRef.where("email", "==", email).limit(1).get();
  if (!userSnapshot.empty) {
    const userDoc = userSnapshot.docs[0];
    userUID = userDoc.id;
    console.log("🆔 User UID:", userUID);
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
        const payload = {email: loginData.email, token: loginData.token, uid: userUID };
        console.log("🔐 JWT Payload being signed:", payload); 
        const rememberUser = remember === 'true' || loginData.remember === true;
        const expiresIn = rememberUser ? "30d" : "2h"; 
        const cookieMaxAge = rememberUser ? 30 * 24 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000; 
        const jwtToken = jwt.sign(payload, process.env.secretJWTKEY, { expiresIn: expiresIn });
        
        console.log("🍪 Setting auth cookie for:", loginData.email);
        console.log("🍪 Cookie options:", { 
          httpOnly: true, 
          secure: false, 
          sameSite: "Lax", 
          maxAge: cookieMaxAge 
        });
        console.log("🍪 JWT Token", jwtToken);
        
        res.cookie("authToken", jwtToken, { 
          httpOnly: true, 
          secure: false, 
          sameSite: "Lax", 
          maxAge: cookieMaxAge 
        });
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
      if(loginData && loginData.otp === otp && loginData.token === token && loginData.email === email && loginData.timestamp >= time - MAX_EXPIRE_TIME){

        const payload = {email: loginData.email, token: loginData.token, uid: userUID }; ;
        const rememberUser = remember === 'true' || loginData.remember === true;
        const expiresIn = rememberUser ? "30d" : "2h"; 
        const cookieMaxAge = rememberUser ? 30 * 24 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000; 
        const jwtToken = jwt.sign(payload, process.env.secretJWTKEY, { expiresIn: expiresIn });
        
        console.log("🍪 Setting auth cookie for:", loginData.email);
        console.log("🍪 Cookie options:", { 
          httpOnly: true, 
          secure: false, 
          sameSite: "Lax", 
          maxAge: cookieMaxAge 
        });
        console.log("🍪 JWT Token", jwtToken);
        
        res.cookie("authToken", jwtToken, { 
          httpOnly: true, 
          secure: false, 
          sameSite: "Lax", 
          maxAge: cookieMaxAge 
        });
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

appExpress.listen(5000, "localhost", () => {
  console.log("Server listening on http://localhost:5000");
});