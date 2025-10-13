import mongoose from "mongoose";

const depositSchema = new mongoose.Schema({
    date: { type: Date, required: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    schemeType: { type: String },
    amount: { type: Number, required: true },
    collectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" } // Agent ID
}, { timestamps: true });

export default mongoose.model("Deposit", depositSchema);
