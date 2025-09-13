import mongoose from "mongoose";

const accountSchema = new mongoose.Schema({
    clientName: { type: String, required: true },
    accountNumber: { type: String, required: true, unique: true },
    schemeType: { type: String, enum: ["RD", "NSC", "KVP", "PPF"], required: true },
    balance: { type: Number, default: 0 },
    openingBalance: { type: Number, default: 0 },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    assignedAgent: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    durationMonths: { type: Number, required: true }, // e.g., 6, 12, 60
    maturityDate: { type: Date, required: true },
    status: { type: String, enum: ["Active", "Matured", "Closed"], default: "Active" }

}, { timestamps: true });

// 🔧 Hook: Auto-calculate maturityDate when creating a new account
accountSchema.pre("validate", function (next) {
  if (this.isNew && this.durationMonths && !this.maturityDate) {
    const openDate = this.createdAt || new Date();
    this.maturityDate = new Date(openDate);
    this.maturityDate.setMonth(this.maturityDate.getMonth() + this.durationMonths);
  }
  next();
});

export default mongoose.model("Account", accountSchema);
