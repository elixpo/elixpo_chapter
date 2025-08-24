import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";
import crypto from "crypto";
import admin from "firebase-admin";
import { readFileSync } from "fs";
import dotenv from 'dotenv'

dotenv.config();

// Load service account key
const serviceAccount = JSON.parse(
  readFileSync("./database.json", "utf-8")
);

// Initialize Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://photoshare-edc8a-default-rtdb.firebaseio.com/"
});

const db = admin.database(); 

// Express setup
const appExpress = express();
appExpress.use(cors({
  origin: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5500",
    "http://127.0.0.1:5500"
  ],
  credentials: true
}));

const router = express.Router();
appExpress.use("/api", router);

// Routes
router.get("/loginRequest", async (req, res) => {
  const email = req.query.email;
  if (!email) {
    return res.status(400).json({ error: "Email query parameter is required." });
  }

  let otp = generateOTP();
  let requestID = generateRequestID(email, otp);
  let otpConfirmation = await sendOTPMail(email, otp);
    if(!otpConfirmation)
    {
      return res.status(500).json({ error: "Failed to send OTP email." });
    }
  try {
    console.log("Writing to Firebase:", { email, otp, requestID });
    const loginRef = db.ref(`loginAttempt/${requestID}`);
    await loginRef.set({
      timestamp: Date.now(),
      email: email,
      otp: otp,
      requestType: "login",
      requestID: requestID,
      state: "elixpo-blogs"
    });

    res.status(200).json({ message: "Login attempt recorded." });
  } catch (error) {
    console.error("Firebase write error:", error);
    res.status(500).json({ error: "Failed to record login attempt." });
  }
});

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateRequestID(email, otp) {
  const timestamp = Date.now();
  const hash = crypto
    .createHash("sha256")
    .update(email + otp + timestamp)
    .digest("base64")
    .replace(/[^a-zA-Z0-9]/g, "");
  return hash.substring(0, 6);
}




const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS
    }
  });



async function sendOTPMail(email, otp)
{
    let html = `
      <div style="max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;border-radius:8px;font-family:Georgia,serif;color:#222;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
      <div style="text-align:center;">
        <img src="https://firebasestorage.googleapis.com/v0/b/photoshare-edc8a.appspot.com/o/official_assests%2Flogo.png?alt=media&token=3fdc7573-9b2f-4607-81d8-39e1ae9a2b3c" alt="Elixpo Blogs" style="height:48px;margin-bottom:16px; filter: invert(1);" />
        <h2 style="font-size:1.5em;margin:0 0 16px 0;">Your code is <span style="font-family:monospace;">${otp}</span></h2>
      </div>
      <p style="margin:24px 0 8px 0;">Use this code to sign in to your Elixpo Blogs account.</p>
      <p style="margin:0 0 16px 0;font-size:0.95em;color:#555;">
        This code will expire in 10 minutes and can only be used once.
      </p>
      <div style="text-align:center;margin:32px 0;">
        <a href="https://blogs.elixpo.com/auth/login" style="display:inline-block;padding:12px 32px;background:#222;color:#fff;border-radius:24px;text-decoration:none;font-weight:bold;font-size:1em;">
        Sign in to Elixpo Blogs
        </a>
      </div>
      <p style="font-size:0.93em;color:#888;">
        If you did not make this request, you can safely ignore this email.<br>
        <br>
        — The Elixpo Blogs Team
      </p>
      </div>
    `;
      try {
    await transporter.sendMail({
      from: `"Elixpo" <${process.env.MAIL_USER}>`,
      to: email,
      subject: `OTP Login Request to Elixpo --`,
      html
    });

    return true;
  } catch (err) {
    console.error('Error sending mail:', err);
    return false;
  }
}


// Start server
appExpress.listen(5000, "0.0.0.0", () => {
  console.log("Server listening on http://0.0.0.0:5000");
});
