import crypto from "crypto";
import { Invite } from "../models/Invite.js";
import { sendEmail } from "../services/emailService.js";

export const sendInvite = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    // Generate secure random token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hrs expiry

    // Save invite in DB (upsert: update if email already exists)
    const invite = await Invite.findOneAndUpdate(
      { email },
      { token, expiresAt },
      { new: true, upsert: true }
    );

    // Create invite link
    const appUrl = process.env.APP_URL;
    const inviteUrl = `${appUrl}/register-company?token=${token}&email=${encodeURIComponent(email)}`;

    // Send email
    await sendEmail(
      email,
      "PAMS — Company Registration Invite",
      `<p>Hello,</p>
       <p>You have been invited to register your company on PAMS.</p>
       <p>Use the following link (valid until ${expiresAt.toISOString()}):</p>
       <p><a href="${inviteUrl}">${inviteUrl}</a></p>`
    );

    res.json({ success: true, data: invite });
  } catch (error) {
    console.error("Send Invite Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
