import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["Admin", "Manager", "Agent", "User"], default: "User" },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Manager for Agents, Agent for Users
    isBlocked: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.model("User", userSchema);
