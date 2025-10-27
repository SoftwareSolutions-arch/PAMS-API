import mongoose from "mongoose";

const superAdminSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 50
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/.+\@.+\..+/, "Please fill a valid email address"]
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  role: {
    type: String,
    enum: ["superadmin"],
    default: "superadmin",
    required: true,
    immutable: true,
    index: true,
    validate: {
      validator: function (v) {
        return v === "superadmin";
      }
    }
  }
  ,
  // 🔐 Single-session enforcement
  sessionVersion: { type: Number, default: 0 }
});

export const SuperAdmin = mongoose.model("SuperAdmin", superAdminSchema);
