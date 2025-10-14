import crypto from "crypto";
import bcrypt from "bcryptjs";
import Company from "../models/Company.js";
import User from "../models/User.js";

/**
 * Create new company with one-time init token
 */
export const createCompany = async (data, options = {}) => {
  const { createdBy = null } = options;

  const companyPayload = {
    ...data,
    hasAdmin: false,
    createdBy
  };

  const company = await Company.create(companyPayload);

  return { company };
};

/**
 * Get companies with optional filter + search
 */
export const getCompanies = async (filter = {}, search = "") => {
  const query = { status: { $ne: "deleted" }, ...filter };
  if (search) {
    query.companyName = { $regex: search, $options: "i" };
  }
  return await Company.find(query).sort({ createdAt: -1 });
};

export const getCompanyByNameOrEmail = async (companyName, email) => {
  return await Company.findOne({
    $or: [
      { companyName: companyName },
      { "contactInfo.email": email }
    ]
  });
};

/**
 * Get company by ID
 */
export const getCompanyById = async (id) => {
  return await Company.findOne({ _id: id, status: { $ne: "deleted" } });
};

/**
 * Update company by ID
 */
export const updateCompany = async (id, updateData) => {
  return await Company.findByIdAndUpdate(id, updateData, { new: true });
};

/**
 * Soft delete company
 */
export const softDeleteCompany = async (id) => {
  return await Company.findByIdAndUpdate(id, { status: "deleted" }, { new: true });
};

/**
 * Get dashboard summary counts
 */
export const getCompanySummary = async () => {
  const summary = await Company.aggregate([
    { $match: { status: { $ne: "deleted" } } },
    { $group: { _id: "$status", count: { $sum: 1 } } }
  ]);

  return {
    total: summary.reduce((a, c) => a + c.count, 0),
    approved: summary.find(s => s._id === "active")?.count || 0,
    rejected: summary.find(s => s._id === "blocked")?.count || 0,
    pending: summary.find(s => s._id === "inprogress")?.count || 0
  };
};

/**
 * Approve a company → status active + generate new onboarding token
 */
export const approveCompanyService = async (id) => {
  const company = await Company.findById(id);
  if (!company) return null;

  // Generate fresh token
  const initToken = crypto.randomBytes(32).toString("hex");
  const initTokenHash = crypto.createHash("sha256").update(initToken).digest("hex");
  const initTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hrs validity

  // Update DB
  company.status = "active";
  company.initTokenHash = initTokenHash;
  company.initTokenExpires = initTokenExpires;
  await company.save();

  // Return company + raw token for email
  return { company, initToken };
};

/** Reject a company → status blocked
 */
export const rejectCompanyService = async (id) => {
  const company = await Company.findByIdAndUpdate(id, { status: "blocked" }, { new: true });
  return company;
};


/**
 * Create First Admin for Company
 */
export const createFirstAdminService = async ({ companyId, token, name, email, password }) => {
  const company = await Company.findById(companyId);
  if (!company) throw new Error("Company not found");

  if (company.hasAdmin) {
    throw new Error("Company already has an Admin");
  }

  // Verify token again
  const providedHash = crypto.createHash("sha256").update(token).digest("hex");
  if (providedHash !== company.initTokenHash || company.initTokenExpires < new Date()) {
    throw new Error("Invalid or expired token");
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create new Admin user
  const adminUser = await User.create({
    name,
    email,
    password: hashedPassword,
    role: "Admin",
    companyId: company._id,
    requestStatus: "Approved"
  });

  // Update company state
  company.hasAdmin = true;
  company.initTokenHash = null;
  company.initTokenExpires = null;
  await company.save();

  return adminUser;
};
