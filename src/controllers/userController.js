import User from "../models/User.js";
import Account from "../models/Account.js";
import Deposit from "../models/Deposit.js";
import bcrypt from "bcryptjs";
import { getScope } from "../utils/scopeHelper.js";

// GET all users with role-based filtering
export const getUsers = async (req, res, next) => {
  try {
    const scope = await getScope(req.user);

    let filter = {};
    if (!scope.isAll) {
      if (req.user.role === "Manager") {
        filter = {
          $or: [
            { _id: { $in: scope.agents } },
            { _id: { $in: scope.clients } }
          ]
        };
      } else if (req.user.role === "Agent") {
        filter = { _id: { $in: scope.clients } };
      } else if (req.user.role === "User") {
        filter = { _id: req.user._id };
      }
    }

    // optional role filter (e.g., /api/users?role=Agent)
    if (req.query.role) {
      filter.role = req.query.role;
    }

    const users = await User.find(filter).select("-password");
    res.json(users);
  } catch (err) {
    next(err);
  }
};

// CREATE a new user with role-based validation
export const createUser = async (req, res, next) => {
  try {
    const { name, email, password, role, assignedTo } = req.body;

    if (role === "Admin" && req.user.role !== "Admin") {
      res.status(403);
      throw new Error("Only Admin can create another Admin");
    }

    if (role === "Manager" && req.user.role !== "Admin") {
      res.status(403);
      throw new Error("Only Admin can create a Manager");
    }

    if (role === "Agent" && !assignedTo) {
      res.status(400);
      throw new Error("Agent must be assigned to a Manager");
    }

    if (role === "User" && !assignedTo) {
      res.status(400);
      throw new Error("User must be assigned to an Agent");
    }

    if (req.user.role === "Admin") {
      if (role === "Agent") {
        const manager = await User.findById(assignedTo);
        if (!manager || manager.role !== "Manager") {
          res.status(400);
          throw new Error("Agent must be assigned to a valid Manager");
        }
      }

      if (role === "User") {
        const agent = await User.findById(assignedTo);
        if (!agent || agent.role !== "Agent") {
          res.status(400);
          throw new Error("User must be assigned to a valid Agent");
        }
      }
    }

    if (req.user.role === "Manager") {
      if (role === "Agent" && assignedTo.toString() !== req.user._id.toString()) {
        res.status(403);
        throw new Error("You can only assign Agents under yourself");
      }

      if (role === "User") {
        const agent = await User.findById(assignedTo);
        if (!agent || agent.role !== "Agent" || agent.assignedTo.toString() !== req.user._id.toString()) {
          res.status(403);
          throw new Error("You can only assign Users under your own Agents");
        }
      }
    }

    if (req.user.role === "Agent" || req.user.role === "User") {
      res.status(403);
      throw new Error("You are not allowed to create users");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      name,
      email,
      password: hashedPassword,
      role,
      assignedTo: assignedTo || null
    });

    await user.save();
    res.status(201).json({ message: "User created successfully", user });
  } catch (err) {
    next(err);
  }
};

// UPDATE a user with reassignment logic
export const updateUser = async (req, res, next) => {
  try {
    const { name, email, role, assignedTo } = req.body;

    const userToUpdate = await User.findById(req.params.id);
    if (!userToUpdate) {
      res.status(404);
      throw new Error("User not found");
    }

    if (req.user.role === "Agent" || req.user.role === "User") {
      res.status(403);
      throw new Error("You are not allowed to update users");
    }

    if (role === "Admin" && req.user.role !== "Admin") {
      res.status(403);
      throw new Error("Only Admin can update an Admin");
    }

    if (role === "Manager" && req.user.role !== "Admin") {
      res.status(403);
      throw new Error("Only Admin can update a Manager");
    }

    if (req.user.role === "Admin") {
      if (role === "Agent" && assignedTo) {
        const manager = await User.findById(assignedTo);
        if (!manager || manager.role !== "Manager") {
          res.status(400);
          throw new Error("Agent must be assigned to a valid Manager");
        }
      }

      if (role === "User" && assignedTo) {
        const agent = await User.findById(assignedTo);
        if (!agent || agent.role !== "Agent") {
          res.status(400);
          throw new Error("User must be assigned to a valid Agent");
        }
      }
    }

    if (req.user.role === "Manager") {
      if (userToUpdate.role === "Admin" || userToUpdate.role === "Manager") {
        res.status(403);
        throw new Error("You cannot update Admins or Managers");
      }

      if (userToUpdate.role === "Agent") {
        if (userToUpdate.assignedTo.toString() !== req.user._id.toString()) {
          res.status(403);
          throw new Error("You can only update your own Agents");
        }
      }

      if (userToUpdate.role === "User") {
        const agent = await User.findById(userToUpdate.assignedTo);
        if (!agent || agent.assignedTo.toString() !== req.user._id.toString()) {
          res.status(403);
          throw new Error("You can only update Users under your own Agents");
        }
      }
    }

    if (name) userToUpdate.name = name;
    if (email) userToUpdate.email = email;
    if (role) userToUpdate.role = role;
    if (assignedTo) userToUpdate.assignedTo = assignedTo;

    await userToUpdate.save();
    res.json({ message: "User updated successfully", user: userToUpdate });
  } catch (err) {
    next(err);
  }
};

// DELETE user
export const deleteUser = async (req, res, next) => {
  try {
    const userToDelete = await User.findById(req.params.id);
    if (!userToDelete) {
      res.status(404);
      throw new Error("User not found");
    }

    if (req.user.role !== "Admin") {
      res.status(403);
      throw new Error("Only Admin can delete users");
    }

    if (req.user._id.toString() === userToDelete._id.toString()) {
      res.status(400);
      throw new Error("You cannot delete yourself");
    }

    await userToDelete.deleteOne();
    res.json({ message: "User deleted successfully" });
  } catch (err) {
    next(err);
  }
};

// GET accounts for a user 
export const getUserAccounts = async (req, res, next) => {
  try {
    const accounts = await Account.find({ userId: req.params.id }).populate("assignedAgent", "name email");
    res.json(accounts);
  } catch (err) {
    next(err);
  }
};

// GET deposits for a user
export const getUserDeposits = async (req, res, next) => {
  try {
    const deposits = await Deposit.find({ userId: req.params.id })
      .populate("accountId", "accountNumber schemeType")
      .populate("collectedBy", "name email");
    res.json(deposits);
  } catch (err) {
    next(err);
  }
};
