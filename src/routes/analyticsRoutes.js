// src/routes/analyticsRoutes.js
import express from "express";
import { protect, allowRoles } from "../middleware/authMiddleware.js";
import { checkPlanLimit } from "../middleware/checkPlanLimit.js";
import { getBasicAnalytics, getAdvancedAnalytics } from "../controllers/analyticsController.js";

const router = express.Router();

// Basic analytics - available to all roles
router.get(
  "/basic",
  protect,
  allowRoles("Admin", "Manager", "Agent", "User"),
  getBasicAnalytics
);

// Advanced analytics - feature-gated by plan
router.get(
  "/advanced",
  protect,
  allowRoles("Admin", "Manager"),
  checkPlanLimit({ feature: "advancedAnalytics" }),
  getAdvancedAnalytics
);

export default router;
