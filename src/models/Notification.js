import mongoose from "mongoose";

const { Schema } = mongoose;

const notificationSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    type: { type: String, enum: ["info", "warning", "success", "critical"], default: "info" },
    priority: { type: String, enum: ["normal", "high"], default: "normal" },
    data: { type: Object, default: {} },
    recipientIds: [{ type: Schema.Types.ObjectId, ref: "User", index: true }],
    readBy: [{ type: Schema.Types.ObjectId, ref: "User", index: true }],
  },
  { timestamps: true }
);

// Indexes for common queries
notificationSchema.index({ createdAt: -1, _id: -1 });
notificationSchema.index({ recipientIds: 1, createdAt: -1, _id: -1 });
notificationSchema.index({ readBy: 1 });

export default mongoose.model("Notification", notificationSchema);
