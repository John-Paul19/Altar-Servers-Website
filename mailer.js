const nodemailer = require("nodemailer");

// Google shows app passwords as four groups of four for readability; the
// spaces are display only and SMTP rejects them, so strip all whitespace.
const password = String(process.env.EMAIL_PASS || "").replace(/\s/g, "");
const user = String(process.env.EMAIL_USER || "").trim();

const isConfigured = Boolean(user && password);

const transporter = isConfigured
  ? nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass: password },
    })
  : null;

function appUrl() {
  return String(process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

async function verifyMailer() {
  if (!transporter) return { ok: false, reason: "EMAIL_USER / EMAIL_PASS not set" };
  try {
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

function layout({ heading, intro, buttonLabel, link, footer }) {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f4f4f8;padding:32px 16px;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e0e0ea;">
      <div style="background:#1a1a2e;padding:24px;text-align:center;">
        <div style="color:#c41e3a;font-size:20px;font-weight:bold;">St. Louis Catholic Church</div>
        <div style="color:#a0a0a0;font-size:13px;margin-top:4px;">St. John Berchmans Altar Servers</div>
      </div>
      <div style="padding:28px 24px;color:#1a1a2e;">
        <h2 style="margin:0 0 16px;font-size:19px;">${heading}</h2>
        <p style="margin:0 0 20px;line-height:1.6;color:#44445c;">${intro}</p>
        <p style="margin:0 0 22px;">
          <a href="${link}"
             style="display:inline-block;background:#c41e3a;color:#ffffff;text-decoration:none;
                    padding:12px 26px;border-radius:6px;font-weight:bold;">${buttonLabel}</a>
        </p>
        <p style="margin:0 0 8px;font-size:13px;color:#6c6c82;">
          If the button does not work, copy this link into your browser:
        </p>
        <p style="margin:0 0 20px;font-size:12px;word-break:break-all;color:#c41e3a;">${link}</p>
        <p style="margin:0;font-size:13px;color:#6c6c82;line-height:1.6;">${footer}</p>
      </div>
    </div>
  </div>`;
}

async function sendInvite({ to, name, token }) {
  const link = `${appUrl()}/set-password.html?token=${token}`;
  const html = layout({
    heading: `Welcome, ${name}`,
    intro:
      "An administrator account has been created for you on the St. John Berchmans Altar Servers site. Choose your own password to finish setting it up — nobody else will know it.",
    buttonLabel: "Set your password",
    link,
    footer:
      "This link can only be used once and expires in 24 hours. If you were not expecting this email, you can safely ignore it.",
  });

  await transporter.sendMail({
    from: `"St. Louis Altar Servers" <${user}>`,
    to,
    subject: "Set up your admin account",
    html,
    text: `Welcome, ${name}.\n\nSet your password here (expires in 24 hours):\n${link}\n`,
  });

  return link;
}

async function sendPasswordReset({ to, name, token }) {
  const link = `${appUrl()}/set-password.html?token=${token}`;
  const html = layout({
    heading: "Reset your password",
    intro: `Hello ${name}, we received a request to reset the password on your administrator account. Choose a new one using the button below.`,
    buttonLabel: "Choose a new password",
    link,
    footer:
      "This link can only be used once and expires in 24 hours. If you did not request a reset, ignore this email — your current password will keep working.",
  });

  await transporter.sendMail({
    from: `"St. Louis Altar Servers" <${user}>`,
    to,
    subject: "Reset your password",
    html,
    text: `Hello ${name},\n\nReset your password here (expires in 24 hours):\n${link}\n`,
  });

  return link;
}

module.exports = { isConfigured, verifyMailer, sendInvite, sendPasswordReset, appUrl };
