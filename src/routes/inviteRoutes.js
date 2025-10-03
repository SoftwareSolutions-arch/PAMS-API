import express from "express";
import { sendInvite } from "../controllers/inviteController.js";

const router = express.Router();

// POST /api/invites
router.post("/", sendInvite);

export default router;
