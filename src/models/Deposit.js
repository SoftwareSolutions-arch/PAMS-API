import mongoose from "mongoose";

const depositSchema = new mongoose.Schema({
    date: { type: Date, required: true },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    schemeType: { type: String, enum: ["RD", "NSC", "KVP", "PPF"] },
    amount: { type: Number, required: true },
    collectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" } // Agent ID
}, { timestamps: true });

export default mongoose.model("Deposit", depositSchema);
