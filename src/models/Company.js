// models/Company.js
import mongoose from "mongoose";

const companySchema = new mongoose.Schema(
  {
    companyName: { type: String, required: true, trim: true },
    legalName: { type: String, trim: true },
    registrationNumber: { type: String, trim: true },
    industry: { type: String, trim: true },
    address: {
      street: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      country: { type: String, trim: true },
      postalCode: { type: String, trim: true },
    },
    contactInfo: {
      email: { type: String, trim: true, lowercase: true },
      phone: { type: String, trim: true },
      website: { type: String, trim: true },
    },
    settings: {
      timezone: { type: String, default: "Asia/Kolkata" },
    },

    // NEW: one-time init token storage (store HASH only)
    initTokenHash: { type: String, default: null },
    initTokenExpires: { type: Date, default: null },
    hasAdmin: { type: Boolean, default: false },

    status: {
      type: String,
      enum: ["active", "suspended", "blocked", "inprogress"],
      default: "inprogress",
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

const Company = mongoose.model("Company", companySchema);

export default Company;
