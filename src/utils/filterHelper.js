import mongoose from "mongoose";

/**
 * Build a consistent filter with companyId + scope-based restrictions
 * @param {Object} req - Express request (with req.user)
 * @param {Object} scope - scope object from getScope/getEffectiveScope
 * @param {Object} baseFilter - any custom base filter (date range etc.)
 * @returns {Object} final filter for queries/aggregations
 */
export const buildFilter = (req, scope, baseFilter = {}) => {
    const filter = {
        companyId: new mongoose.Types.ObjectId(req.user.companyId),
        ...baseFilter,
    };

    if (!scope.isAll) {
        if (req.user.role === "Manager" || req.query?.managerId) {
            filter.assignedAgent = { $in: scope.agents };
        } else if (req.user.role === "Agent" || req.query?.agentId) {
            filter.assignedAgent = req.user.id;
        } else if (req.user.role === "User") {
            filter.userId = req.user.id;
        }
    }

    return filter;
};
