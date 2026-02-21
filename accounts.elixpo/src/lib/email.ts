/**
 * Email Service Utilities
 * Handles sending emails via Zoho SMTP with various templates
 */

import nodemailer from 'nodemailer';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

interface TransporterConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

// Initialize Zoho SMTP Transporter
const getTransporter = () => {
  const config: TransporterConfig = {
    host: process.env.SMTP_HOST || 'smtp.zoho.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_FROM_EMAIL || '',
      pass: process.env.SMTP_PASS || '',
    },
  };

  if (!config.auth.user || !config.auth.pass) {
    throw new Error('SMTP credentials not configured in environment variables');
  }

  return nodemailer.createTransport(config);
};

// Send email
export async function sendEmail(options: EmailOptions): Promise<void> {
  try {
    const transporter = getTransporter();

    const mailOptions = {
      from: `${process.env.SMTP_FROM_NAME || 'Elixpo'} <${process.env.SMTP_FROM_EMAIL}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(`[Email] Sent successfully to ${options.to}. Message ID: ${result.messageId}`);
  } catch (error) {
    console.error('[Email] Error sending email:', error);
    throw error;
  }
}

export const emailTemplates = {
  // OTP Verification Email
  otp: (recipientName: string, otpCode: string, expiryMinutes: number = 10) => ({
    subject: '🔐 Your Elixpo Verification Code',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              background-color: #f5f5f5;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 40px auto;
              background-color: white;
              border-radius: 8px;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
              overflow: hidden;
            }
            .header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 40px 20px;
              text-align: center;
            }
            .header h1 {
              margin: 0;
              font-size: 28px;
              font-weight: 700;
            }
            .content {
              padding: 40px 30px;
            }
            .greeting {
              font-size: 16px;
              color: #333;
              margin-bottom: 20px;
            }
            .otp-section {
              background-color: #f8f9fa;
              border: 2px dashed #667eea;
              border-radius: 8px;
              padding: 30px;
              text-align: center;
              margin: 30px 0;
            }
            .otp-code {
              font-size: 32px;
              font-weight: 700;
              color: #667eea;
              letter-spacing: 8px;
              font-family: 'Courier New', monospace;
              margin: 20px 0;
            }
            .otp-info {
              font-size: 14px;
              color: #666;
              margin-top: 15px;
            }
            .expiry {
              color: #e74c3c;
              font-weight: 600;
            }
            .footer {
              background-color: #f8f9fa;
              padding: 20px;
              text-align: center;
              font-size: 12px;
              color: #666;
              border-top: 1px solid #e0e0e0;
            }
            .security-note {
              background-color: #fff3cd;
              border-left: 4px solid #ffc107;
              padding: 15px;
              margin: 30px 0;
              border-radius: 4px;
              font-size: 14px;
              color: #856404;
            }
            a {
              color: #667eea;
              text-decoration: none;
            }
            a:hover {
              text-decoration: underline;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 Verification Code</h1>
            </div>
            <div class="content">
              <p class="greeting">Hi ${recipientName},</p>
              <p>Your one-time password (OTP) for email verification is:</p>
              
              <div class="otp-section">
                <p class="otp-info">Your verification code:</p>
                <div class="otp-code">${otpCode}</div>
                <p class="otp-info">This code will expire in <span class="expiry">${expiryMinutes} minutes</span></p>
              </div>

              <div class="security-note">
                <strong>🔒 Security Note:</strong> Never share this code with anyone. We will never ask for this code via email or phone.
              </div>

              <p>If you didn't request this verification code, please ignore this email.</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Elixpo. All rights reserved.</p>
              <p><a href="${process.env.NEXT_PUBLIC_APP_URL}">Visit Elixpo</a></p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `Your Elixpo verification code is: ${otpCode}\nThis code will expire in ${expiryMinutes} minutes.\n\nIf you didn't request this, please ignore this email.`,
  }),

  // Password Reset Email
  passwordReset: (recipientName: string, resetLink: string, expiryHours: number = 24) => ({
    subject: '🔑 Reset Your Elixpo Password',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              background-color: #f5f5f5;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 40px auto;
              background-color: white;
              border-radius: 8px;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
              overflow: hidden;
            }
            .header {
              background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
              color: white;
              padding: 40px 20px;
              text-align: center;
            }
            .header h1 {
              margin: 0;
              font-size: 28px;
              font-weight: 700;
            }
            .content {
              padding: 40px 30px;
            }
            .greeting {
              font-size: 16px;
              color: #333;
              margin-bottom: 20px;
            }
            .button-container {
              text-align: center;
              margin: 40px 0;
            }
            .reset-button {
              display: inline-block;
              background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
              color: white;
              padding: 16px 40px;
              border-radius: 6px;
              text-decoration: none;
              font-weight: 600;
              font-size: 16px;
              transition: transform 0.2s;
            }
            .reset-button:hover {
              transform: scale(1.05);
            }
            .info-box {
              background-color: #f8f9fa;
              border-left: 4px solid #f5576c;
              padding: 15px;
              margin: 20px 0;
              border-radius: 4px;
            }
            .warning {
              background-color: #fff3cd;
              border-left: 4px solid #ffc107;
              padding: 15px;
              margin: 20px 0;
              border-radius: 4px;
              font-size: 14px;
              color: #856404;
            }
            .footer {
              background-color: #f8f9fa;
              padding: 20px;
              text-align: center;
              font-size: 12px;
              color: #666;
              border-top: 1px solid #e0e0e0;
            }
            a {
              color: #f5576c;
              text-decoration: none;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔑 Password Reset</h1>
            </div>
            <div class="content">
              <p class="greeting">Hi ${recipientName},</p>
              <p>We received a request to reset the password for your Elixpo account. Click the button below to set a new password:</p>
              
              <div class="button-container">
                <a href="${resetLink}" class="reset-button">Reset Password</a>
              </div>

              <p>Or copy and paste this link in your browser:</p>
              <div class="info-box">
                <code style="word-break: break-all; color: #667eea;">${resetLink}</code>
              </div>

              <div class="warning">
                <strong>⏰ Important:</strong> This link will expire in <strong>${expiryHours} hours</strong>. If you don't reset your password within this time, you'll need to request a new password reset.
              </div>

              <p><strong>Didn't request a password reset?</strong></p>
              <p>If you didn't request this password reset, you can safely ignore this email. Your account is secure and your password hasn't been changed.</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Elixpo. All rights reserved.</p>
              <p><a href="${process.env.NEXT_PUBLIC_APP_URL}">Visit Elixpo</a></p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `Click here to reset your password: ${resetLink}\n\nThis link will expire in ${expiryHours} hours.`,
  }),

  // Sign Up Confirmation Email
  signupConfirmation: (recipientName: string, verificationLink: string) => ({
    subject: '👋 Welcome to Elixpo! Verify Your Email',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              background-color: #f5f5f5;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 40px auto;
              background-color: white;
              border-radius: 8px;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
              overflow: hidden;
            }
            .header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 40px 20px;
              text-align: center;
            }
            .header h1 {
              margin: 0;
              font-size: 28px;
              font-weight: 700;
            }
            .content {
              padding: 40px 30px;
            }
            .greeting {
              font-size: 16px;
              color: #333;
              margin-bottom: 20px;
            }
            .features {
              background-color: #f8f9fa;
              padding: 25px;
              border-radius: 6px;
              margin: 30px 0;
            }
            .feature-item {
              display: flex;
              align-items: center;
              margin: 15px 0;
              font-size: 14px;
              color: #555;
            }
            .feature-icon {
              width: 24px;
              height: 24px;
              background-color: #667eea;
              color: white;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              margin-right: 12px;
              font-weight: bold;
              font-size: 14px;
            }
            .button-container {
              text-align: center;
              margin: 40px 0;
            }
            .verify-button {
              display: inline-block;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 16px 40px;
              border-radius: 6px;
              text-decoration: none;
              font-weight: 600;
              font-size: 16px;
              transition: transform 0.2s;
            }
            .verify-button:hover {
              transform: scale(1.05);
            }
            .footer {
              background-color: #f8f9fa;
              padding: 20px;
              text-align: center;
              font-size: 12px;
              color: #666;
              border-top: 1px solid #e0e0e0;
            }
            a {
              color: #667eea;
              text-decoration: none;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>👋 Welcome to Elixpo!</h1>
            </div>
            <div class="content">
              <p class="greeting">Hi ${recipientName},</p>
              <p>Thank you for signing up! We're excited to have you on board. To get started, please verify your email address by clicking the button below:</p>
              
              <div class="button-container">
                <a href="${verificationLink}" class="verify-button">Verify Email</a>
              </div>

              <div class="features">
                <p style="margin: 0 0 20px 0; font-weight: 600; color: #333;">What you can do with Elixpo:</p>
                <div class="feature-item">
                  <div class="feature-icon">✓</div>
                  <span>Manage your accounts securely</span>
                </div>
                <div class="feature-item">
                  <div class="feature-icon">✓</div>
                  <span>Connect multiple OAuth providers</span>
                </div>
                <div class="feature-item">
                  <div class="feature-icon">✓</div>
                  <span>Track login activity and security</span>
                </div>
              </div>

              <p>If you didn't create this account, please ignore this email.</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Elixpo. All rights reserved.</p>
              <p><a href="${process.env.NEXT_PUBLIC_APP_URL}">Visit Elixpo</a></p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `Welcome to Elixpo, ${recipientName}!\n\nClick here to verify your email: ${verificationLink}`,
  }),

  // Sign In Confirmation Email
  signinConfirmation: (recipientName: string, ipAddress: string, userAgent: string, timestamp: string) => ({
    subject: '✅ New Sign In to Your Elixpo Account',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              background-color: #f5f5f5;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 40px auto;
              background-color: white;
              border-radius: 8px;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
              overflow: hidden;
            }
            .header {
              background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
              color: white;
              padding: 40px 20px;
              text-align: center;
            }
            .header h1 {
              margin: 0;
              font-size: 28px;
              font-weight: 700;
            }
            .content {
              padding: 40px 30px;
            }
            .greeting {
              font-size: 16px;
              color: #333;
              margin-bottom: 20px;
            }
            .activity-box {
              background-color: #f8f9fa;
              border: 1px solid #e0e0e0;
              border-radius: 6px;
              padding: 20px;
              margin: 30px 0;
            }
            .activity-item {
              display: flex;
              justify-content: space-between;
              margin: 12px 0;
              padding: 8px 0;
              border-bottom: 1px solid #e0e0e0;
            }
            .activity-item:last-child {
              border-bottom: none;
            }
            .activity-label {
              font-weight: 600;
              color: #555;
              width: 100px;
            }
            .activity-value {
              color: #333;
              flex: 1;
              word-break: break-all;
            }
            .security-note {
              background-color: #e8f4f8;
              border-left: 4px solid #11998e;
              padding: 15px;
              margin: 20px 0;
              border-radius: 4px;
              font-size: 14px;
              color: #0c5460;
            }
            .footer {
              background-color: #f8f9fa;
              padding: 20px;
              text-align: center;
              font-size: 12px;
              color: #666;
              border-top: 1px solid #e0e0e0;
            }
            a {
              color: #11998e;
              text-decoration: none;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ New Sign In Detected</h1>
            </div>
            <div class="content">
              <p class="greeting">Hi ${recipientName},</p>
              <p>We detected a new sign in to your Elixpo account. Here are the details:</p>
              
              <div class="activity-box">
                <div class="activity-item">
                  <span class="activity-label">Time:</span>
                  <span class="activity-value">${timestamp}</span>
                </div>
                <div class="activity-item">
                  <span class="activity-label">IP Address:</span>
                  <span class="activity-value">${ipAddress}</span>
                </div>
                <div class="activity-item">
                  <span class="activity-label">Device:</span>
                  <span class="activity-value">${userAgent || 'Unknown'}</span>
                </div>
              </div>

              <div class="security-note">
                <strong>🔒 Security Tip:</strong> If this wasn't you, please change your password immediately by visiting your account settings.
              </div>

              <p>If you don't recognize this activity, please secure your account right away.</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Elixpo. All rights reserved.</p>
              <p><a href="${process.env.NEXT_PUBLIC_APP_URL}">Visit Elixpo</a></p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `New sign in to your account at ${timestamp} from IP: ${ipAddress}`,
  }),
};

// Helper functions for specific use cases
export async function sendOTPEmail(email: string, recipientName: string, otpCode: string): Promise<void> {
  const template = emailTemplates.otp(
    recipientName,
    otpCode,
    parseInt(process.env.EMAIL_VERIFICATION_OTP_EXPIRY_MINUTES || '10')
  );

  await sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

export async function sendPasswordResetEmail(
  email: string,
  recipientName: string,
  resetLink: string
): Promise<void> {
  const template = emailTemplates.passwordReset(
    recipientName,
    resetLink,
    parseInt(process.env.EMAIL_VERIFICATION_LINK_EXPIRY_HOURS || '24')
  );

  await sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

export async function sendSignupConfirmationEmail(
  email: string,
  recipientName: string,
  verificationLink: string
): Promise<void> {
  const template = emailTemplates.signupConfirmation(recipientName, verificationLink);

  await sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

export async function sendSigninConfirmationEmail(
  email: string,
  recipientName: string,
  ipAddress: string,
  userAgent: string
): Promise<void> {
  const timestamp = new Date().toLocaleString();
  const template = emailTemplates.signinConfirmation(recipientName, ipAddress, userAgent, timestamp);

  await sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}
