// src/middleware/checkPlanLimit.js
import Company from "../models/Company.js";
import User from "../models/User.js";
import PLAN_LIMITS from "../config/planLimits.js";
import { isFeatureAvailable, getAnalyticsLevel } from "../utils/planFeatures.js";
import { createError } from "../utils/createError.js";

const FORBIDDEN_MESSAGE =
  "Limit exceeded for your current subscription plan. Please upgrade to Pro or Custom.";

/**
 * Middleware factory to enforce plan limits per action/feature.
 * Usage examples:
 *   checkPlanLimit({ action: 'createUser' })
 *   checkPlanLimit({ feature: 'advancedAnalytics' })
 *   checkPlanLimit({ feature: 'customIntegrations' })
 */
export function checkPlanLimit(options = {}) {
  const { action, feature } = options;

  return async function (req, res, next) {
    try {
      // Company must be derived from authenticated user
      const companyId = req.user?.companyId;
      if (!companyId) {
        return res.status(401).json({ error: "Not authorized" });
      }

      const company = await Company.findById(companyId).lean();
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      const planKey = company.subscriptionPlan || "free";
      const plan = PLAN_LIMITS[planKey];
      if (!plan) {
        return res.status(403).json({ error: FORBIDDEN_MESSAGE });
      }

      // Feature gate checks
      if (feature) {
        const allowed = isFeatureAvailable(company, feature);
        if (!allowed) {
          return res.status(403).json({ error: FORBIDDEN_MESSAGE });
        }

        // Special case for analytics level check
        if (feature === "advancedAnalytics") {
          const level = getAnalyticsLevel(company);
          if (level !== "advanced") {
            return res.status(403).json({ error: FORBIDDEN_MESSAGE });
          }
        }
      }

      // Usage limit checks
      if (action === "createUser") {
        const targetRole = req.body?.role;
        if (!targetRole) {
          return res.status(400).json({ error: "role is required" });
        }
        await assertCanCreateRole(companyId, targetRole);
      }

      return next();
    } catch (err) {
      console.error("Plan Limit Middleware Error:", err);
      const status = err?.status || 500;
      const message = err?.message || "Server error";
      return res.status(status).json({ error: message });
    }
  };
}

export default checkPlanLimit;

/**
 * Asserts that creating a user with `targetRole` does not exceed plan limits.
 * Throws 403 error if limit reached for the company plan.
 */
export async function assertCanCreateRole(companyId, targetRole) {
  const company = await Company.findById(companyId).lean();
  if (!company) throw createError(404, "Company not found");
  const planKey = company.subscriptionPlan || "free";
  const limits = PLAN_LIMITS[planKey];
  if (!limits) throw createError(403, FORBIDDEN_MESSAGE);

  const approvedFilter = { companyId, requestStatus: "Approved" };
  const [adminCount, managerCount, agentCount, userCount] = await Promise.all([
    User.countDocuments({ ...approvedFilter, role: "Admin" }),
    User.countDocuments({ ...approvedFilter, role: "Manager" }),
    User.countDocuments({ ...approvedFilter, role: "Agent" }),
    User.countDocuments({ ...approvedFilter, role: "User" }),
  ]);

  const exceeds = (role) => {
    switch (role) {
      case "Admin":
        return Number.isFinite(limits.admins) && adminCount >= limits.admins;
      case "Manager":
        return Number.isFinite(limits.managers) && managerCount >= limits.managers;
      case "Agent":
        return Number.isFinite(limits.agents) && agentCount >= limits.agents;
      case "User":
        return Number.isFinite(limits.users) && userCount >= limits.users;
      default:
        return false;
    }
  };

  if (exceeds(targetRole)) {
    throw createError(403, FORBIDDEN_MESSAGE);
  }
}
