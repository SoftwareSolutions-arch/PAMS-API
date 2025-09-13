import express from "express";
import { protect, allowRoles } from "../middleware/authMiddleware.js";
import {
    getDashboardOverview,
    getRecentActivity,
    getAgentPerformance,
    getSchemeSummary
} from "../controllers/dashboardController.js";

const router = express.Router();

router.get("/overview", protect, allowRoles("Admin", "Manager", "Agent", "User"), getDashboardOverview);
router.get("/recent", protect, allowRoles("Admin", "Manager", "Agent", "User"), getRecentActivity);
router.get("/agent-performance", protect, allowRoles("Admin", "Manager"), getAgentPerformance);
router.get("/schemes", protect, allowRoles("Admin", "Manager", "Agent", "User"), getSchemeSummary);

export default router;
