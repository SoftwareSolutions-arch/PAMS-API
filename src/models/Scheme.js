// models/Scheme.js

import mongoose from "mongoose";

const schemeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Scheme name is required"],
      trim: true,
      minlength: [2, "Scheme name must be at least 2 characters long"],
    },

    type: {
      type: String,
      required: [true, "Scheme name is required"],
    },

    tenure: {
      type: Number,
      required: [true, "Tenure is required"],
      min: [1, "Tenure must be at least 1 year"],
    },

    minTerm: {
      type: Number,
      required: [true, "Minimum term is required"],
      min: [1, "Minimum term must be at least 1 month"],
    },

    maxTerm: {
      type: Number,
      required: [true, "Maximum term is required"],
      min: [1, "Maximum term must be at least 1 month"],
      validate: {
        validator: function (value) {
          // `this` refers to the current document
          return value >= this.minTerm;
        },
        message: "Maximum term must be greater than or equal to minimum term",
      },
    },

    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      default: null,
    },
    
    color: { type: String, default: "#3b82f6" },

    icon: { type: String, default: "TrendingUp" },

    isActive: {
      type: Boolean,
      default: true, // Active by default
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
  }
);

// ✅ Indexes for optimized queries
schemeSchema.index({ companyId: 1, name: 1 });
schemeSchema.index({ isActive: 1 });

// ✅ Helper static methods

// Fetch only active schemes by default
schemeSchema.statics.findActive = function (filter = {}) {
  return this.find({ ...filter, isActive: true });
};

// Soft delete (mark as inactive)
schemeSchema.methods.softDelete = async function () {
  this.isActive = false;
  await this.save();
};

// Restore a previously soft-deleted scheme
schemeSchema.methods.restore = async function () {
  this.isActive = true;
  await this.save();
};

// ✅ Pre hooks (optional)
// You can uncomment if you want automatic filtering for `find()` queries
/*
schemeSchema.pre(/^find/, function (next) {
  this.where({ isActive: true });
  next();
});
*/

const Scheme = mongoose.model("Scheme", schemeSchema);

export default Scheme;
