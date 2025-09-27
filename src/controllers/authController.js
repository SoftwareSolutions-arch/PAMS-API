import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sendEmail } from "../services/emailService.js";

const genToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });

// POST /api/auth/login
export const login = async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: "Invalid credentials" });
  res.json({ token: genToken(user._id), user: { id: user._id, name: user.name, email: user.email, role: user.role } });
};

// GET /api/auth/profile
export const profile = async (req, res) => {
  res.json({ id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role });
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

    // ✅ Send email
       sendEmail(
      email,
      "PAMS - Password Reset OTP",
      `
        <h2>Password Reset Request</h2>
        <p>Your OTP for password reset is: <b>${otp}</b></p>
        <p>This OTP is valid for 10 minutes.</p>
      `
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
    console.log('user' , user.resetToken)
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
    const userId = req.user._id; // 👈 assuming you set req.user in auth middleware
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

