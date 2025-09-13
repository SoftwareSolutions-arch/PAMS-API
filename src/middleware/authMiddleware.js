import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const protect = async (req, res, next) => {
    try {
        const auth = req.headers.authorization;
        if (!auth || !auth.startsWith("Bearer ")) {
            return res.status(401).json({ error: "No token" });
        }

        const token = auth.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        req.user = await User.findById(decoded.id).select("-password");
        if (!req.user) {
            return res.status(401).json({ error: "User not found" });
        }

        // 🔹 Blocked user check
        if (req.user.isBlocked) {
            return res.status(403).json({ error: "Your account is blocked. Contact Admin." });
        }

        next();
    } catch (err) {
        res.status(401).json({ error: "Not authorized" });
    }
};

export const allowRoles = (...roles) => (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: "Not authorized" });
    }

    if (!roles.includes(req.user.role)) {
        return res.status(403).json({ error: "Forbidden" });
    }

    next();
};
