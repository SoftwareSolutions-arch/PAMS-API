import express from "express";
import { login, profile, forgotPassword, verifyOtp, resetPassword, changePassword, requestEmailChange, verifyEmailOtp, updateEmail } from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();
router.post("/login", login);
router.get("/profile", protect, profile);
router.post("/forgot-password", forgotPassword);
router.post("/verify-otp", verifyOtp);
router.post("/reset-password", resetPassword);
router.post("/change-password", protect, changePassword);
router.post("/request-email-change", protect, requestEmailChange);
router.post("/verify-email-otp", protect, verifyEmailOtp);
router.post("/update-email", protect, updateEmail);

export default router;
