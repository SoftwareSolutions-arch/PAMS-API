import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
    action: { type: String, required: true },
    entityType: { type: String },
    entityId: { type: mongoose.Schema.Types.ObjectId },
    details: { type: Object },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    error: { type: String },
    status: { type: String, enum: ["SUCCESS", "FAILURE"] }
  },
  { timestamps: true }
);

export default mongoose.model("AuditLog", auditLogSchema);
