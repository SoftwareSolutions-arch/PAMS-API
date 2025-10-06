import admin from "../config/firebaseAdmin.js";

export const sendFirebaseNotification = async (token, title, body, data = {}) => {
  if (!token) {
    console.warn("⚠️ No FCM token provided, skipping notification");
    return;
  }

  try {
    const message = {
      token,
      notification: { title, body },
      data,
    };

    const response = await admin.messaging().send(message);
    console.log("✅ Notification sent successfully:", response);
  } catch (error) {
    console.error("❌ FCM Send Error:", error.message);
  }
};
