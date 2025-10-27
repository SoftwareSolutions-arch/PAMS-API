import mongoose from "mongoose";

const { Schema } = mongoose;

const supportAttachmentSchema = new Schema(
  {
    ticketId: { type: Schema.Types.ObjectId, ref: "SupportTicket", required: true, index: true },
    messageId: { type: Schema.Types.ObjectId, ref: "SupportMessage", required: true, index: true },
    fileName: { type: String, required: true, trim: true },
    fileUrl: { type: String, required: true },
    fileSize: { type: Number, required: true },
    contentType: { type: String, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

supportAttachmentSchema.index({ ticketId: 1, createdAt: -1, _id: -1 });
supportAttachmentSchema.index({ messageId: 1 });

export const SupportAttachment = mongoose.model("SupportAttachment", supportAttachmentSchema);
