import jwt from "jsonwebtoken";
import { SuperAdmin } from "../models/SuperAdmin.js";

// ✅ Generic auth middleware
export const protectSuperAdmin = async (req, res, next) => {
    let token;

    // Get token from header
    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith("Bearer")
    ) {
        try {
            token = req.headers.authorization.split(" ")[1];

            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Attach user to request
            req.superAdmin = await SuperAdmin.findById(decoded.id).select("-password");

            if (!req.superAdmin) {
                return res.status(401).json({ message: "Not authorized, SuperAdmin not found" });
            }

            // Ensure role is superadmin
            if (req.superAdmin.role !== "superadmin") {
                return res.status(403).json({ message: "Access denied: SuperAdmin only" });
            }

            next();
        } catch (error) {
            console.error(error);
            return res.status(401).json({ message: "Not authorized, invalid token" });
        }
    }

    if (!token) {
        return res.status(401).json({ message: "Not authorized, no token" });
    }
};
