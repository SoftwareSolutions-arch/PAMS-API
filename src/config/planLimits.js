// src/config/planLimits.js

export const PLAN_LIMITS = {
  free: {
    admins: 1,
    managers: 1,
    agents: 1,
    users: 50,
    analyticsLevel: "basic",
    features: {
      advancedAnalytics: false,
      customIntegrations: false,
      prioritySupport: false,
    },
  },
  pro: {
    admins: 5,
    managers: 10,
    agents: Infinity,
    users: Infinity,
    analyticsLevel: "advanced",
    features: {
      advancedAnalytics: true,
      customIntegrations: true,
      prioritySupport: true,
    },
  },
  custom: {
    admins: Infinity,
    managers: Infinity,
    agents: Infinity,
    users: Infinity,
    analyticsLevel: "advanced",
    features: {
      advancedAnalytics: true,
      customIntegrations: true,
      prioritySupport: true,
      whiteLabel: true,
      onPrem: true,
      dedicatedManager: true,
      phoneSupport24x7: true,
      training: true,
    },
  },
};

export default PLAN_LIMITS;
