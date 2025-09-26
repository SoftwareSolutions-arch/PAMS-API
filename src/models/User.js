import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { 
    type: String, 
    enum: ["Admin", "Manager", "Agent", "User"], 
    default: "User" 
  },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  isBlocked: { type: Boolean, default: false },

  // 🔹 Forgot password OTP
  resetOtp: { type: String },              // hashed OTP
  resetOtpExpires: { type: Date },         // expiry (10 mins)

  // 🔹 Reset token (after OTP verification)
  resetToken: { type: String },            // random token string
  resetTokenExpires: { type: Date }        // expiry (15 mins)
}, { timestamps: true });

export default mongoose.model("User", userSchema);
