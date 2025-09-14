import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId },
    details: { type: Object },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    error: { type: String },
    status: { type: String, enum: ["SUCCESS", "FAILURE"], required: true }
  },
  { timestamps: true }
);

export default mongoose.model("AuditLog", auditLogSchema);
