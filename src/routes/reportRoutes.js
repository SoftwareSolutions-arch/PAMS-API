import express from "express";
import { protect, allowRoles } from "../middleware/authMiddleware.js";
import { getOverview, getSchemes, getPerformance, getUserActivity, getRoleStats, getRecentActivity ,getDepositsReport ,getAccountsReport ,getUsersReport} from "../controllers/reportController.js";

const router = express.Router();

// Only Admin & Manager dashboards should see these
router.get("/overview", protect, allowRoles("Admin", "Manager"), getOverview);
router.get("/schemes", protect, allowRoles("Admin", "Manager"), getSchemes);
router.get("/performance", protect, allowRoles("Admin", "Manager"), getPerformance);
router.get("/user-activity", protect, allowRoles("Admin", "Manager"), getUserActivity);
router.get("/roles", protect, allowRoles("Admin", "Manager"), getRoleStats);
router.get("/recent-activity", protect, allowRoles("Admin", "Manager"), getRecentActivity);
router.get("/deposits-report", protect, allowRoles("Admin", "Manager", "Agent", "User"), getDepositsReport);
router.get("/accounts-report", protect, allowRoles("Admin", "Manager", "Agent", "User"), getAccountsReport);
router.get("/users-report", protect, allowRoles("Admin", "Manager"), getUsersReport);


export default router;
