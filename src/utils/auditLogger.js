import AuditLog from "../models/AuditLog.js";

export const logAudit = async ({
  action,
  entityType,
  entityId = null,
  details = {},
  reqUser
}) => {
  try {
    await AuditLog.create({
      action,
      entityType,
      entityId,
      details,
      performedBy: reqUser.id,
      companyId: reqUser.companyId
    });
  } catch (err) {
    console.error("Audit logging failed:", err.message);
  }
};
