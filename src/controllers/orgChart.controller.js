import mongoose from "mongoose";
import Company from "../models/Company.js";
import User from "../models/User.js";
import { buildCompanyHierarchy, buildUserSubtree } from "../utils/hierarchyBuilder.js";
import { createError } from "../utils/createError.js";

// Simple in-memory cache (can be swapped for Redis)
const cache = new Map(); // key -> { data, expiresAt }
const DEFAULT_TTL_MS = 60 * 1000; // 1 minute

function setCache(key, data, ttlMs = DEFAULT_TTL_MS) {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}
function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function parseFilters(query) {
  const filters = {};
  if (query.role) filters.role = query.role;
  if (query.status) filters.status = query.status;
  return filters;
}

export const getCompanyOrgChart = async (req, res, next) => {
  try {
    const { companyId } = req.params;

    if (!mongoose.isValidObjectId(companyId)) {
      res.status(400);
      throw createError(400, "Invalid companyId");
    }

    const cacheKey = `orgchart:company:${companyId}:${JSON.stringify(req.query)}`;
    const cached = getCache(cacheKey);
    if (cached) return res.status(200).json(cached);

    const company = await Company.findById(companyId);
    if (!company) {
      res.status(404);
      throw createError(404, "Company not found");
    }

    const baseFilter = { companyId, requestStatus: "Approved", isBlocked: false };
    const extra = parseFilters(req.query);

    const users = await User.find({ ...baseFilter, ...extra })
      .select("_id name email role assignedTo companyId");

    const result = buildCompanyHierarchy(company, users, { includeEmail: true });

    setCache(cacheKey, result);
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const getUserOrgChart = async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!mongoose.isValidObjectId(userId)) {
      res.status(400);
      throw createError(400, "Invalid userId");
    }

    const user = await User.findById(userId)
      .select("_id name email role companyId assignedTo")
      .lean();
    if (!user) {
      res.status(404);
      throw createError(404, "User not found");
    }

    const company = await Company.findById(user.companyId)
      .select("companyName")
      .lean();
    if (!company) {
      res.status(404);
      throw createError(404, "Company not found");
    }

    const baseFilter = { companyId: user.companyId, requestStatus: "Approved", isBlocked: false };
    const extra = parseFilters(req.query);

    const users = await User.find({ ...baseFilter, ...extra })
      .select("_id name email role assignedTo companyId")
      .lean();

    const idStr = (x) => (x && x.toString ? x.toString() : String(x));
    const shape = (u, includeEmail = false) => {
      const o = { _id: u._id, name: u.name, role: u.role };
      if (includeEmail && u.email) o.email = u.email;
      return o;
    };

    const admins = users.filter((u) => u.role === "Admin");
    const managers = users.filter((u) => u.role === "Manager");
    const agents = users.filter((u) => u.role === "Agent");
    const clients = users.filter((u) => u.role === "User");

    const buildAgents = (managerId, includeEmails) =>
      agents
        .filter((a) => idStr(a.assignedTo) === idStr(managerId))
        .map((agent) => {
          const agentNode = shape(agent, includeEmails);
          const agentClients = clients
            .filter((c) => idStr(c.assignedTo) === idStr(agent._id))
            .map((c) => shape(c, includeEmails));
          agentNode.clients = agentClients;
          return agentNode;
        });

    const buildManagers = (includeEmails) =>
      managers.map((mgr) => ({
        ...shape(mgr, includeEmails),
        agents: buildAgents(mgr._id, includeEmails),
      }));

    if (user.role === "Admin") {
      return res.status(200).json({
        company: company.companyName,
        hierarchy: {
          admins: admins.map((a) => shape(a, true)),
          structure: { managers: buildManagers(true) },
        },
      });
    }

    if (user.role === "Manager") {
      const mgr = managers.find((m) => idStr(m._id) === idStr(user._id));
      if (!mgr) return res.status(200).json({ company: company.companyName, hierarchy: null });
      return res.status(200).json({
        company: company.companyName,
        hierarchy: {
          ...shape(mgr, false),
          agents: buildAgents(mgr._id, false),
        },
      });
    }

    if (user.role === "Agent") {
      const agent = agents.find((a) => idStr(a._id) === idStr(user._id));
      if (!agent) return res.status(200).json({ company: company.companyName, hierarchy: null });
      const agentClients = clients
        .filter((c) => idStr(c.assignedTo) === idStr(agent._id))
        .map((c) => shape(c, false));
      return res.status(200).json({
        company: company.companyName,
        hierarchy: { ...shape(agent, false), clients: agentClients },
      });
    }

    // User (Client)
    return res.status(200).json({
      company: company.companyName,
      hierarchy: {
        ...shape(user, true),
      },
    });
  } catch (err) {
    next(err);
  }
};

export const assignUser = async (req, res, next) => {
  try {
    const { userId, assignedTo } = req.body;

    if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(assignedTo)) {
      res.status(400);
      throw createError(400, "Invalid ObjectId in body");
    }

    const user = await User.findById(userId);
    const parent = await User.findById(assignedTo);

    if (!user || !parent) {
      res.status(404);
      throw createError(404, "User or assignedTo not found");
    }

    if (String(user.companyId) !== String(parent.companyId)) {
      res.status(400);
      throw createError(400, "Both users must belong to the same company");
    }

    // Role validations: Agent -> Manager, User -> Agent
    if (user.role === "Agent" && parent.role !== "Manager") {
      res.status(400);
      throw createError(400, "Agent must be assigned to a Manager");
    }
    if (user.role === "User" && parent.role !== "Agent") {
      res.status(400);
      throw createError(400, "User must be assigned to an Agent");
    }
    if (user.role === "Manager" || user.role === "Admin") {
      res.status(400);
      throw createError(400, "Cannot assign Admin or Manager under another user");
    }

    user.assignedTo = assignedTo;
    await user.save();

    // Invalidate cache for this company
    cache.forEach((_, key) => {
      if (key.startsWith(`orgchart:company:${user.companyId}`)) cache.delete(key);
    });

    return res.status(200).json({ message: `${user.role} assigned successfully` });
  } catch (err) {
    next(err);
  }
};

export const createUserUnderHierarchy = async (req, res, next) => {
  try {
    const { companyId, name, email, password, role, assignedTo } = req.body;

    if (!mongoose.isValidObjectId(companyId)) {
      res.status(400);
      throw createError(400, "Invalid companyId");
    }

    const company = await Company.findById(companyId);
    if (!company) {
      res.status(404);
      throw createError(404, "Company not found");
    }

    // Parent validations
    if (role === "Manager") {
      // Manager under Admin: assignedTo optional (can be null), but if provided must be Admin
      if (assignedTo) {
        const admin = await User.findById(assignedTo);
        if (!admin || admin.role !== "Admin" || String(admin.companyId) !== String(companyId)) {
          res.status(400);
          throw createError(400, "Manager must be assigned to a valid Admin of the same company");
        }
      }
    } else if (role === "Agent") {
      if (!assignedTo) {
        res.status(400);
        throw createError(400, "Agent must be assigned to a Manager");
      }
      const manager = await User.findById(assignedTo);
      if (!manager || manager.role !== "Manager" || String(manager.companyId) !== String(companyId)) {
        res.status(400);
        throw createError(400, "Agent must be assigned to a valid Manager");
      }
    } else if (role === "User") {
      if (!assignedTo) {
        res.status(400);
        throw createError(400, "User must be assigned to an Agent");
      }
      const agent = await User.findById(assignedTo);
      if (!agent || agent.role !== "Agent" || String(agent.companyId) !== String(companyId)) {
        res.status(400);
        throw createError(400, "User must be assigned to a valid Agent");
      }
    } else if (role === "Admin") {
      res.status(400);
      throw createError(400, "Admin creation not allowed via this endpoint");
    }

    // Auto-approve; password optional
    const payload = {
      companyId,
      name,
      email,
      role,
      assignedTo: assignedTo || null,
      requestStatus: "Approved",
      requestedBy: req.user ? req.user.name : "System",
    };

    if (password) {
      // import bcrypt lazily to avoid circular deps on some setups
      const { default: bcrypt } = await import("bcryptjs");
      payload.password = await bcrypt.hash(password, 10);
    }

    const user = new User(payload);
    await user.save();

    // Invalidate cache for this company
    cache.forEach((_, key) => {
      if (key.startsWith(`orgchart:company:${companyId}`)) cache.delete(key);
    });

    return res.status(201).json({ message: "User created successfully", user: { _id: user._id, name: user.name, email: user.email, role: user.role, assignedTo: user.assignedTo } });
  } catch (err) {
    next(err);
  }
};

export const updateUserHierarchy = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { role, status, assignedTo } = req.body;

    if (!mongoose.isValidObjectId(userId)) {
      res.status(400);
      throw createError(400, "Invalid userId");
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(404);
      throw createError(404, "User not found");
    }

    // Apply validations if role/assignedTo present
    if (assignedTo) {
      if (!mongoose.isValidObjectId(assignedTo)) {
        res.status(400);
        throw createError(400, "Invalid assignedTo");
      }
      const parent = await User.findById(assignedTo);
      if (!parent || String(parent.companyId) !== String(user.companyId)) {
        res.status(400);
        throw createError(400, "assignedTo must be a valid user of same company");
      }

      if (user.role === "Agent" && parent.role !== "Manager") {
        res.status(400);
        throw createError(400, "Agent must be assigned to a Manager");
      }
      if (user.role === "User" && parent.role !== "Agent") {
        res.status(400);
        throw createError(400, "User must be assigned to an Agent");
      }
      if (user.role === "Manager" || user.role === "Admin") {
        res.status(400);
        throw createError(400, "Cannot assign Admin or Manager under another user");
      }

      user.assignedTo = assignedTo;
    }

    if (role) user.role = role; // optional: add stricter transitions
    if (status) user.status = status;

    await user.save();

    cache.forEach((_, key) => {
      if (key.startsWith(`orgchart:company:${user.companyId}`)) cache.delete(key);
    });

    return res.status(200).json({ message: "User hierarchy updated", user: { _id: user._id, name: user.name, email: user.email, role: user.role, assignedTo: user.assignedTo, status: user.status } });
  } catch (err) {
    next(err);
  }
};

export const removeUserFromHierarchy = async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!mongoose.isValidObjectId(userId)) {
      res.status(400);
      throw createError(400, "Invalid userId");
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(404);
      throw createError(404, "User not found");
    }

    // Soft delete: mark status to Inactive and block
    user.status = "Inactive";
    user.isBlocked = true;
    await user.save();

    cache.forEach((_, key) => {
      if (key.startsWith(`orgchart:company:${user.companyId}`)) cache.delete(key);
    });

    return res.status(200).json({ message: "User removed (soft delete)" });
  } catch (err) {
    next(err);
  }
};
