// routes/schemeRoutes.js

import express from "express";
import { protect, allowRoles } from "../middleware/authMiddleware.js";
import {
    createScheme,
    getSchemes,
    getSchemeById,
    updateScheme,
    deleteScheme,
} from "../controllers/schemeController.js";

const router = express.Router();

// All routes require authentication
router.use(protect);

// Routes for listing and fetching schemes (Admin, Manager, Agent)
router.route("/")
    .get(allowRoles("Admin", "Manager", "Agent"), getSchemes)
    .post(allowRoles("Admin"), createScheme); // Only Admin can create

router.route("/:id")
    .get(allowRoles("Admin", "Manager", "Agent"), getSchemeById)
    .put(allowRoles("Admin"), updateScheme)   // Only Admin can update
    .delete(allowRoles("Admin"), deleteScheme); // Only Admin can delete

export default router;
