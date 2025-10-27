// src/routes/integrationRoutes.js
import express from "express";
import { protect, allowRoles } from "../middleware/authMiddleware.js";
import { checkPlanLimit } from "../middleware/checkPlanLimit.js";
import { getCustomIntegrationData } from "../controllers/integrationController.js";

const router = express.Router();

// Custom integrations endpoint — gated for pro/custom
router.get(
  "/custom",
  protect,
  allowRoles("Admin", "Manager"),
  checkPlanLimit({ feature: "customIntegrations" }),
  getCustomIntegrationData
);

export default router;
