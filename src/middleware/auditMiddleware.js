import AuditLog from "../models/AuditLog.js";

/**
 * Audit logging middleware
 * Logs every request/response cycle to AuditLog
 */
export const auditLogger = async (req, res, next) => {
  const start = Date.now();

  // hook into response finish event
  res.on("finish", async () => {
    try {
      const duration = Date.now() - start;

      // Determine action (method + route)
      const action = `${req.method} ${req.baseUrl}${req.route?.path || ""}`;

      // Determine status
      const success = res.statusCode < 400;
      const status = success ? "SUCCESS" : "FAILURE";

      // Collect safe metadata
      const metadata = {
        params: req.params,
        query: req.query,
        body: sanitizeBody(req.body),
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        durationMs: duration,
        statusCode: res.statusCode,
      };

      // Create audit log
      await AuditLog.create({
        companyId: req.user.companyId,
        action,
        status,
        performedBy: req.user.id || null,
        details: success
          ? `${req.method} ${req.originalUrl} completed in ${duration}ms`
          : `${req.method} ${req.originalUrl} failed with status ${res.statusCode}`,
        metadata,
      });
    } catch (err) {
      console.error("Audit logging failed:", err.message);
    }
  });

  next();
};

/**
 * Sanitize body: remove sensitive fields like password
 */
function sanitizeBody(body) {
  if (!body) return {};
  const clone = { ...body };
  if (clone.password) clone.password = "********";
  if (clone.token) clone.token = "********";
  return clone;
}
