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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

async function sendLicenseEmail(email, licenseKey, plan, accessUrl) {
  const appUrl = process.env.APP_URL || "https://vizoguard.com";
  const isBasic = plan === "vpn";
  const safeKey = escapeHtml(licenseKey);
  const safeAccessUrl = accessUrl ? escapeHtml(accessUrl) : null;
  const planName = isBasic ? "Vizoguard Basic" : "Vizoguard Pro";

  const vpnSetup = accessUrl
    ? `\nVPN Setup:\n  1. Download the Outline app: https://getoutline.org/get-started/\n  2. Open the app and tap "Add Server"\n  3. Paste your access key: ${accessUrl}\n`
    : `\nVPN Setup:\n  Log in at ${appUrl} to generate your VPN access key.\n`;

  const downloadSection = isBasic
    ? vpnSetup
    : `\nDownload the app:\n  Mac:     ${appUrl}/downloads/Vizoguard-latest.dmg\n  Windows: ${appUrl}/downloads/Vizoguard-Setup-latest.exe\n${vpnSetup}`;

  const text = `Welcome to ${planName}!

Your license key: ${licenseKey}
${downloadSection}
How to activate:
  1. ${isBasic ? "Download the Outline app from getoutline.org" : "Install Vizoguard and enter your license key"}
  2. ${accessUrl ? "Paste your VPN access key in the Outline app" : "Generate your VPN key at vizoguard.com"}
  3. You're ${isBasic ? "connected" : "protected"}!

Your subscription renews automatically each year. Manage it anytime from your Stripe billing portal.

Questions? Reply to this email.

— Vizoguard Team`;

  const vpnHtml = accessUrl
    ? `<div style="background: #111827; border: 1px solid #1a2235; border-radius: 8px; padding: 20px; margin: 16px 0;">
         <p style="color: #8a93a6; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px;">Your VPN Access Key</p>
         <p style="font-size: 11px; font-family: monospace; color: #00e5a0; word-break: break-all; margin: 0;">${safeAccessUrl}</p>
       </div>
       <p style="margin: 4px 0 16px;"><a href="https://getoutline.org/get-started/" style="color: #00e5a0;">Download the Outline app</a> and paste this key to connect.</p>`
    : `<p style="margin: 4px 0 16px; color: #8a93a6;">Log in at <a href="${appUrl}" style="color: #00e5a0;">vizoguard.com</a> to generate your VPN access key.</p>`;

  const downloadHtml = isBasic
    ? vpnHtml
    : `<p style="margin-bottom: 12px;"><strong>Download the app:</strong></p>
       <p style="margin: 4px 0;"><a href="${appUrl}/downloads/Vizoguard-latest.dmg" style="color: #00e5a0;">Download for Mac (.dmg)</a></p>
       <p style="margin: 4px 0 20px;"><a href="${appUrl}/downloads/Vizoguard-Setup-latest.exe" style="color: #00e5a0;">Download for Windows (.exe)</a></p>
       ${vpnHtml}`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0f; color: #f0f2f5; padding: 40px 20px;">
  <div style="max-width: 520px; margin: 0 auto;">
    <h1 style="color: #00e5a0; font-size: 24px; margin-bottom: 8px;">Welcome to ${planName}</h1>
    <p style="color: #8a93a6; margin-bottom: 32px;">${isBasic ? "Fast, private VPN — no logs, no tracking" : "AI security + VPN for your Mac &amp; PC"}</p>

    <div style="background: #111827; border: 1px solid #00e5a0; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px;">
      <p style="color: #8a93a6; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 10px;">Your License Key</p>
      <p style="font-size: 20px; font-weight: 700; color: #f0f2f5; letter-spacing: 2px; margin: 0; font-family: monospace;">${safeKey}</p>
    </div>

    ${downloadHtml}

    <p style="margin-bottom: 8px;"><strong>How to activate:</strong></p>
    <ol style="color: #8a93a6; padding-left: 20px; margin-bottom: 32px;">
      <li>${isBasic ? "Download the Outline app" : "Install Vizoguard and enter your license key"}</li>
      <li>${accessUrl ? "Paste your VPN access key in the Outline app" : "Generate your VPN key at vizoguard.com"}</li>
      <li>You're ${isBasic ? "connected" : "protected"}!</li>
    </ol>

    <p style="color: #4a5568; font-size: 13px; border-top: 1px solid #1a2235; padding-top: 20px;">
      Your subscription renews automatically each year. Questions? Reply to this email.<br>
      &copy; 2026 Vizoguard
    </p>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from: `"Vizoguard" <${process.env.SMTP_USER || "support@vizoguard.com"}>`,
    to: email,
    subject: `Your ${planName} License Key`,
    text,
    html,
  });
}

module.exports = { sendLicenseEmail };
