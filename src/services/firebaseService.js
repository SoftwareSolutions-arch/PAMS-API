import admin from "../config/firebaseAdmin.js";

/**
 * Send an FCM message to one or many tokens
 * @param {string[]} tokens - Array of device tokens
 * @param {string} title
 * @param {string} message
 * @param {object} data
 */
export async function sendFCMMessage(tokens = [], title = "", message = "", data = {}) {
  if (!tokens || tokens.length === 0) return { successCount: 0, failureCount: 0, responses: [] };

  // Build payload
  const payload = {
    notification: { title, body: message },
    data: Object.fromEntries(
      Object.entries(data || {}).map(([k, v]) => [String(k), typeof v === "string" ? v : JSON.stringify(v)])
    ),
  };

  try {
    // If one token, use send; if many, use sendEachForMulticast
    if (tokens.length === 1) {
      const response = await admin.messaging().send({ token: tokens[0], ...payload });
      return { successCount: 1, failureCount: 0, responses: [response] };
    }

    const response = await admin.messaging().sendEachForMulticast({ tokens, ...payload });
    return { successCount: response.successCount, failureCount: response.failureCount, responses: response.responses };
  } catch (err) {
    console.error("FCM send error:", err?.message || err);
    return { successCount: 0, failureCount: tokens.length, responses: [] };
  }
}
