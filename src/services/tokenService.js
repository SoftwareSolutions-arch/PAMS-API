import NotificationToken from "../models/NotificationToken.js";

export const tokenService = {
  async saveOrUpdate({ userId, deviceToken, deviceType = "web" }) {
    if (!userId || !deviceToken) throw new Error("userId and deviceToken are required");

    const doc = await NotificationToken.findOneAndUpdate(
      { userId, deviceToken },
      { $set: { userId, deviceToken, deviceType } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return doc;
  },

  async removeToken({ userId, deviceToken }) {
    if (!deviceToken) throw new Error("deviceToken is required");
    const filter = userId ? { userId, deviceToken } : { deviceToken };
    await NotificationToken.deleteOne(filter);
    return { ok: true };
  },

  async getTokensByUserIds(userIds = []) {
    if (!Array.isArray(userIds) || userIds.length === 0) return [];
    const rows = await NotificationToken.find({ userId: { $in: userIds } }, { deviceToken: 1, userId: 1 }).lean();
    return rows;
  },

  async getAllTokens() {
    const rows = await NotificationToken.find({}, { deviceToken: 1, userId: 1 }).lean();
    return rows;
  }
};
