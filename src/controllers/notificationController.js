import mongoose from "mongoose";
import { tokenService } from "../services/tokenService.js";
import { notificationService } from "../services/notificationService.js";

export const saveToken = async (req, res) => {
  try {
    const userId = req.user?.id;
    const body = req.body || {};
    const deviceToken = body.deviceToken || body.token; // support alias 'token'
    const deviceType = body.deviceType || "web";

    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!deviceToken) return res.status(400).json({ error: "deviceToken is required" });

    const doc = await tokenService.saveOrUpdate({ userId, deviceToken, deviceType });
    res.status(201).json({ message: "Token saved", token: doc });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to save token" });
  }
};

export const deleteToken = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { token } = req.params;
    if (!token) return res.status(400).json({ error: "token param is required" });

    await tokenService.removeToken({ userId, deviceToken: token });
    res.json({ message: "Token removed" });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to remove token" });
  }
};

export const send = async (req, res) => {
  try {
    const { title, message, type, recipientIds, data, priority } = req.body || {};
    // recipientIds can be empty -> broadcast

    const notification = await notificationService.send({ title, message, type, recipientIds, data, priority });
    res.status(201).json({ message: "Notification sent", notification });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to send notification" });
  }
};

export const myNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 10, unreadOnly = "false" } = req.query;
    const unread = String(unreadOnly).toLowerCase() === "true";
    const result = await notificationService.listForUser(req.user.id, { page, limit, unreadOnly: unread });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to fetch notifications" });
  }
};

export const markRead = async (req, res) => {
  try {
    const { id } = req.params;
    await notificationService.markRead(req.user.id, id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to mark read" });
  }
};

export const markUnread = async (req, res) => {
  try {
    const { id } = req.params;
    await notificationService.markUnread(req.user.id, id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to mark unread" });
  }
};

export const remove = async (req, res) => {
  try {
    const { id } = req.params;
    await notificationService.delete(id, req.user.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to delete notification" });
  }
};

export const unreadCount = async (req, res) => {
  try {
    const result = await notificationService.unreadCount(req.user.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to get unread count" });
  }
};
