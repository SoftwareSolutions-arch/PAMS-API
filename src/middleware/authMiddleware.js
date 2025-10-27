import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Company from "../models/Company.js";

export const protect = async (req, res, next) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = auth.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ✅ Load fresh user from DB (always latest status)
    const dbUser = await User.findById(decoded.id).select("-password sessionVersion");
    if (!dbUser) {
      return res.status(401).json({ error: "User not found" });
    }

    // 🔐 Enforce single active session using sessionVersion (sv) in token
    if (typeof decoded.sv !== "number" || decoded.sv !== dbUser.sessionVersion) {
      return res.status(401).json({ error: "Session expired. Please login again." });
    }

    // 🔹 Blocked user check
    if (dbUser.isBlocked) {
      return res.status(403).json({ error: "Your account is blocked. Contact Admin." });
    }

    // 🔹 Check if company is blocked
    const company = await Company.findById(dbUser.companyId);
    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }

    if (company.status === "blocked") {
      return res.status(403).json({
        error: "Your company has been blocked by Super Admin. Please contact support.",
      });
    }

    // ✅ Merge DB data with token payload
    req.user = {
      id: dbUser._id,
      name: dbUser.name,
      email: dbUser.email,
      role: decoded.role || dbUser.role,
      companyId: decoded.companyId || dbUser.companyId,
      isBlocked: dbUser.isBlocked,
    };

    next();
  } catch (err) {
    console.error("Auth Middleware Error:", err.message);
    res.status(401).json({ error: "Not authorized" });
  }
};

// ✅ Role-based Access Control
export const allowRoles = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authorized" });
  }

  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  next();
};
