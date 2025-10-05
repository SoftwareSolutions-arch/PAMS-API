import mongoose from "mongoose";

const depositChangeRequestSchema = new mongoose.Schema({
  depositId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Deposit",
    required: true
  },
  agentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  oldValues: {
    type: Object,
    required: true
  },
  newValues: {
    type: Object,
    required: true
  },
  reason: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ["Pending", "Approved", "Rejected"],
    default: "Pending"
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
}, { timestamps: true });

export default mongoose.model("DepositChangeRequest", depositChangeRequestSchema);
