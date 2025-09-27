import { Resend } from "resend";

let resend;

function getResend() {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

export const sendEmail = async (to, subject, bodyHtml) => {
  try {
    const response = await getResend().emails.send({
      from: "support@softwaresolutions.store",
      to,
      subject,
      html: bodyHtml,
    });

    console.log("✅ Resend email sent:", response.id || response);
    return true;
  } catch (error) {
    console.error("❌ Resend email failed:", error.message || error);
    return false;
  }
};
