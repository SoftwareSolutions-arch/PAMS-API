import { Resend } from "resend";

let resend = null;

/**
 * Get safe resend instance
 */
function getResend() {
  if (!process.env.RESEND_API_KEY) {
    console.error("❌ RESEND_API_KEY not found in environment!");
    return null;
  }
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

/**
 * Send email via Resend (never crash)
 * @param {string} to - recipient email
 * @param {string} subject - email subject
 * @param {string} bodyHtml - html content
 */
export const sendEmail = async (to, subject, bodyHtml) => {
  try {
    const client = getResend();
    if (!client) {
      console.error("❌ Resend client not initialized, skipping email.");
      return false;
    }

    const response = await client.emails.send({
      from: "support@softwaresolutions.store", // ✅ Verified domain
      to,
      subject,
      html: bodyHtml,
    });

    console.log("✅ Resend email sent:", response.id || JSON.stringify(response));
    return true;
  } catch (error) {
    console.error("❌ Resend email failed:", error?.message || error);
    return false; // never crash
  }
};
