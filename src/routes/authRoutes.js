import express from "express";
import { login, profile, forgotPassword, verifyOtp, resetPassword, changePassword, requestEmailChange, verifyEmailOtp, updateEmail } from "../controllers/authController.js";
import { invalidateUserSessions } from "../services/tokenService.js";
import {
  verifyUserOnboardingToken,
  completeUserOnboarding
} from "../controllers/userController.js";

import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();
router.get("/verify-onboarding-token", verifyUserOnboardingToken);
router.post("/complete-onboarding", completeUserOnboarding);

router.post("/login", login);
router.get("/profile", protect, profile);
router.post("/forgot-password", forgotPassword);
router.post("/verify-otp", verifyOtp);
router.post("/reset-password", resetPassword);
router.post("/change-password", protect, changePassword);
router.post("/request-email-change", protect, requestEmailChange);
router.post("/verify-email-otp", protect, verifyEmailOtp);
router.post("/update-email", protect, updateEmail);

// ✅ Logout: invalidate current session (rotate sessionVersion)
router.post("/logout", protect, async (req, res) => {
  try {
    await invalidateUserSessions(req.user.id);
    res.json({ success: true, message: "Logged out" });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to logout" });
  }
});

export default router;
