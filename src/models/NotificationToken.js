import mongoose from "mongoose";

const { Schema } = mongoose;

const notificationTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    deviceToken: { type: String, required: true },
    deviceType: { type: String, enum: ["web", "android", "ios"], default: "web" },
  },
  { timestamps: true }
);

// Ensure a token is only stored once per user
notificationTokenSchema.index({ userId: 1, deviceToken: 1 }, { unique: true });
// Query by token fast
notificationTokenSchema.index({ deviceToken: 1 });

export default mongoose.model("NotificationToken", notificationTokenSchema);
