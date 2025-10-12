import express from "express";
import {
    addCompany,
    updateCompanyById,
    deleteCompany,
    getCompany,
    listCompanies,
    getCompanySummary,
    approveCompany,
    rejectCompany,
    sendInvite,
    verifyInitToken,
    createFirstAdmin,getMonthlyStats
} from "../controllers/companyController.js";

import { protectSuperAdmin } from "../middleware/superAdminMiddleWare.js";

const router = express.Router();

/**
 * Company Routes for SuperAdmin Panel
 * All routes are protected (SuperAdmin only)
 */

// Verify init token (public — used by business owner from email link)
router.get("/verify-init-token", verifyInitToken);

// Dashboard summary cards
router.get("/summary", protectSuperAdmin, getCompanySummary);

router.post("/init", createFirstAdmin);

// Pending / Current companies (supports ?status=active|blocked|inprogress&search=term)
router.get("/", protectSuperAdmin, listCompanies);

// Add new company
router.post("/", addCompany);

router.get("/monthly-stats", getMonthlyStats);

// Get a single company by ID
router.get("/:id", protectSuperAdmin, getCompany);

// Update a company by ID
router.put("/:id", protectSuperAdmin, updateCompanyById);

// Delete (soft delete) a company
router.delete("/:id", protectSuperAdmin, deleteCompany);

// Approve company
router.put("/:id/approve", protectSuperAdmin, approveCompany);

// Reject company
router.patch("/:id/reject", protectSuperAdmin, rejectCompany);

// Send 24h invite link to business owner
router.post("/invite", protectSuperAdmin, sendInvite);


export default router;
