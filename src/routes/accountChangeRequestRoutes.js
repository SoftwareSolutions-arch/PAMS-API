// routes/accountChangeRequest.routes.js
import express from "express";
import {
    createChangeRequest,
    getAllChangeRequests,
    approveChangeRequest,
    rejectChangeRequest,
} from "../controllers/accountChangeRequestController.js";
import { protect, allowRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

// Agent
router.post("/", protect, allowRoles("Agent"), createChangeRequest);
router.get("/", protect, allowRoles("Admin"), getAllChangeRequests);
router.patch("/:id/approve", protect, allowRoles("Admin"), approveChangeRequest);
router.patch("/:id/reject", protect, allowRoles("Admin"), rejectChangeRequest);

export default router;
