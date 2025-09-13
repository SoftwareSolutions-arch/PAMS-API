import express from "express";
import { login, profile } from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();
router.post("/login", login);
router.get("/profile", protect, profile);
export default router;
