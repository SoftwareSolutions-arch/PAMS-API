import express from "express";
import {
    createChangeRequest,
    getChangeRequests,
    reviewChangeRequest
} from "../controllers/depositChangeRequestController.js";
import { protect, allowRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/", protect, allowRoles("Agent", "User"), createChangeRequest);
router.get("/", protect, allowRoles("Admin"), getChangeRequests);
router.patch("/:requestId", protect, allowRoles("Admin"), reviewChangeRequest);

export default router;
