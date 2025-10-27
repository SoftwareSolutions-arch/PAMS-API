import * as companyService from "../services/companyService.js";
import { sendEmail } from "../services/emailService.js";
import crypto from "crypto";
import Company from "../models/Company.js";
import User from "../models/User.js";
// jwt is not used directly here; tokenService handles signing
import { rotateUserSessionAndSign } from "../services/tokenService.js";
import { generateEmailTemplate } from "../utils/emailTemplate.js";

// Token generator (reuse from login)
const genToken = async (user) => {
  const { token } = await rotateUserSessionAndSign(user._id || user.id);
  return token;
};

// ✅ Add Company
export const addCompany = async (req, res) => {
  try {
    const createdBy = req.user ? req.user.id : null;

    // ✅ Check if company already exists by name or email
    const existingCompany = await companyService.getCompanyByNameOrEmail(
      req.body.companyName,
      req.body.contactInfo.email
    );

    if (existingCompany) {
      return res
        .status(400)
        .json({ success: false, message: "Company with this name or email already exists" });
    }

    const { company } = await companyService.createCompany(req.body, { createdBy });

    // ✅ Acknowledgment Email
    if (company.contactInfo?.email) {
      await sendEmail(
        company.contactInfo.email,
        "PAMS – Company Application Received",
        generateEmailTemplate({
          title: "Company Application Received",
          greeting: "Hello,",
          message: `
      We’ve successfully received your application for <strong>${company.companyName}</strong>.
      Our review team will carefully verify your details. Once your application is approved,
      you’ll receive a registration link to complete the onboarding process.
    `,
          footerNote: `
      You can expect a response within <strong>2–3 business days</strong>.<br/>
      Thank you for choosing PAMS.
    `,
        })
      )
    }

    res.status(201).json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// ✅ Edit Company
export const updateCompanyById = async (req, res) => {
  try {
    const company = await companyService.updateCompany(req.params.id, req.body);
    if (!company) return res.status(404).json({ success: false, message: "Company not found" });
    res.json({ success: true, data: company });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// ✅ Delete Company
export const deleteCompany = async (req, res) => {
  try {
    const company = await companyService.softDeleteCompany(req.params.id);
    if (!company) return res.status(404).json({ success: false, message: "Company not found" });
    res.json({ success: true, message: "Company deleted successfully", data: company });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ View Company
export const getCompany = async (req, res) => {
  try {
    const company = await companyService.getCompanyById(req.params.id);
    if (!company) return res.status(404).json({ success: false, message: "Company not found" });
    res.json({ success: true, data: company });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ List Companies
export const listCompanies = async (req, res) => {
  try {
    const { status, search } = req.query;
    const filter = status ? { status } : {};
    const companies = await companyService.getCompanies(filter, search);
    res.json({ success: true, data: companies });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Dashboard Summary
export const getCompanySummary = async (req, res) => {
  try {
    const summary = await companyService.getCompanySummary();
    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Approve Company
export const approveCompany = async (req, res) => {
  try {
    const { company, initToken } = await companyService.approveCompanyService(req.params.id);

    if (!company) {
      return res.status(404).json({ success: false, message: "Company not found" });
    }

    // ✅ Send onboarding email
    if (company.contactInfo?.email) {
      const appUrl = process.env.APP_URL;
      const onboardingUrl = `${appUrl}/company/init?companyId=${company._id}&token=${initToken}`;

      await sendEmail(
        company.contactInfo.email,
        "PAMS – Complete Your Company Registration",
        generateEmailTemplate({
          title: "Company Registration Approved",
          greeting: "Hello,",
          message: `
      Great news! Your company <strong>${company.companyName}</strong> has been approved.<br/><br/>
      Please complete your onboarding process using the secure one-time link below.
    `,
          actionText: "Complete Company Registration",
          actionUrl: onboardingUrl,
          footerNote: `
      This link is valid until <strong>${new Date(company.initTokenExpires).toLocaleString()}</strong>.<br/>
      Thank you for partnering with PAMS.
    `,
        })
      );
    }

    res.json({ success: true, data: company });
  } catch (error) {
    console.error("Approve Company Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Reject Company
export const rejectCompany = async (req, res) => {
  try {
    const company = await companyService.rejectCompanyService(req.params.id);
    console.log("Rejected Company:", company);

    if (!company) {
      return res.status(404).json({ success: false, message: "Company not found" });
    }

    // ✅ Optional: Send rejection email
    if (company.contactInfo?.email) {
      await sendEmail(
        company.contactInfo.email,
        "PAMS – Company Registration Update",
        generateEmailTemplate({
          title: "Company Registration Update",
          greeting: "Hello,",
          message: `
      We regret to inform you that your company <strong>${company.companyName}</strong> has been 
      <span style="color: red; font-weight: 600;">rejected</span> after our review process.
      <br/><br/>
      If you believe this is a mistake or would like to appeal, please reach out to our support team for further assistance.
    `,
          footerNote: `
      Thank you for your understanding.<br/>
      — PAMS Onboarding Team
    `,
        })
      );

    }

    res.json({ success: true, data: company });
  } catch (error) {
    console.error("Reject Company Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Send Invite (24 hours expiry)
export const sendInvite = async (req, res) => {
  try {
    const { email, companyId } = req.body;

    if (!email || !companyId) {
      return res
        .status(400)
        .json({ success: false, message: "Email and Company ID are required" });
    }

    // Pehle company fetch karo
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ success: false, message: "Company not found" });
    }

    // Token create karo
    const { initToken } = await companyService.attachInitToken(companyId, { tokenExpiryDays: 1 });

    const appUrl = process.env.APP_URL;
    const inviteUrl = `${appUrl}/company/init?companyId=${company._id}&token=${initToken}`;

    await sendEmail(
      email,
      `PAMS – Complete Your Company Registration for ${company.companyName}`,
      generateEmailTemplate({
        title: "Complete Your Company Registration",
        greeting: "Hello,",
        message: `
      Please use the secure link below to complete onboarding for <strong>${company.companyName}</strong>.<br/><br/>
      This is a one-time link valid for <strong>24 hours</strong>.
    `,
        actionText: "Complete Registration",
        actionUrl: inviteUrl,
        footerNote: `
      If the button above doesn’t work, copy and paste this link into your browser:<br/>
      <a href="${inviteUrl}" style="color: #0056b3;">${inviteUrl}</a>
    `,
      })
    );


    res.json({
      success: true,
      message: `Invite sent to ${email} for ${company.companyName}`,
      inviteUrl,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Verify Init Token
export const verifyInitToken = async (req, res) => {
  try {
    const { companyId, token } = req.query;
    if (!companyId || !token) return res.status(400).json({ success: false, message: "companyId and token required" });

    const company = await Company.findById(companyId);
    if (!company) return res.status(404).json({ success: false, message: "Company not found" });

    if (company.hasAdmin) {
      return res.status(400).json({ success: false, message: "Company already has an Admin" });
    }

    if (!company.initTokenHash || !company.initTokenExpires || company.initTokenExpires < new Date()) {
      return res.status(403).json({ success: false, message: "Token missing or expired" });
    }

    const providedHashBuf = crypto.createHash("sha256").update(token).digest();
    const storedHashBuf = Buffer.from(company.initTokenHash, "hex");
    if (providedHashBuf.length !== storedHashBuf.length || !crypto.timingSafeEqual(providedHashBuf, storedHashBuf)) {
      return res.status(403).json({ success: false, message: "Invalid token" });
    }

    res.json({ success: true, message: "Token valid", company: { id: company._id, name: company.companyName, contactInfo: company.contactInfo, expires: company.initTokenExpires } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

//create first admin and verify with token
export const createFirstAdmin = async (req, res) => {
  try {
    const { companyId, token, name, email, password } = req.body;

    if (!companyId || !token || !name || !email || !password) {
      return res.status(400).json({ success: false, message: "All fields required" });
    }

    // ✅ Create admin using service
    const admin = await companyService.createFirstAdminService({
      companyId,
      token,
      name,
      email,
      password,
    });

    // ✅ Generate token after admin created
    const jwtToken = await genToken(admin);

    // ✅ Return same structure as login
    res.status(201).json({
      success: true,
      message: "Admin created and logged in successfully",
      token: jwtToken,
      user: {
        id: admin._id,
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        companyId: admin.companyId,
        createdAt: admin.createdAt,
      },
    });
  } catch (error) {
    console.error("createFirstAdmin error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
};


export const getMonthlyStats = async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();

    const stats = await Company.aggregate([
      // ✅ Filter only companies created this year
      {
        $match: {
          createdAt: {
            $gte: new Date(`${currentYear}-01-01`),
            $lte: new Date(`${currentYear}-12-31`),
          },
        },
      },
      // ✅ Group by month & status
      {
        $group: {
          _id: {
            month: { $month: "$createdAt" },
            status: "$status",
          },
          count: { $sum: 1 },
        },
      },
      // ✅ Summarize registered (active + inprogress + suspended) vs blocked
      {
        $group: {
          _id: "$_id.month",
          registered: {
            $sum: {
              $cond: [
                { $in: ["$_id.status", ["active", "inprogress", "suspended"]] },
                "$count",
                0,
              ],
            },
          },
          blocked: {
            $sum: {
              $cond: [{ $eq: ["$_id.status", "blocked"] }, "$count", 0],
            },
          },
        },
      },
      // ✅ Sort chronologically (Jan → Dec)
      { $sort: { _id: 1 } },
      // ✅ Map month numbers to short names
      {
        $project: {
          _id: 0,
          month: {
            $arrayElemAt: [
              [
                "",
                "Jan",
                "Feb",
                "Mar",
                "Apr",
                "May",
                "Jun",
                "Jul",
                "Aug",
                "Sep",
                "Oct",
                "Nov",
                "Dec",
              ],
              "$_id",
            ],
          },
          registered: 1,
          blocked: 1,
        },
      },
    ]);

    // ✅ Fill missing months (0 registered/blocked)
    const allMonths = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    const filledStats = allMonths.map((m) => {
      const found = stats.find((s) => s.month === m);
      return {
        month: m,
        registered: found?.registered || 0,
        blocked: found?.blocked || 0,
      };
    });

    res.status(200).json(filledStats);
  } catch (error) {
    console.error("❌ Error fetching monthly stats:", error);
    res.status(500).json({ message: "Error fetching monthly stats" });
  }
};

// ✅ Block entire company (no one can login)
export const blockCompany = async (req, res) => {
  try {
    const companyId = req.params.id;

    // 1️⃣ Find the company
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ success: false, message: "Company not found" });
    }

    // 2️⃣ Check if already blocked
    if (company.status === "blocked") {
      return res.status(400).json({ success: false, message: "Company is already blocked" });
    }

    // 3️⃣ Block the company
    company.status = "blocked";
    await company.save();

    // 4️⃣ Block all users of that company
    const users = await User.updateMany(
      { companyId },
      { $set: { isBlocked: true, status: "Inactive", fcmToken: null } }
    );

    // 🔐 Invalidate sessions for all users in the company
    // Note: bulk increment in one call
    await User.updateMany({ companyId }, { $inc: { sessionVersion: 1 } });

    // 5️⃣ Optional: if you use JWTs with refresh tokens, clear them too
    // Example: await Token.deleteMany({ companyId });

    res.status(200).json({
      success: true,
      message: `Company '${company.companyName}' and all its users have been blocked.`,
      company: {
        id: company._id,
        name: company.companyName,
        status: company.status,
      },
      affectedUsers: users.modifiedCount,
    });
  } catch (error) {
    console.error("❌ Block Company Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Unblock entire company (and all its users)
export const unblockCompany = async (req, res) => {
  try {
    const companyId = req.params.id;

    // 1️⃣ Find the company
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ success: false, message: "Company not found" });
    }

    // 2️⃣ Check if it's actually blocked
    if (company.status !== "blocked") {
      return res.status(400).json({ success: false, message: "Company is not blocked" });
    }

    // 3️⃣ Unblock the company
    company.status = "active";
    await company.save();

    // 4️⃣ Unblock all users of that company
    const users = await User.updateMany(
      { companyId },
      { $set: { isBlocked: false, status: "Active" } }
    );

    res.status(200).json({
      success: true,
      message: `Company '${company.companyName}' and all its users have been unblocked.`,
      company: {
        id: company._id,
        name: company.companyName,
        status: company.status,
      },
      affectedUsers: users.modifiedCount,
    });
  } catch (error) {
    console.error("❌ Unblock Company Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};


