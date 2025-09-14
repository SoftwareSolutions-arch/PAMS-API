import mongoose from "mongoose";

const accountSchema = new mongoose.Schema(
  {
    clientName: { type: String, required: true },
    accountNumber: { type: String, required: true, unique: true },
    schemeType: { type: String, required: true }, // RD, FD, NSC, KVP, PPF, etc

    // Runtime balance (from deposits)
    balance: { type: Number, default: 0 },

    // Relationship
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    assignedAgent: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // Duration
    durationMonths: { type: Number, required: true },
    maturityDate: { type: Date, required: true },

    // Payment Mode
    paymentMode: {
      type: String,
      enum: ["Yearly", "Monthly", "Daily"],
      required: true
    },
    yearlyAmount: { type: Number },       // For Yearly
    installmentAmount: { type: Number },  // For Monthly
    monthlyTarget: { type: Number },      // For Daily
    isFullyPaid: { type: Boolean, default: false }, // For Yearly

    // Auto-calculated total target
    totalPayableAmount: { type: Number, required: true },

    status: {
      type: String,
      enum: ["Active", "OnTrack", "Pending", "Defaulter", "Matured", "Closed"],
      default: "Active"
    }
  },
  { timestamps: true }
);

export default mongoose.model("Account", accountSchema);
