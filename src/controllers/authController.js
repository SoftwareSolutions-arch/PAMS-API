import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sendEmail } from "../services/emailService.js";
import { generateEmailTemplate } from "../utils/emailTemplate.js";

const genToken = (user) =>
  jwt.sign(
    {
      id: (user._id || user.id).toString(),
      companyId: user.companyId?.toString(),
      role: user.role,
      sessionVersion: user.sessionVersion, // ✅ Add session version
    },
    process.env.JWT_SECRET,
    { expiresIn: "4h" }
  );

// POST /api/auth/login
export const login = async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  if (user.isBlocked) {
    return res
      .status(403)
      .json({ error: "Your account has been blocked. Please contact support." });
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  // ✅ Increment sessionVersion to invalidate all previous tokens
  user.sessionVersion = (user.sessionVersion || 0) + 1;
  await user.save();

  const token = genToken(user);

  res.json({
    success: true,
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      createdAt: user.createdAt,
    },
  });
};

export const logout = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.sessionVersion += 1; // 🚀 Increment to invalidate current token
    await user.save();

    res.json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error during logout" });
  }
};

// GET /api/auth/profile
export const profile = async (req, res) => {
  res.json({ id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role });
};

export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      res.status(404);
      throw new Error("User not found");
    }

    // ✅ Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // ✅ Save hashed OTP (for security) with expiry (10 min)
    user.resetOtp = await bcrypt.hash(otp, 10);
    user.resetOtpExpires = Date.now() + 10 * 60 * 1000;
    await user.save();

    // ✅ Send professional email
    await sendEmail(
      email,
      "PAMS – Secure Password Reset OTP",
      generateEmailTemplate({
        title: "Password Reset Request",
        greeting: `Hi ${user.name || ""},`,
        message: "We received a request to reset your PAMS account password. Use the OTP below to proceed.",
        highlight: otp,
        footerNote: "This OTP is valid for 10 minutes. Do not share it with anyone.",
      })
    );


    res.json({ message: "OTP sent to email" });
  } catch (err) {
    next(err);
  }
};

// POST /auth/verify-otp
export const verifyOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email });

    if (!user || !user.resetOtp || !user.resetOtpExpires) {
      res.status(400);
      throw new Error("Invalid or expired OTP");
    }

    if (user.resetOtpExpires < Date.now()) {
      res.status(400);
      throw new Error("OTP expired");
    }

    const isMatch = await bcrypt.compare(otp, user.resetOtp);
    if (!isMatch) {
      res.status(400);
      throw new Error("Invalid OTP");
    }

    // ✅ OTP verified → generate resetToken
    const resetToken = Math.random().toString(36).substring(2, 15);

    user.resetToken = resetToken;
    user.resetTokenExpires = Date.now() + 15 * 60 * 1000; // 15 minutes
    user.resetOtp = undefined;
    user.resetOtpExpires = undefined;

    await user.save();

    res.json({ message: "OTP verified successfully", resetToken });
  } catch (err) {
    next(err);
  }
};

// POST /auth/reset-password
export const resetPassword = async (req, res, next) => {
  try {
    const { email, newPassword, resetToken } = req.body;
    const user = await User.findOne({ email });
    console.log('user', user.resetToken)
    if (!user || !user.resetToken || !user.resetTokenExpires) {
      res.status(400);
      throw new Error("Invalid reset request");
    }

    if (user.resetTokenExpires < Date.now()) {
      res.status(400);
      throw new Error("Reset token expired");
    }

    if (user.resetToken !== resetToken) {
      res.status(400);
      throw new Error("Invalid reset token");
    }

    // ✅ Hash and save new password
    user.password = await bcrypt.hash(newPassword, 10);
    user.resetToken = undefined;
    user.resetTokenExpires = undefined;
    await user.save();

    res.json({ message: "Password reset successful" });
  } catch (err) {
    next(err);
  }
};

// POST /auth/change-password
export const changePassword = async (req, res, next) => {
  try {
    const userId = req.user.id; // 👈 assuming you set req.user in auth middleware
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      res.status(404);
      throw new Error("User not found");
    }

    // ✅ Compare current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      res.status(400);
      throw new Error("Current password is incorrect");
    }

    // ✅ Update password
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ message: "Password changed successfully" });
  } catch (err) {
    next(err);
  }
};

// 1️⃣ Request OTP for new email
export const requestEmailChange = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { newEmail } = req.body;

    // check if email already in use
    const existingUser = await User.findOne({ email: newEmail });
    if (existingUser) {
      res.status(400);
      throw new Error("This email is already registered with another account");
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(404);
      throw new Error("User not found");
    }

    // ✅ Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.emailOtp = await bcrypt.hash(otp, 10);
    user.emailOtpExpires = Date.now() + 10 * 60 * 1000; // 10 min
    user.pendingEmail = newEmail; // temporarily store new email
    await user.save();

    // ✅ Send OTP to new email
    await sendEmail(
      newEmail,
      "PAMS – Verify Your New Email Address",
      generateEmailTemplate({
        title: "Verify Your New Email Address",
        greeting: `Hi ${user.name || ""},`,
        message:
          "You recently requested to change the email address associated with your PAMS account. Please verify your new email by entering the One-Time Password (OTP) below:",
        highlight: otp,
        footerNote:
          "This OTP is valid for 10 minutes. If you didn’t request this change, please ignore this email.",
      })
    );

    res.json({ message: "OTP sent to new email" });
  } catch (err) {
    next(err);
  }
};


// 2️⃣ Verify OTP for email update
export const verifyEmailOtp = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { otp } = req.body;

    const user = await User.findById(userId);
    if (!user || !user.emailOtp || !user.emailOtpExpires || !user.pendingEmail) {
      res.status(400);
      throw new Error("Invalid or expired verification request");
    }

    if (user.emailOtpExpires < Date.now()) {
      res.status(400);
      throw new Error("OTP expired");
    }

    const isMatch = await bcrypt.compare(otp, user.emailOtp);
    if (!isMatch) {
      res.status(400);
      throw new Error("Invalid OTP");
    }

    // ✅ Mark as verified
    const emailVerifyToken = Math.random().toString(36).substring(2, 15);
    user.emailVerifyToken = emailVerifyToken;
    user.emailVerifyExpires = Date.now() + 15 * 60 * 1000; // 15 min
    user.emailOtp = undefined;
    user.emailOtpExpires = undefined;
    await user.save();

    res.json({ message: "OTP verified successfully", emailVerifyToken });
  } catch (err) {
    next(err);
  }
};

// 3️⃣ Update email after OTP verified
export const updateEmail = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { emailVerifyToken } = req.body;

    const user = await User.findById(userId);
    if (
      !user ||
      !user.emailVerifyToken ||
      !user.emailVerifyExpires ||
      !user.pendingEmail
    ) {
      res.status(400);
      throw new Error("Invalid request or verification not completed");
    }

    if (user.emailVerifyExpires < Date.now()) {
      res.status(400);
      throw new Error("Verification token expired");
    }

    if (user.emailVerifyToken !== emailVerifyToken) {
      res.status(400);
      throw new Error("Invalid verification token");
    }

    // ✅ Update email
    user.email = user.pendingEmail;
    user.pendingEmail = undefined;
    user.emailVerifyToken = undefined;
    user.emailVerifyExpires = undefined;
    await user.save();

    res.json({ message: "Email updated successfully", newEmail: user.email });
  } catch (err) {
    next(err);
  }
};
