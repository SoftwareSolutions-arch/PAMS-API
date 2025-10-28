import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  saveToken,
  deleteToken,
  send,
  myNotifications,
  markRead,
  markUnread,
  remove,
  unreadCount,
} from "../controllers/notificationController.js";

const router = express.Router();

// Token management
router.post("/token", protect, saveToken);
router.delete("/token/:token", protect, deleteToken);

// Send
router.post("/send", protect, send);

// Fetch
router.get("/my", protect, myNotifications);
router.get("/unreadCount", protect, unreadCount);

// Mark read/unread
router.patch("/:id/read", protect, markRead);
router.patch("/:id/unread", protect, markUnread);

// Delete
router.delete("/:id", protect, remove);

export default router;
