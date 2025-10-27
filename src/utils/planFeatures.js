// src/utils/planFeatures.js
import PLAN_LIMITS from "../config/planLimits.js";

/**
 * Check if a feature is available under the company's subscription plan
 * @param {import('../models/Company.js').default|{subscriptionPlan:string}} company
 * @param {string} feature - semantic key: 'advancedAnalytics' | 'customIntegrations' | 'prioritySupport' | 'whiteLabel' | 'onPrem' | 'dedicatedManager' | 'phoneSupport24x7' | 'training'
 * @returns {boolean}
 */
export function isFeatureAvailable(company, feature) {
  if (!company || !company.subscriptionPlan) return false;
  const plan = company.subscriptionPlan;
  const planConf = PLAN_LIMITS[plan];
  if (!planConf) return false;
  if (!planConf.features) return false;
  return Boolean(planConf.features[feature]);
}

/**
 * Get analytics level allowed for plan: 'basic' | 'advanced'
 */
export function getAnalyticsLevel(company) {
  if (!company || !company.subscriptionPlan) return "basic";
  const planConf = PLAN_LIMITS[company.subscriptionPlan];
  return planConf?.analyticsLevel || "basic";
}

export default {
  isFeatureAvailable,
  getAnalyticsLevel,
};
