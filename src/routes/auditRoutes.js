// src/routes/auditRoutes.js
import express from "express";
import { protect, allowRoles } from "../middleware/authMiddleware.js";
import { getAuditLogs, getAuditLogById, clearAuditLogs } from "../controllers/auditController.js";

const router = express.Router();

router.get("/", protect, allowRoles("Admin", "Manager"), getAuditLogs);
router.get("/:id", protect, allowRoles("Admin", "Manager"), getAuditLogById);
router.delete("/", protect, allowRoles("Admin"), clearAuditLogs);

export default router;
