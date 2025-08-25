import nodemailer from "nodemailer";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();
let deploymentURL = "http://127.0.0.1:3000"
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generatetoken(email, otp, maxLength = 6) {
  const timestamp = Date.now();
  const hash = crypto
    .createHash("sha256")
    .update(email + otp + timestamp)
    .digest("base64")
    .replace(/[^a-zA-Z0-9]/g, "");
  return hash.substring(0, maxLength);
}




const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS
    }
  });



async function sendOTPMail(email, otp, token, state, operation, callback)
{
    let html = `
   <div style="max-width:500px;margin:0 auto;padding:40px 28px;
            background:#10141E;border-radius:14px;
            font-family:'Funnel Display',sans-serif;
            color:#EDEDED;box-shadow:0 6px 18px rgba(0,0,0,0.4);
            line-height:1.6;">

  <!-- Google Font -->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Funnel+Display:wght@300..800&display=swap');
  </style>

  <!-- Logo -->
  <div style="text-align:center;margin-bottom:24px;">
    <img src="https://firebasestorage.googleapis.com/v0/b/photoshare-edc8a.appspot.com/o/official_assests%2Flogo.png?alt=media&token=3fdc7573-9b2f-4607-81d8-39e1ae9a2b3c" 
         alt="Elixpo Blogs" 
         style="height:60px;filter:invert(1);" />
  </div>

  <!-- Title -->
  <h2 style="font-size:1.8em;text-align:center;margin:0 0 20px 0;color:#fff;font-weight:600;">
    Your verification code
  </h2>

  <!-- OTP Block -->
  <div style="text-align:center;margin-bottom:28px;">
    <span style="display:inline-block;font-size:1.6em;font-weight:700;
                 background:#1C2233;padding:14px 36px;border-radius:10px;
                 color:#C084FC;letter-spacing:2px;">
      ${otp}
    </span>
  </div>

  <!-- Instructions -->
  <p style="margin:0 0 12px 0;text-align:center;font-size:1.2em;color:#ccc;">
    Use this code to sign in to your <strong>Elixpo Blogs</strong> account.
  </p>
  <p style="margin:0 0 28px 0;font-size:1.1em;color:#888;text-align:center;">
    This code will expire in 10 minutes and can only be used once.
  </p>

  <!-- CTA Button -->
  <div style="text-align:center;margin:36px 0;">
    <a href="${deploymentURL}/src/auth/login?token=${token}&operation=${operation}&state=${state}&callback=true" 
       style="display:inline-block;padding:14px 40px;background:linear-gradient(135deg,#8B5CF6,#6D28D9);
              color:#fff;border-radius:32px;text-decoration:none;font-weight:600;font-size:1.05em;
              box-shadow:0 4px 12px rgba(139,92,246,0.4);">
      Sign in to Elixpo Blogs
    </a>
  </div>

  <!-- Footer -->
  <p style="font-size:1em;color:#ffc;text-align:center;margin:0;font-weight:600;">
    If you did not make this request, you can safely ignore this email.
  </p>
  <p style="font-size:1em;color:#ffc;text-align:center;margin-top:14px;">
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

//test mail 
// sendOTPMail("ayushbhatt633@gmail.com", "123456", "bljY0G", "elixpo-blogs", "login", false)

export { generateOTP, generatetoken, sendOTPMail };