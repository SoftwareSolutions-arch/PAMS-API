import mongoose from "mongoose";

const { Schema } = mongoose;

const supportTicketSchema = new Schema(
  {
    ticketNumber: { type: Number, unique: true, index: true, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    subject: { type: String, required: true, trim: true, maxlength: 300 },
    contactType: {
      type: String,
      enum: ["email", "phone", "chat", "app", "web", "other"],
      default: "app",
      index: true,
    },
    status: {
      type: String,
      enum: ["open", "pending", "resolved", "closed"],
      default: "open",
      index: true,
    },
    assigneeId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
  },
  { timestamps: true }
);

// Optimized compound indexes for common query patterns
// - Recent tickets for a user
supportTicketSchema.index({ userId: 1, createdAt: -1, _id: -1 });
// - Recent tickets globally (staff views)
supportTicketSchema.index({ createdAt: -1, _id: -1 });
// - Filter by assignee and sort by recency
supportTicketSchema.index({ assigneeId: 1, createdAt: -1, _id: -1 });

export const SupportTicket = mongoose.model("SupportTicket", supportTicketSchema);
