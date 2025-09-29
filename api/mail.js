import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

export async function sendMail(name, email, message) {
  if (!name || !email || !message) {
    throw new Error('Name, email, and message are required.');
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS
    }
  });

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; background: #f8f1de; padding: 32px; border-radius: 16px; max-width: 600px; margin: auto; box-shadow: 0 4px 24px #e2d9c8;">
      <h2 style="color: #1B1B19; text-align: center; margin-bottom: 24px;">📬 Dropped a Mail in your portfolio!</h2>
      <div style="background: #fffbe9; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
        <p style="font-size: 1.1em; color: #222;"><strong>Name:</strong> ${name}</p>
        <p style="font-size: 1.1em; color: #222;"><strong>Email:</strong> <a href="mailto:${email}" style="color: #0077b5;">${email}</a></p>
        <hr style="margin: 18px 0; border: none; border-top: 1px solid #e2d9c8;">
        <p style="font-size: 1.15em; color: #1B1B19; white-space: pre-line;"><strong>Message:</strong><br>${message}</p>
      </div>
      <footer style="text-align: center; color: #888; font-size: 0.95em; margin-top: 18px;">
        <span style="color: #ffc300;">Elixpo Portfolio</span> &mdash; <span style="color: #1B1B19;">${new Date().toLocaleString()}</span>
      </footer>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"Elixpo" <${process.env.MAIL_USER}>`,
      to: 'ayushbhatt633@gmail.com',
      subject: `Dropping By Message From Portfolio ${name}`,
      html
    });

    return { success: true, message: 'Mail sent successfully!' };
  } catch (err) {
    console.error('Error sending mail:', err);
    throw new Error('Failed to send mail.');
  }
}
