import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER, // Gmail
    pass: process.env.EMAIL_PASS, // Gmail App Password
  },
  pool: true,              // ✅ reuse connection
  maxConnections: 1,
  maxMessages: 50,
  rateDelta: 2000,
  rateLimit: 1,
  socketTimeout: 60000,    // ✅ 60s timeout
});

/**
 * Send safe email (never crash app)
 * @param {string} to Recipient email
 * @param {string} subject Email subject
 * @param {string} bodyHtml Custom HTML (OTP, credentials, etc.)
 */
export const sendEmailSafe = async (to, subject, bodyHtml) => {
  try {
    const wrappedHtml = `
      <div style="font-family: Arial, sans-serif; line-height:1.6; color:#333;">
        <div style="background:#2e6c80; color:white; padding:10px; text-align:center;">
          <h2>PAMS Notification</h2>
        </div>
        <div style="padding:15px;">
          ${bodyHtml}
        </div>
        <div style="font-size:12px; color:#666; margin-top:20px; border-top:1px solid #ddd; padding-top:10px;">
          <p>This is an automated message from PAMS. Please do not reply directly to this email.</p>
        </div>
      </div>
    `;

    const info = await transporter.sendMail({
      from: `"PAMS Support" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html: wrappedHtml,
    });

    console.log("✅ Email sent:", info.messageId);
    return true;
  } catch (error) {
    console.error("❌ Email send failed:", error.message);
    return false;
  }
};
