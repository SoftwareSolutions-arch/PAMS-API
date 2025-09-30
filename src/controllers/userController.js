import User from "../models/User.js";
import Account from "../models/Account.js";
import Deposit from "../models/Deposit.js";
import bcrypt from "bcryptjs";
import { getScope } from "../utils/scopeHelper.js";
import { sendEmail } from "../services/emailService.js";

// GET all users with role-based filtering
export const getUsers = async (req, res, next) => {
  try {
    const scope = await getScope(req.user);

    let filter = { requestStatus: "Approved" , isBlocked: false ,companyId: req.user.companyId }; 

    if (!scope.isAll) {
      if (req.user.role === "Manager") {
        filter.$or = [
          { _id: { $in: scope.agents } },
          { _id: { $in: scope.clients } }
        ];
      } else if (req.user.role === "Agent") {
        filter._id = { $in: scope.clients };
      } else if (req.user.role === "User") {
        filter._id = req.user.id;
      }
    }

    // optional role filter
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
    const { name, email, role, assignedTo } = req.body;

    // --- Role restrictions ---
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
    if (req.user.role === "Agent" || req.user.role === "User") {
      res.status(403);
      throw new Error("You are not allowed to create users");
    }

    // ✅ Generate password
    const prefix = name.slice(0, 2).toUpperCase();
    const randomDigits = Math.floor(100000 + Math.random() * 900000);
    const generatedPassword = `${prefix}${randomDigits}`;

    // ✅ Hash password
    const hashedPassword = await bcrypt.hash(generatedPassword, 10);

    // ✅ Mark as directly approved since Admin is creating
    const user = new User({
      name,
      email,
      password: hashedPassword,
      role,
      assignedTo: assignedTo || null,
      requestStatus: "Approved",   // 🔹 explicit flag
      requestedBy: req.user.name,  // 🔹 audit trail
      companyId: req.user.companyId // 🔹 company association
    });

    await user.save();

    // ✅ Send email using service
    sendEmail(
      email,
      "Your PAMS Account Credentials",
      `
        <h2>Welcome to PAMS, ${name}!</h2>
        <p>Your account has been created successfully by Admin.</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Password:</b> ${generatedPassword}</p>
        <p>Please login and change your password after first login.</p>
        <br/>
        <p>Regards,<br/>PAMS Team</p>
      `
    );

    res.status(201).json({
      message: "User created successfully and marked as Approved. Credentials sent via email.",
      user,
    });
  } catch (err) {
    next(err);
  }
};

// UPDATE a user with reassignment logic
export const updateUser = async (req, res, next) => {
  try {
    const { name, email, role, status, assignedTo ,isBlocked } = req.body;

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
        if (userToUpdate.assignedTo.toString() !== req.user.id.toString()) {
          res.status(403);
          throw new Error("You can only update your own Agents");
        }
      }

      if (userToUpdate.role === "User") {
        const agent = await User.findById(userToUpdate.assignedTo);
        if (!agent || agent.assignedTo.toString() !== req.user.id.toString()) {
          res.status(403);
          throw new Error("You can only update Users under your own Agents");
        }
      }
    }

    if (name) userToUpdate.name = name;
    if (email) userToUpdate.email = email;
    if (role) userToUpdate.role = role;
    if (status) userToUpdate.status = status;
    if (typeof isBlocked === "boolean") userToUpdate.isBlocked = isBlocked;
    if (assignedTo) userToUpdate.assignedTo = assignedTo;

    // If a User is reassigned to a different Agent, update their Accounts
    if (userToUpdate.role === "User" && assignedTo) {
      await Account.updateMany(
        { userId: userToUpdate.id },
        { $set: { "assignedAgent": assignedTo } }
      );
    }

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

    if (req.user.id.toString() === userToDelete._id.toString()) {
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

// Create Request (Agent/Manager creates request)
export const requestUser = async (req, res, next) => {
  try {
    const { name, email, role, assignedTo } = req.body;

    if (role === "Admin") {
      res.status(403);
      throw new Error("Cannot request Admin creation");
    }

    // request created by Manager/Agent
    const user = new User({
      name,
      email,
      role,
      assignedTo: assignedTo || null,
      requestStatus: "Pending",
      requestedBy: req.user.name
    });

    await user.save();
    res.status(201).json({ message: "User request submitted successfully", user });
  } catch (err) {
    next(err);
  }
};

// Get Pending Requests (for Admin panel)
export const getPendingRequests = async (req, res, next) => {
  try {
    if (req.user.role !== "Admin") {
      res.status(403);
      throw new Error("Only Admin can view requests");
    }

    const requests = await User.find({ requestStatus: "Pending" }).select("-password");
    res.json(requests);
  } catch (err) {
    next(err);
  }
};

// Approve/Reject Request
export const handleRequest = async (req, res, next) => {
  try {
    const { status } = req.body; // "Approved" or "Rejected"
    const user = await User.findById(req.params.id);

    if (!user) {
      res.status(404);
      throw new Error("Request not found");
    }
    if (user.requestStatus !== "Pending") {
      res.status(400);
      throw new Error("Request already processed");
    }

    if (status === "Approved") {
      // generate password
      const prefix = user.name.slice(0, 2).toUpperCase();
      const randomDigits = Math.floor(100000 + Math.random() * 900000);
      const generatedPassword = `${prefix}${randomDigits}`;
      user.password = await bcrypt.hash(generatedPassword, 10);
      user.requestStatus = "Approved";

      // send credentials
      sendEmail(
        user.email,
        "Your PAMS Account Approved",
        `
          <h2>Welcome, ${user.name}!</h2>
          <p>Your request has been approved.</p>
          <p><b>Email:</b> ${user.email}</p>
          <p><b>Password:</b> ${generatedPassword}</p>
        `
      );
    } else if (status === "Rejected") {
      user.requestStatus = "Rejected";
    }

    await user.save();
    res.json({ message: `User request ${status}`, user });
  } catch (err) {
    next(err);
  }
};

