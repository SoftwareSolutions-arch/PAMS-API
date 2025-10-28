import mongoose from "mongoose";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import { tokenService } from "./tokenService.js";
import { sendFCMMessage } from "./firebaseService.js";

export const notificationService = {
  /**
   * Send notification (stores in DB and pushes via FCM)
   * If recipientIds is empty/undefined => broadcast to all Approved, Active users
   */
  async send({ title, message, type = "info", priority = "normal", recipientIds = [], data = {} }) {
    if (!title || !message) throw new Error("title and message are required");

    let targetUserIds = recipientIds && recipientIds.length ? recipientIds : await this._getAllActiveUserIds();

    // Ensure ObjectId
    targetUserIds = targetUserIds.map((id) => new mongoose.Types.ObjectId(id));

    const notification = await Notification.create({
      title,
      message,
      type,
      priority,
      data,
      recipientIds: targetUserIds,
      readBy: [],
    });

    // Resolve tokens
    const tokenRows = await tokenService.getTokensByUserIds(targetUserIds);
    const tokens = [...new Set(tokenRows.map((r) => r.deviceToken).filter(Boolean))];

    // Fire FCM
    await sendFCMMessage(tokens, title, message, data);

    return notification;
  },

  async _getAllActiveUserIds() {
    const users = await User.find({ requestStatus: "Approved", isBlocked: false }).select("_id");
    return users.map((u) => u._id);
  },

  async listForUser(userId, { page = 1, limit = 10, unreadOnly = false } = {}) {
    const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.max(1, parseInt(limit, 10));
    const match = { recipientIds: new mongoose.Types.ObjectId(userId) };
    if (unreadOnly) match.readBy = { $ne: new mongoose.Types.ObjectId(userId) };

    const [items, total] = await Promise.all([
      Notification.find(match).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(Math.max(1, parseInt(limit, 10))),
      Notification.countDocuments(match),
    ]);

    return { items, total, page: parseInt(page, 10), limit: parseInt(limit, 10) };
  },

  async markRead(userId, notificationId) {
    await Notification.updateOne(
      { _id: notificationId },
      { $addToSet: { readBy: new mongoose.Types.ObjectId(userId) } }
    );
    return { ok: true };
  },

  async markUnread(userId, notificationId) {
    await Notification.updateOne(
      { _id: notificationId },
      { $pull: { readBy: new mongoose.Types.ObjectId(userId) } }
    );
    return { ok: true };
  },

  async delete(notificationId, userId) {
    // Hard delete only if sender context exists; else soft-delete could be implemented per-user
    // For now, allow recipient to hide by removing their id from recipientIds
    await Notification.updateOne(
      { _id: notificationId },
      { $pull: { recipientIds: new mongoose.Types.ObjectId(userId), readBy: new mongoose.Types.ObjectId(userId) } }
    );
    return { ok: true };
  },

  async unreadCount(userId) {
    const count = await Notification.countDocuments({
      recipientIds: new mongoose.Types.ObjectId(userId),
      readBy: { $ne: new mongoose.Types.ObjectId(userId) },
    });
    return { count };
  },
};
