import express from "express";
import { login, profile ,forgotPassword ,verifyOtp ,resetPassword ,changePassword } from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();
router.post("/login", login);
router.get("/profile", protect, profile);
router.post("/forgot-password", forgotPassword);
router.post("/verify-otp", verifyOtp);
router.post("/reset-password", resetPassword);
router.post("/change-password", protect, changePassword);

export default router;
