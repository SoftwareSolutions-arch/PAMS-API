import express from "express";
import { protect, allowRoles } from "../middleware/authMiddleware.js";
import {
  getCompanyOrgChart,
  getUserOrgChart,
  assignUser,
  createUserUnderHierarchy,
  updateUserHierarchy,
  removeUserFromHierarchy,
} from "../controllers/orgChart.controller.js";

const router = express.Router();

// GET /api/org-chart/:companyId — full company chart
router.get("/:companyId", protect, allowRoles("Admin", "Manager", "Agent", "User"), getCompanyOrgChart);

// GET /api/org-chart/user/:userId — subtree for a user
router.get("/user/:userId", protect, allowRoles("Admin", "Manager", "Agent", "User"), getUserOrgChart);

// POST /api/org-chart/assign — assign user to a parent (Agent->Manager, User->Agent)
router.post("/assign", protect, allowRoles("Admin", "Manager"), assignUser);

// POST /api/org-chart/create — create user under hierarchy
router.post("/create", protect, allowRoles("Admin"), createUserUnderHierarchy);

// PATCH /api/org-chart/update/:userId — update hierarchy details
router.patch("/update/:userId", protect, allowRoles("Admin", "Manager"), updateUserHierarchy);

// DELETE /api/org-chart/remove/:userId — soft delete
router.delete("/remove/:userId", protect, allowRoles("Admin"), removeUserFromHierarchy);

export default router;
