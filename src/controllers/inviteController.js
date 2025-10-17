import crypto from "crypto";
import { Invite } from "../models/Invite.js";
import { sendEmail } from "../services/emailService.js";
import { generateEmailTemplate } from "../utils/emailTemplate.js";

export const sendInvite = async (req, res) => {
  try {
    let { email } = req.body;
    const appUrl = process.env.APP_URL;

    // 🟢 If no email provided, use a placeholder (for WhatsApp invite)
    const isWhatsAppInvite = !email;
    if (!email) {
      email = `whatsapp_user_${Date.now()}@pams.com`; // unique placeholder email
    }

    // Calculate today's date range
    const now = new Date();
    const startOfDay = new Date(now.setHours(0, 0, 0, 0));
    const endOfDay = new Date(now.setHours(23, 59, 59, 999));

    // Limit daily invites per (real) email only
    if (!isWhatsAppInvite) {
      const inviteCount = await Invite.countDocuments({
        email,
        createdAt: { $gte: startOfDay, $lte: endOfDay },
      });

      if (inviteCount >= 2) {
        return res.status(429).json({
          success: false,
          message: "You can only receive a maximum of 2 invites per day.",
        });
      }
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // valid 24 hours

    // Save invite record
    const invite = await Invite.create({
      email,
      token,
      expiresAt,
    });

    // Create invite URL (always same pattern)
    const inviteUrl = `${appUrl}/register-company?token=${token}&email=${encodeURIComponent(email)}`;

    // 🟢 Only send email if real email provided
    if (!isWhatsAppInvite) {
      await sendEmail(
  email,
  "PAMS – Company Registration Invite",
  generateEmailTemplate({
    title: "Company Registration Invitation",
    greeting: "Hello,",
    message: `
      You have been invited to register your company on <strong>PAMS</strong>.<br/><br/>
      Please use the secure link below to complete your registration.
    `,
    actionText: "Register Company",
    actionUrl: inviteUrl,
    footerNote: `
      This link is valid until <strong>${new Date(expiresAt).toLocaleString()}</strong>.<br/>
      If you did not request this invitation, you can safely ignore this email.
    `,
  })
);

    }

    res.json({
      success: true,
      message: isWhatsAppInvite
        ? "WhatsApp invite link generated successfully"
        : "Email invite sent successfully",
      registrationUrl: inviteUrl,
      data: invite,
    });
  } catch (error) {
    console.error("Send Invite Error:", error);
    res.status(500).json({
      success: false,
      message: "Error sending invite",
      error: error.message,
    });
  }
};
