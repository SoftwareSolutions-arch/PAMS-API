import mongoose from "mongoose";
import { SupportTicket } from "../models/SupportTicket.js";
import { SupportMessage } from "../models/SupportMessage.js";
import { notificationService } from "../services/notificationService.js";
import { SupportAttachment } from "../models/SupportAttachment.js";
import { encodeCursor, decodeCursor } from "../utils/support/cursor.js";
import { getNextTicketNumber } from "../utils/support/ticketNumber.js";
import { uploadToS3, sanitizeFileName } from "../utils/support/storage.js";

// Helper to enforce role
const isStaff = (role) => ["Agent", "Manager", "Admin", "agent", "manager", "admin"].includes(role);

// POST /api/support/tickets
export const createTicket = async (req, res) => {
  const userId = req.user?.id;
  const { subject, contactType, message, attachments } = req.body || {};

  if (!subject || typeof subject !== "string" || subject.trim().length < 3) {
    return res.status(400).json({ error: "subject is required (min 3 chars)" });
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const ticketNumber = await getNextTicketNumber(session);
    const ticket = await SupportTicket.create([
      { ticketNumber, userId, subject: subject.trim(), contactType: contactType || "app" },
    ], { session });

    let createdMessage = null;
    let createdAttachments = [];

    if (message || (attachments && attachments.length)) {
      createdMessage = await SupportMessage.create([
        { ticketId: ticket[0]._id, senderId: userId, message: message || "", attachments: [] },
      ], { session });

      if (attachments && attachments.length) {
        // attachments expected as array of { fileName, fileUrl, fileSize, contentType }
        const docs = attachments.map((a) => ({
          ticketId: ticket[0]._id,
          messageId: createdMessage[0]._id,
          fileName: sanitizeFileName(a.fileName || "file"),
          fileUrl: a.fileUrl,
          fileSize: a.fileSize || 0,
          contentType: a.contentType || "application/octet-stream",
          uploadedBy: userId,
        }));
        createdAttachments = await SupportAttachment.create(docs, { session });
        await SupportMessage.updateOne({ _id: createdMessage[0]._id }, { $set: { attachments: createdAttachments.map((d) => d._id) } }, { session });
      }
    }

    await session.commitTransaction();

    const created = Array.isArray(ticket) ? ticket[0] : ticket;

    // Trigger FCM Notification: Ticket Created
    try {
      const admins = await (await import("../models/User.js")).default.find({ role: "Admin", companyId: req.user.companyId }).select("_id");
      const adminIds = admins.map(a => a._id);
      await notificationService.send({
        title: "New Support Ticket",
        message: `New support ticket from ${req.user?.name || "User"}: ${subject}`,
        type: "info",
        recipientIds: adminIds,
        data: { module: "support", ticketId: created._id, ticketNumber: created.ticketNumber }
      });
    } catch (e) {
      console.error("Notification (createTicket) failed:", e?.message || e);
    }
    return res.status(201).json({
      ticket: {
        _id: created._id,
        ticketNumber: created.ticketNumber,
        subject: created.subject,
        contactType: created.contactType,
        status: created.status,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      },
      nextCursor: null,
      message: createdMessage ? { _id: createdMessage[0]._id } : null,
      attachments: createdAttachments.map((a) => ({ _id: a._id, fileName: a.fileName, fileUrl: a.fileUrl })),
    });
  } catch (err) {
    await session.abortTransaction();
    console.error("createTicket error", err);
    return res.status(500).json({ error: "Failed to create ticket" });
  } finally {
    session.endSession();
  }
};

// GET /api/support/tickets
export const listTickets = async (req, res) => {
  const { cursor, limit = 20, name, username } = req.query;
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  const decoded = decodeCursor(cursor);
  const user = req.user;

  const baseMatch = {};
  if (!isStaff(user.role)) {
    baseMatch.userId = user.id;
  }
  // Additional staff scoping can be plugged here, e.g., by company/assigneeId

  const sort = { createdAt: -1, _id: -1 };
  const cursorFilter = decoded ? {
    $or: [
      { createdAt: { $lt: decoded.createdAt } },
      { createdAt: decoded.createdAt, _id: { $lt: new mongoose.Types.ObjectId(decoded._id) } },
    ],
  } : {};

  const match = { ...baseMatch, ...cursorFilter };
  const nameQuery = (username || name || "").trim();

  // Aggregation to include last message summary
  const pipeline = [];

  // 1) Base match (scoping + pagination cursor)
  pipeline.push({ $match: match });

  // 2) Join user to include requester details and optionally filter by name/username
  const userLookup = {
    $lookup: {
      from: "users",
      let: { uid: "$userId" },
      pipeline: [
        { $match: { $expr: { $eq: ["$_id", "$$uid"] } } },
        ...(nameQuery ? [{ $match: { name: { $regex: nameQuery, $options: "i" } } }] : []),
        { $project: { _id: 1, name: 1, email: 1, role: 1 } },
      ],
      as: "user",
    },
  };
  pipeline.push(userLookup);
  if (nameQuery) {
    // Only keep tickets whose joined user matched the provided name
    pipeline.push({ $match: { $expr: { $gt: [{ $size: "$user" }, 0] } } });
  }
  pipeline.push({ $addFields: { user: { $arrayElemAt: ["$user", 0] } } });

  // 3) Sort and paginate
  pipeline.push({ $sort: sort });
  pipeline.push({ $limit: safeLimit + 1 });

  // 4) Lookup last message summary
  pipeline.push({
    $lookup: {
      from: "supportmessages",
      let: { tid: "$_id" },
      pipeline: [
        { $match: { $expr: { $eq: ["$ticketId", "$$tid"] } } },
        { $sort: { createdAt: -1, _id: -1 } },
        { $limit: 1 },
        { $project: { message: 1, senderId: 1, createdAt: 1 } },
      ],
      as: "lastMsg",
    },
  });
  pipeline.push({ $addFields: { lastMsg: { $arrayElemAt: ["$lastMsg", 0] } } });

  // 5) Final shape
  pipeline.push({
    $project: {
      _id: 1,
      ticketNumber: 1,
      subject: 1,
      contactType: 1,
      status: 1,
      createdAt: 1,
      updatedAt: 1,
      assigneeId: 1,
      user: 1, // includes { _id, name, email, role }
      lastMsg: 1,
    },
  });

  const items = await SupportTicket.aggregate(pipeline).exec();
  const hasMore = items.length > safeLimit;
  const sliced = hasMore ? items.slice(0, safeLimit) : items;
  const nextCursor = hasMore ? encodeCursor(sliced[sliced.length - 1]) : null;

  // Optional cheap count (approx) by using $group with $match first; can be heavy, so omit by default
  return res.json({ items: sliced, nextCursor });
};

// GET /api/support/tickets/:ticketId
export const getTicket = async (req, res) => {
  const { ticketId } = req.params;
  const user = req.user;

  const ticket = await SupportTicket.findById(ticketId).lean();
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });

  if (!isStaff(user.role) && String(ticket.userId) !== String(user.id)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // Fetch latest messages for the ticket (first page)
  const { cursor, limit = 20 } = req.query;
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const decoded = decodeCursor(cursor);

  const msgMatch = { ticketId: ticket._id };
  if (decoded) {
    msgMatch.$or = [
      { createdAt: { $lt: decoded.createdAt } },
      { createdAt: decoded.createdAt, _id: { $lt: new mongoose.Types.ObjectId(decoded._id) } },
    ];
  }

  const messages = await SupportMessage
    .find(msgMatch)
    .sort({ createdAt: -1, _id: -1 })
    .limit(safeLimit + 1)
    .lean();

  const hasMore = messages.length > safeLimit;
  const sliced = hasMore ? messages.slice(0, safeLimit) : messages;
  const nextCursor = hasMore ? encodeCursor(sliced[sliced.length - 1]) : null;

  // Gather attachments metadata for the page of messages
  const messageIds = sliced.map((m) => m._id);
  const attachments = await SupportAttachment.find({ messageId: { $in: messageIds } }).lean();

  return res.json({ ticket, messages: sliced, attachments, nextCursor });
};

// GET /api/support/tickets/:ticketId/messages
export const listMessages = async (req, res) => {
  const { ticketId } = req.params;
  const { cursor, limit = 20 } = req.query;
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 200);

  const ticket = await SupportTicket.findById(ticketId).lean();
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });

  const user = req.user;
  if (!isStaff(user.role) && String(ticket.userId) !== String(user.id)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const decoded = decodeCursor(cursor);
  const match = { ticketId: ticket._id };
  if (decoded) {
    match.$or = [
      { createdAt: { $lt: decoded.createdAt } },
      { createdAt: decoded.createdAt, _id: { $lt: new mongoose.Types.ObjectId(decoded._id) } },
    ];
  }

  const items = await SupportMessage
    .find(match)
    .sort({ createdAt: -1, _id: -1 })
    .limit(safeLimit + 1)
    .lean();

  const hasMore = items.length > safeLimit;
  const sliced = hasMore ? items.slice(0, safeLimit) : items;
  const nextCursor = hasMore ? encodeCursor(sliced[sliced.length - 1]) : null;

  return res.json({ items: sliced, nextCursor });
};

// POST /api/support/tickets/:ticketId/messages
export const createMessage = async (req, res) => {
  const { ticketId } = req.params;
  const { message, attachments } = req.body || {};
  const userId = req.user?.id;

  const ticket = await SupportTicket.findById(ticketId);
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  if (!isStaff(req.user.role) && String(ticket.userId) !== String(userId)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const msg = await SupportMessage.create([{ ticketId, senderId: userId, message: message || "", attachments: [] }], { session });

    let createdAttachments = [];
    if (attachments && attachments.length) {
      const docs = attachments.map((a) => ({
        ticketId: ticket._id,
        messageId: msg[0]._id,
        fileName: sanitizeFileName(a.fileName || "file"),
        fileUrl: a.fileUrl,
        fileSize: a.fileSize || 0,
        contentType: a.contentType || "application/octet-stream",
        uploadedBy: userId,
      }));
      createdAttachments = await SupportAttachment.create(docs, { session });
      await SupportMessage.updateOne({ _id: msg[0]._id }, { $set: { attachments: createdAttachments.map((d) => d._id) } }, { session });
    }

    await session.commitTransaction();

    // Trigger FCM Notification: Ticket Reply
    try {
      const isStaffSender = isStaff(req.user.role);
      const recipientUserId = isStaffSender ? ticket.userId : ticket.assigneeId; // if staff -> user, else -> assignee if any
      if (recipientUserId) {
        await notificationService.send({
          title: "Support Ticket Reply",
          message: `New reply on your support ticket #${ticket.ticketNumber}.`,
          type: "info",
          recipientIds: [recipientUserId],
          data: { module: "support", ticketId: ticket._id, ticketNumber: ticket.ticketNumber }
        });
      }
    } catch (e) {
      console.error("Notification (createMessage) failed:", e?.message || e);
    }

    return res.status(201).json({
      message: { _id: msg[0]._id },
      attachments: createdAttachments.map((a) => ({ _id: a._id, fileName: a.fileName, fileUrl: a.fileUrl })),
    });
  } catch (err) {
    await session.abortTransaction();
    console.error("createMessage error", err);
    return res.status(500).json({ error: "Failed to add message" });
  } finally {
    session.endSession();
  }
};

// PATCH /api/support/tickets/:ticketId/status
export const updateStatus = async (req, res) => {
  const { ticketId } = req.params;
  const { status } = req.body || {};

  if (!isStaff(req.user.role)) return res.status(403).json({ error: "Forbidden" });
  const allowed = ["open", "pending", "resolved", "closed"];
  if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid status" });

  const ticket = await SupportTicket.findById(ticketId);
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });

  ticket.status = status;
  await ticket.save();

  // Log system message
  await SupportMessage.create({ ticketId, senderId: req.user.id, message: `Status changed to ${status}` });

  // Trigger FCM Notification: Ticket Closed/Resolved
  try {
    if (["resolved", "closed"].includes(status)) {
      await notificationService.send({
        title: "Support Ticket Update",
        message: `Your ticket #${ticket.ticketNumber} has been ${status}.`,
        type: "success",
        recipientIds: [ticket.userId],
        data: { module: "support", ticketId: ticket._id, ticketNumber: ticket.ticketNumber }
      });
    }
  } catch (e) {
    console.error("Notification (updateStatus) failed:", e?.message || e);
  }

  return res.json({ ok: true });
};

// POST /api/support/attachments
export const uploadAttachment = async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file provided" });

    const { buffer, mimetype, originalname, size } = file;
    const { fileUrl, key, bucket } = await uploadToS3({ buffer, contentType: mimetype, originalName: originalname });

    return res.status(201).json({ fileName: sanitizeFileName(originalname), fileUrl, fileSize: size, contentType: mimetype, key, bucket });
  } catch (err) {
    console.error("uploadAttachment error", err);
    return res.status(500).json({ error: err.message || "Upload failed" });
  }
};
