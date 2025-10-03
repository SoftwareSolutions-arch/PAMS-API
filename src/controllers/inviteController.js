import crypto from "crypto";
import { Invite } from "../models/Invite.js";
import { sendEmail } from "../services/emailService.js";

export const sendInvite = async (req, res) => {
  try {
    const { email } = req.body;
    console.log('email')

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    // Calculate today's date range (midnight → 23:59)
    const now = new Date();
    const startOfDay = new Date(now.setHours(0, 0, 0, 0));
    const endOfDay = new Date(now.setHours(23, 59, 59, 999));

    // Count how many invites already sent today for this email
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

    // Generate secure random token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // valid 24 hrs

    // Save invite in DB (new record each time)
    const invite = await Invite.create({
      email,
      token,
      expiresAt,
    });

    // Create invite link
    const appUrl = process.env.APP_URL;
    const inviteUrl = `${appUrl}/register-company?token=${token}&email=${encodeURIComponent(email)}`;

    // Send email
    await sendEmail(
      email,
      "PAMS — Company Registration Invite",
      `<p>Hello,</p>
       <p>You have been invited to register your company on <strong>PAMS</strong>.</p>
       <p>Use the following link (valid until ${expiresAt.toISOString()}):</p>
       <p><a href="${inviteUrl}">${inviteUrl}</a></p>
       <p>If you did not request this, you can ignore this email.</p>`
    );

    res.json({
      success: true,
      message: "Invite sent successfully",
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
