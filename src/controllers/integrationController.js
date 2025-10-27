// src/controllers/integrationController.js
export const getCustomIntegrationData = async (req, res, next) => {
  try {
    res.json({ message: "Custom integration data", timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
};
