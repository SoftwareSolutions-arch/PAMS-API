// routes/schemeRoutes.js

import express from "express";
import {
    createScheme,
    getSchemes,
    getSchemeById,
    updateScheme,
    deleteScheme,
} from "../controllers/schemeController.js";

const router = express.Router();

// Example: /api/schemes
router.route("/")
    .get(getSchemes)     // GET all schemes
    .post(createScheme); // POST new scheme

// Example: /api/schemes/:id
router.route("/:id")
    .get(getSchemeById)  // GET single scheme
    .put(updateScheme)   // UPDATE scheme
    .delete(deleteScheme); // DELETE scheme

export default router;
