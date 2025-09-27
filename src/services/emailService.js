import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Send email via Resend
 * @param {string} to - recipient email
 * @param {string} subject - email subject
 * @param {string} bodyHtml - html content
 */
export const sendEmail = async (to, subject, bodyHtml) => {
  try {
    const response = await resend.emails.send({
      from: "support@softwaresolutions.store",
      to,
      subject,
      html: bodyHtml,
    });

    console.log("✅ Resend email sent:", response.id);
    return true;
  } catch (error) {
    console.error("❌ Resend email failed:", error?.message || error);
    return false;
  }
};
