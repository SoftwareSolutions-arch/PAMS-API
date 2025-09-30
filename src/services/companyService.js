import Company from "../models/Company.js";

export const createCompany = async (data) => {
    return await Company.create(data);
};

export const getCompanies = async (filter = {}) => {
    return await Company.find({ ...filter, status: { $ne: "deleted" } });
};

export const getCompanyById = async (id) => {
    return await Company.findOne({ _id: id, status: { $ne: "deleted" } });
};

export const updateCompany = async (id, updateData) => {
    return await Company.findByIdAndUpdate(id, updateData, { new: true });
};

export const softDeleteCompany = async (id) => {
    return await Company.findByIdAndUpdate(
        id,
        { status: "deleted" },
        { new: true }
    );
};
