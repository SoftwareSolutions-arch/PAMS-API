import mongoose from "mongoose";

const accountSchema = new mongoose.Schema(
  {
    clientName: { type: String, required: true },
    accountNumber: { type: String, required: true, unique: true },
    schemeType: { type: String, required: true }, // RD, FD, NSC, KVP, PPF, etc
    balance: { type: Number, default: 0 },
    openingBalance: { type: Number, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    assignedAgent: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // Duration
    durationMonths: { type: Number, required: true },
    maturityDate: { type: Date, required: true },

    // for Payment Mode
    paymentMode: {
      type: String,
      enum: ["Yearly", "Monthly", "Daily"],
      required: true
    },
    installmentAmount: { type: Number },   // For Monthly RD
    monthlyTarget: { type: Number },       // For Daily deposits with target
    isFullyPaid: { type: Boolean, default: false }, // For FD / Yearly
    status: {
      type: String,
      enum: ["Active","OnTrack", "Pending", "Defaulter", "Matured", "Closed"],
      default: "Active"
    }
  },
  { timestamps: true }
);

export default mongoose.model("Account", accountSchema);
