import express from "express";
import multer from "multer";
import { protect, allowRoles } from "../middleware/authMiddleware.js";
import {
  createTicket,
  listTickets,
  getTicket,
  listMessages,
  createMessage,
  updateStatus,
  uploadAttachment,
} from "../controllers/supportController.js";

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.post("/tickets", protect, createTicket);
router.get("/tickets", protect, listTickets);
router.get("/tickets/:ticketId", protect, getTicket);
router.get("/tickets/:ticketId/messages", protect, listMessages);
router.post("/tickets/:ticketId/messages", protect, createMessage);
router.patch("/tickets/:ticketId/status", protect, allowRoles("Agent", "Manager", "Admin", "agent", "manager", "admin"), updateStatus);
router.post("/attachments", protect, upload.single("file"), uploadAttachment);

export default router;
