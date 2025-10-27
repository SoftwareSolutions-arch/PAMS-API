// src/controllers/analyticsController.js
import Company from "../models/Company.js";
import { getAnalyticsLevel } from "../utils/planFeatures.js";

export const getBasicAnalytics = async (req, res, next) => {
  try {
    // Dummy payload for example; replace with real aggregation later
    res.json({
      level: "basic",
      metrics: {
        users: 0,
        accounts: 0,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const getAdvancedAnalytics = async (req, res, next) => {
  try {
    const company = await Company.findById(req.user.companyId).lean();
    const level = getAnalyticsLevel(company);
    if (level !== "advanced") {
      return res.status(403).json({
        error:
          "Limit exceeded for your current subscription plan. Please upgrade to Pro or Custom.",
      });
    }

    // Dummy payload for example; replace with real aggregation later
    res.json({
      level: "advanced",
      metrics: {
        usersByRole: [],
        depositsTrend: [],
        churnRate: 0,
      },
    });
  } catch (err) {
    next(err);
  }
};
