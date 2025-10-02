import { SuperAdmin } from "../models/SuperAdmin.js";

// Get all SuperAdmins
export const getAllSuperAdminsService = async () => {
    return await SuperAdmin.find().select("-password"); // password hide kare
};

// Create new SuperAdmin
export const createSuperAdminService = async (data) => {
    const superAdmin = new SuperAdmin(data);
    return await superAdmin.save();
};

// Get SuperAdmin by ID
export const getSuperAdminByIdService = async (id) => {
    return await SuperAdmin.findById(id).select("-password");
};

// Update SuperAdmin by ID
export const updateSuperAdminService = async (id, data) => {
    // Agar password update ho raha hai toh hashing model middleware handle karega
    return await SuperAdmin.findByIdAndUpdate(id, data, { new: true, runValidators: true }).select("-password");
};

// Delete SuperAdmin by ID
export const deleteSuperAdminService = async (id) => {
    const result = await SuperAdmin.findByIdAndDelete(id);
    return result ? true : false;
};
