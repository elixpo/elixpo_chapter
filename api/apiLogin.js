import { db, collec, auth } from "./initializeFirebase.js";
import { appExpress, router } from "./initializeExpress.js";
import { 
  generateOTP, 
  generatetoken, 
  sendOTPMail, 
  createFirebaseUser,  
  generateUID,
  getCountryFromIP 
} from "./utility.js";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { OAuth2Client } from "google-auth-library";

dotenv.config();

import MAX_EXPIRE_TIME from "./config.js";



const client = new OAuth2Client(process.env.google_auth_client_id);


function issueJwt(uid, email, rememberUser = false) {
  const jwtPayload = { email, uid: uid };
  const expiresIn = rememberUser ? "30d" : "2h";
  const jwtToken = jwt.sign(jwtPayload, process.env.secretJWTKEY, { expiresIn });
  return jwtToken;
}

async function authenticateToken(req, res, next) {
    console.log("🔍 Authentication check started");
    console.log("📝 All cookies received:", req.cookies);
    console.log("📝 Raw cookie header:", req.headers.cookie);

    let token = null;
    // If using cookie-parser, use req.cookies.authToken
    if (req.cookies && req.cookies.authToken) {
        token = req.cookies.authToken;
    } else if (req.headers.cookie) {
        // Manual fallback: parse cookie string
        const match = req.headers.cookie.match(/authToken=([^;]+)/);
        if (match) token = match[1];
    }

    if (!token) {
        console.log("❌ No authToken cookie found");
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
  res.status(200).json({ 
    authenticated: true, 
    user: { email: req.user.email, uid: req.user.uid } 
  });
});


router.post("/logout", (req, res) => {
  res.clearCookie("authToken", { httpOnly: true, secure: false, sameSite: "Lax" });
  res.status(200).json({ message: "✅ Logged out successfully!" });
});



router.post("/loginGithub", async (req, res) => {
  const { code, state } = req.body;
  console.log("Received GitHub code:", code);

  if (!code) return res.status(400).json({ error: "Missing authorization code" });
  if (state !== "elixpo-blogs") return res.status(400).json({ error: "Invalid state" });

  try {
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.github_auth_client_id,
        client_secret: process.env.github_auth_client_secret,
        code,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error("❌ GitHub token exchange error:", tokenData.error);
      return res.status(400).json({ error: "Failed to exchange authorization code" });
    }

    const accessToken = tokenData.access_token;
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    const githubUser = await userResponse.json();

    if (!githubUser.email) {
      const emailResponse = await fetch("https://api.github.com/user/emails", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const emails = await emailResponse.json();
      const primaryEmail = emails.find((e) => e.primary);
      githubUser.email = primaryEmail ? primaryEmail.email : null;
    }

    if (!githubUser.email) {
      return res.status(400).json({ error: "GitHub account must have an email address" });
    }

    const email = githubUser.email.toLowerCase();
    const name = githubUser.name || githubUser.login || "";
    const photo = githubUser.avatar_url || "";
    const uid = generateUID(email, 12);

    const userDocRef = collec.collection("users").doc(uid);
    const userSnap = await userDocRef.get();

    let authUser = null;
    try {
      authUser = await auth.getUserByEmail(email);
    } catch (e) {
      authUser = null;
    }

    let ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || req.ip;
    const country = await getCountryFromIP(ip);
    console.log(`GitHub login attempt from IP: ${ip}, Country: ${country}`);

    if (!userSnap.exists && !authUser) {
      await createFirebaseUser(email, name, photo, "github", country);
      await auth.createUser({ uid, email, displayName: name });
    } else if (!userSnap.exists && authUser) {
      await createFirebaseUser(email, authUser.displayName || name, authUser.photoURL || photo, "github", country);
    } else if (userSnap.exists && !authUser) {
      const userData = userSnap.data();
      await auth.createUser({ uid, email, displayName: userData.displayName || name });
    } else {
      const userData = userSnap.data();
      if (userData.provider && userData.provider !== "github") {
        return res.status(403).json({
          error: `This account was registered with ${userData.provider}. Use correct login method.`,
        });
      }
    }

    
    const token = issueJwt(uid, email, true); 
    res.cookie("authToken", token, {
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
      maxAge: 30 * 24 * 60 * 60 * 1000, 
      path: "/"
    });

    console.log("✅ GitHub login successful, cookie set");

    return res.json({
      status: true,
      user: { uid, email, name, photo },
      message: "GitHub login successful!"
    });
  } catch (err) {
    console.error("❌ Error during GitHub login:", err.message);
    return res.status(500).json({ error: "Internal server error during GitHub login." });
  }
});

router.post("/loginGoogle", async (req, res) => {
  const { idToken } = req.body;
  console.log("Received idToken:", idToken);
  if (!idToken) return res.status(400).json({ error: "Missing idToken" });
  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: "796328864956-hn8dcs3t1i3kui6qd8pvhhblj5c8c66k.apps.googleusercontent.com",
    });
    const payload = ticket.getPayload();
    const email = payload.email.toLowerCase();
    const name = payload.name || "";
    const photo = payload.picture || "";
    const uid = generateUID(email, 12);

    const userDocRef = collec.collection("users").doc(uid);
    const userSnap = await userDocRef.get();

    let authUser = null;
    try {
      authUser = await auth.getUserByEmail(email);
    } catch (e) {
      authUser = null;
    }

    let ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress || req.socket.remoteAddress || req.ip;
    const country = await getCountryFromIP(ip);
    console.log(`Login attempt from IP: ${ip}, Country: ${country}`);


    if (!userSnap.exists && !authUser) {
      await createFirebaseUser(email, name, photo, "google", country);
      await auth.createUser({ uid, email, displayName: name });
    } else if (!userSnap.exists && authUser) {
      await createFirebaseUser(email, authUser.displayName || name, authUser.photoURL || photo, "google", country);
    } else if (userSnap.exists && !authUser) {
      const userData = userSnap.data();
      await auth.createUser({ uid, email, displayName: userData.displayName || name });
    } else {
      const userData = userSnap.data();
      if (userData.provider && userData.provider !== "google") {
        return res.status(403).json({ error: `This account was registered with ${userData.provider}. Use correct login method.` });
      }
    }

    const token = issueJwt(uid, email);
    res.cookie("authToken", token, { httpOnly: true, secure: false, sameSite: "Lax", maxAge: 2 * 60 * 60 * 1000 });
    return res.json({ status: true, user: { uid, email } });

  } catch (err) {
    console.error("❌ Error during Google login:", err.message);
    return res.status(500).json({ error: "Internal server error during Google login." });
  }
});


router.get("/loginRequest", async (req, res) => {
  const email = req.query.email?.toLowerCase();
  const remember = req.query.remember === "true";
  if (!email) {
    return res.status(400).json({ error: "🚫 Email is required" });
  }

  const uid = generateUID(email, 12);
  const userDocRef = collec.collection("users").doc(uid);
  const userDocSnap = await userDocRef.get();

  if (!userDocSnap.exists) {
    return res.status(404).json({ error: "No account found with this email. Please register first." });
  }

  const userData = userDocSnap.data();
  if (userData.provider !== "email") {
    return res.status(403).json({ error: `This account was registered with ${userData.provider}. Use correct login method.` });
  }

  try {
    await auth.getUserByEmail(email);
  } catch (e) {
    await auth.createUser({ uid, email, displayName: userData.displayName || "" });
  }

  const otp = generateOTP();
  const token = generatetoken(email, otp);

  const otpSent = await sendOTPMail(email, otp, token, "elixpo-blogs", "login", false);
  if (!otpSent) {
    return res.status(500).json({ error: "❌ Failed to send OTP email." });
  }

  await db.ref(`loginAttempt/${token}`).set({
    timestamp: Date.now(),
    email,
    otp,
    requestType: "login",
    token,
    state: "elixpo-blogs",
    method: "email",
    remember,
  });

  res.status(200).json({ message: `✅ OTP sent to ${email}`, data: `${email},${token}` });
});


router.get("/verifyLoginOTP", async (req, res) => {
  const { otp, token, email, time, operation, state, callback, remember } = req.query;
  if (!token) return res.status(400).json({ error: "🔑 Request ID missing." });

  const uid = generateUID(email, 12);
  const loginRef = db.ref(`loginAttempt/${token}`);
  const snapshot = await loginRef.once("value");
  const loginData = snapshot.val();

  if (!loginData) {
    return res.status(400).json({ error: "❗ Invalid/Expired login request." });
  }

  if (callback) {
    if (loginData.requestType === operation && loginData.state === state && loginData.token === token && loginData.timestamp >= time - MAX_EXPIRE_TIME) {
      const rememberUser = remember === "true" || loginData.remember === true;
      const jwtToken = issueJwt(uid, loginData.email, rememberUser);
      const cookieMaxAge = rememberUser ? 30 * 24 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000;

      res.cookie("authToken", jwtToken, { httpOnly: true, secure: false, sameSite: "Lax", maxAge: cookieMaxAge });
      db.ref(`loginAttempt/${token}`).remove();
      return res.status(200).json({ status: true, message: "✅ OTP verified!" });
    }
  } else {
    if (loginData.otp === otp && loginData.email === email && Date.now() - loginData.timestamp <= MAX_EXPIRE_TIME) {
      const rememberUser = remember === "true" || loginData.remember === true;
      const jwtToken = issueJwt(uid, loginData.email, rememberUser);
      const cookieMaxAge = rememberUser ? 30 * 24 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000;

      res.cookie("authToken", jwtToken, { httpOnly: true, secure: false, sameSite: "Lax", maxAge: cookieMaxAge });
      db.ref(`loginAttempt/${token}`).remove();
      return res.status(200).json({ status: true, message: "✅ OTP verified!" });
    } else if (Date.now() - loginData.timestamp > MAX_EXPIRE_TIME) {
      return res.status(400).json({ status: false, error: "⏰ OTP expired." });
    } else {
      return res.status(400).json({ status: false, error: "🚫 Invalid OTP." });
    }
  }
});

appExpress.listen(5000, "localhost", () => {
  console.log("Server running at http://localhost:5000");
});
