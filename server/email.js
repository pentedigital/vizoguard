const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.hostinger.com",
  port: parseInt(process.env.SMTP_PORT || "465", 10),
  secure: true,
  auth: {
    user: process.env.SMTP_USER || "support@vizoguard.com",
    pass: process.env.SMTP_PASS,
  },
});

async function sendLicenseEmail(email, licenseKey) {
  const appUrl = process.env.APP_URL || "https://vizoguard.com";

  const text = `Welcome to Vizoguard!

Your license key: ${licenseKey}

Download the app:
  Mac:     ${appUrl}/downloads/Vizoguard-latest.dmg
  Windows: ${appUrl}/downloads/Vizoguard-Setup-latest.exe

How to activate:
  1. Install and open Vizoguard
  2. Enter your license key when prompted
  3. You're protected!

Your subscription renews automatically each year. Manage it anytime from your Stripe billing portal.

Questions? Reply to this email.

— Vizoguard Team`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0e17; color: #e2e8f0; padding: 40px 20px;">
  <div style="max-width: 520px; margin: 0 auto;">
    <h1 style="color: #3b82f6; font-size: 24px; margin-bottom: 8px;">Welcome to Vizoguard</h1>
    <p style="color: #8892a4; margin-bottom: 32px;">AI security for your Mac &amp; PC</p>

    <div style="background: #1a2332; border: 1px solid #2a3548; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px;">
      <p style="color: #8892a4; font-size: 13px; margin: 0 0 8px;">YOUR LICENSE KEY</p>
      <p style="font-size: 22px; font-weight: 700; color: #fff; letter-spacing: 2px; margin: 0; font-family: monospace;">${licenseKey}</p>
    </div>

    <p style="margin-bottom: 16px;"><strong>Download the app:</strong></p>
    <p style="margin: 4px 0;"><a href="${appUrl}/downloads/Vizoguard-latest.dmg" style="color: #3b82f6;">Download for Mac (.dmg)</a></p>
    <p style="margin: 4px 0 24px;"><a href="${appUrl}/downloads/Vizoguard-Setup-latest.exe" style="color: #3b82f6;">Download for Windows (.exe)</a></p>

    <p style="margin-bottom: 8px;"><strong>How to activate:</strong></p>
    <ol style="color: #8892a4; padding-left: 20px; margin-bottom: 32px;">
      <li>Install and open Vizoguard</li>
      <li>Enter your license key when prompted</li>
      <li>You're protected!</li>
    </ol>

    <p style="color: #475569; font-size: 13px; border-top: 1px solid #2a3548; padding-top: 20px;">
      Your subscription renews automatically each year. Questions? Reply to this email.<br>
      &copy; 2026 Vizoguard
    </p>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from: `"Vizoguard" <${process.env.SMTP_USER || "support@vizoguard.com"}>`,
    to: email,
    subject: "Your Vizoguard License Key",
    text,
    html,
  });
}

module.exports = { sendLicenseEmail };
