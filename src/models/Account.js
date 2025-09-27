import mongoose from "mongoose";

const accountSchema = new mongoose.Schema(
  {
    clientName: { 
      type: String, 
      required: [true, "Client name is required"], 
      trim: true,
      minlength: [3, "Client name must be at least 3 characters long"],
      maxlength: [100, "Client name cannot exceed 100 characters"]
    },

    accountNumber: { 
      type: String, 
      required: [true, "Account number is required"], 
      unique: true,
      immutable: true,
      match: [/^[A-Z0-9]+$/, "Account number must be alphanumeric only"]
    },

    schemeType: { 
      type: String, 
      required: [true, "Scheme type is required"], 
      immutable: true,
      enum: ["RD", "FD", "NSC", "KVP", "PPF", "DailyDeposit"]
    },

    // Runtime balance (from deposits)
    balance: { 
      type: Number, 
      default: 0, 
      min: [0, "Balance cannot be negative"] 
    },

    // Relationship
    userId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: [true, "User is required"] 
    },
    assignedAgent: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: [true, "Assigned agent is required"] 
    },

    // Duration
    durationMonths: { 
      type: Number, 
      required: [true, "Duration is required"], 
      min: [1, "Duration must be at least 1 month"] 
    },
    maturityDate: { 
      type: Date, 
      required: [true, "Maturity date is required"] 
    },

    // Payment Mode
    paymentMode: {
      type: String,
      enum: {
        values: ["Yearly", "Monthly", "Daily"],
        message: "Payment mode must be Yearly, Monthly or Daily"
      },
      required: [true, "Payment mode is required"]
    },
    yearlyAmount: { 
      type: Number, 
      min: [1, "Yearly amount must be greater than 0"] 
    },
    installmentAmount: { 
      type: Number, 
      min: [1, "Installment amount must be greater than 0"] 
    },
    dailyDepositAmount: { 
      type: Number, 
      min: [1, "Daily deposit must be greater than 0"] 
    },
    monthlyTarget: { 
      type: Number, 
      min: [1, "Monthly target must be greater than 0"] 
    },
    isFullyPaid: { type: Boolean, default: false },

    // Auto-calculated total target
    totalPayableAmount: { 
      type: Number, 
      required: [true, "Total payable amount is required"], 
      min: [1, "Total payable amount must be greater than 0"] 
    },

    // KYC & Extra details
    aadharCardNumber: { 
      type: String, 
      immutable: true,
      validate: {
        validator: function (v) {
          return !v || /^[0-9]{12}$/.test(v); // only if provided
        },
        message: "Aadhar card number must be exactly 12 digits"
      }
    },
    panNumber: { 
      type: String, 
      uppercase: true,
      immutable: true,
      validate: {
        validator: function (v) {
          return !v || /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(v);
        },
        message: "Invalid PAN number format"
      }
    },
    clientImage: { 
      type: String, 
    },
    nomineeName: { 
      type: String, 
      trim: true, 
      maxlength: [100, "Nominee name cannot exceed 100 characters"] 
    },
    nomineeRelation: { 
      type: String, 
      trim: true, 
      maxlength: [50, "Nominee relation cannot exceed 50 characters"] 
    },
    remarks: { 
      type: String, 
      trim: true, 
      maxlength: [500, "Remarks cannot exceed 500 characters"] 
    },
    lastPaymentDate: { type: Date },
    clientSignature: { 
      type: String, 
      // validate: {
      //   validator: function (v) {
      //     return !v || /\.(jpg|jpeg|png)$/i.test(v);
      //   },
      //   message: "Client signature must be a JPG or PNG file"
      // }
    },

    // Status
    status: {
      type: String,
      enum: {
        values: ["Active", "OnTrack", "Pending", "Defaulter", "Matured", "Closed"],
        message: "Invalid status"
      },
      default: "Active"
    }
  },
  { timestamps: true }
);

export default mongoose.model("Account", accountSchema);
