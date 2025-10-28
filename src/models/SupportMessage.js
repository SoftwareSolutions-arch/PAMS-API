import mongoose from "mongoose";

const { Schema } = mongoose;

const supportMessageSchema = new Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
    ticketId: { type: Schema.Types.ObjectId, ref: "SupportTicket", required: true, index: true },
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    message: { type: String, default: "", maxlength: 10000 },
    attachments: [{ type: Schema.Types.ObjectId, ref: "SupportAttachment" }],
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Indexes optimized for per-ticket chronological views and cursor pagination
supportMessageSchema.index({ ticketId: 1, createdAt: -1, _id: -1 });

export const SupportMessage = mongoose.model("SupportMessage", supportMessageSchema);
