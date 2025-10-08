import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true ,lowercase: true, trim: true},
  password: {
    type: String,
    required: function () {
      return this.requestStatus === "Approved";  // ✅ only required after approval
    }
  },
  role: {
    type: String,
    enum: ["Admin", "Manager", "Agent", "User"],
    default: "User"
  },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  isBlocked: { type: Boolean, default: false },

  requestStatus: {
    type: String,
    enum: ["Pending", "Approved", "Rejected"],
    default: "Pending"
  },
  requestedBy: { type: String },

  // 🔹 Forgot password OTP
  resetOtp: { type: String },              // hashed OTP
  resetOtpExpires: { type: Date },         // expiry (10 mins)

  // 🔹 Reset token (after OTP verification)
  resetToken: { type: String },            // random token string
  resetTokenExpires: { type: Date },       // expiry (15 mins)
  status: { type: String, default: "Active" },

  fcmToken: { type: String, default: null },
}, { timestamps: true });

export default mongoose.model("User", userSchema);
