import mongoose from "mongoose";
import User from "../models/User.js";
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
  const userRole = req.user?.role;
  const companyId = req.user?.companyId;

  const { subject, contactType, message, attachments } = req.body || {};

  if (!subject || typeof subject !== "string" || subject.trim().length < 3) {
    return res.status(400).json({ error: "subject is required (min 3 chars)" });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 🔹 Determine the upper-level assignee based on hierarchy
    let assigneeId = null;

    if (userRole === "User") {
      // Find the agent assigned to this user
      const agent = await User.findOne({ _id: req.user.agentId, companyId, role: "Agent" });
      if (agent) assigneeId = agent._id;
    } else if (userRole === "Agent" || userRole === "Manager") {
      // Assign to the company Admin
      const admin = await User.findOne({ companyId, role: "Admin" });
      if (admin) assigneeId = admin._id;
    } else if (userRole === "Admin") {
      // Assign to the global SuperAdmin
      const superAdmin = await User.findOne({ role: "SuperAdmin" });
      if (superAdmin) assigneeId = superAdmin._id;
    } else if (userRole === "SuperAdmin") {
      // SuperAdmin can be self-assigned (optional)
      assigneeId = req.user._id;
    }

    // 🔹 Create the support ticket (companyId included)
    const ticketNumber = await getNextTicketNumber(session);
    const ticket = await SupportTicket.create(
      [
        {
          ticketNumber,
          userId,
          subject: subject.trim(),
          contactType: contactType || "app",
          companyId, // ✅ store companyId
          assigneeId,
        },
      ],
      { session }
    );

    let createdMessage = null;
    let createdAttachments = [];

    // 🔹 If message or attachments exist, create the first message
    if (message || (attachments && attachments.length)) {
      createdMessage = await SupportMessage.create(
        [
          {
            ticketId: ticket[0]._id,
            senderId: userId,
            message: message || "",
            attachments: [],
            companyId, // ✅ store companyId
          },
        ],
        { session }
      );

      // 🔹 Handle attachments if provided
      if (attachments && attachments.length) {
        const docs = attachments.map((a) => ({
          ticketId: ticket[0]._id,
          messageId: createdMessage[0]._id,
          fileName: sanitizeFileName(a.fileName || "file"),
          fileUrl: a.fileUrl,
          fileSize: a.fileSize || 0,
          contentType: a.contentType || "application/octet-stream",
          uploadedBy: userId,
          companyId, // ✅ store companyId
        }));

        createdAttachments = await SupportAttachment.create(docs, { session });

        await SupportMessage.updateOne(
          { _id: createdMessage[0]._id },
          { $set: { attachments: createdAttachments.map((d) => d._id) } },
          { session }
        );
      }
    }

    await session.commitTransaction();

    const created = Array.isArray(ticket) ? ticket[0] : ticket;

    return res.status(201).json({
      ticket: {
        _id: created._id,
        ticketNumber: created.ticketNumber,
        subject: created.subject,
        contactType: created.contactType,
        status: created.status,
        companyId: created.companyId,
        assigneeId: created.assigneeId,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      },
      nextCursor: null,
      message: createdMessage ? { _id: createdMessage[0]._id } : null,
      attachments: createdAttachments.map((a) => ({
        _id: a._id,
        fileName: a.fileName,
        fileUrl: a.fileUrl,
      })),
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
  try {
    const { cursor, limit = 20 } = req.query;
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

    const decoded = decodeCursor(cursor);
    const user = req.user;

    // 🔹 Base filter — company scope always applied
    const baseMatch = {
      companyId: user.companyId, // ✅ ensure tickets belong to same company
    };

    // 🔹 Role-based restriction (non-staff users see only their own tickets)
    if (!isStaff(user.role)) {
      baseMatch.userId = user.id;
    }


    // 🔹 Cursor-based pagination filter
    const cursorFilter = decoded
      ? {
        $or: [
          { createdAt: { $lt: decoded.createdAt } },
          {
            createdAt: decoded.createdAt,
            _id: { $lt: new mongoose.Types.ObjectId(decoded._id) },
          },
        ],
      }
      : {};

    const sort = { createdAt: -1, _id: -1 };

    // 🔹 Final match combines company + role + cursor filters
    const match = { ...baseMatch, ...cursorFilter };

    // 🔹 Aggregation pipeline with latest message
    const pipeline = [
      { $match: match },
      { $sort: sort },
      { $limit: safeLimit + 1 },
      {
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
      },
      { $addFields: { lastMsg: { $arrayElemAt: ["$lastMsg", 0] } } },
      {
        $project: {
          _id: 1,
          ticketNumber: 1,
          subject: 1,
          contactType: 1,
          status: 1,
          createdAt: 1,
          updatedAt: 1,
          assigneeId: 1,
          lastMsg: 1,
        },
      },
    ];

    const items = await SupportTicket.aggregate(pipeline).exec();

    const hasMore = items.length > safeLimit;
    const sliced = hasMore ? items.slice(0, safeLimit) : items;
    const nextCursor = hasMore ? encodeCursor(sliced[sliced.length - 1]) : null;

    res.json({ items: sliced, nextCursor });
  } catch (err) {
    console.error("Error in listTickets:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
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
