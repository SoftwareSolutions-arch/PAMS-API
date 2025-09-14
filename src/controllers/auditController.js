// controllers/auditController.js
import AuditLog from "../models/AuditLog.js";

// ✅ Get audit logs with optional filters
export const getAuditLogs = async (req, res, next) => {
  try {
    const { action, status, userId, from, to, limit = 100 } = req.query;

    const filter = {};

    if (action) filter.action = action;
    if (status) filter.status = status.toUpperCase(); // SUCCESS / FAILURE
    if (userId) filter.performedBy = userId;

    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    const logs = await AuditLog.find(filter)
      .populate("performedBy", "name email role")
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    res.json({ count: logs.length, logs });
  } catch (err) {
    next(err);
  }
};

// ✅ Get a single audit log by ID
export const getAuditLogById = async (req, res, next) => {
  try {
    const log = await AuditLog.findById(req.params.id)
      .populate("performedBy", "name email role");

    if (!log) {
      return res.status(404).json({ error: "Audit log not found" });
    }

    res.json(log);
  } catch (err) {
    next(err);
  }
};

// ✅ Clear audit logs (Admin only)
export const clearAuditLogs = async (req, res, next) => {
  try {
    if (req.user.role !== "Admin") {
      return res.status(403).json({ error: "Only Admin can clear audit logs" });
    }

    await AuditLog.deleteMany({});
    res.json({ message: "All audit logs cleared" });
  } catch (err) {
    next(err);
  }
};
