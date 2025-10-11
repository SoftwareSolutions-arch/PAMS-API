import mongoose from "mongoose";

const UserAddressModel = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        companyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Company",
            required: true,
        },
        agentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        name: { type: String, trim: true },
        street: { type: String, trim: true },
        city: { type: String, trim: true },
        state: { type: String, trim: true },
        pinCode: { type: String, trim: true },
        country: { type: String, trim: true },
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
        landmark: { type: String, trim: true },
        phone: { type: String, trim: true },
        isPrimary: { type: Boolean, default: false },
    },
    { timestamps: true }
);

export default mongoose.model("UserAddress", UserAddressModel);

