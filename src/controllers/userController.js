import mongoose from "mongoose"; 
import User from "../models/User.js";
import Account from "../models/Account.js";
import Deposit from "../models/Deposit.js";
import bcrypt from "bcryptjs";
import { getScope } from "../utils/scopeHelper.js";
import { sendEmail } from "../services/emailService.js";
import Company from "../models/Company.js";


// GET all users with role-based filtering
export const getUsers = async (req, res, next) => {
  try {
    const scope = await getScope(req.user);

    let filter = { 
      requestStatus: "Approved",
      isBlocked: false,
      companyId: req.user.companyId 
    }; 

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

    // Optional role filter
    if (req.query.role) {
      filter.role = req.query.role;
    }

    // Sort: newest first
    const users = await User.find(filter)
      .select("-password")
      .sort({ createdAt: -1 });

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
      email: email.toLowerCase(),
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
      companyId: req.user.companyId,
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

export const createInitialAdmin = async (req, res, next) => {
  try {
    const { companyId, token, name, email, password, assignedTo } = req.body;

    if (!companyId || !token) {
      return res.status(400).json({ success: false, message: "companyId and token required" });
    }
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: "name, email and password required" });
    }

    const company = await Company.findById(companyId);
    if (!company) return res.status(404).json({ success: false, message: "Company not found" });

    // disallow if already admin
    const existingAdmin = await User.findOne({ companyId, role: "Admin" });
    if (existingAdmin || company.hasAdmin) {
      return res.status(400).json({ success: false, message: "Company already has an Admin" });
    }

    // token validity check
    if (!company.initTokenHash || !company.initTokenExpires || company.initTokenExpires < new Date()) {
      return res.status(403).json({ success: false, message: "Token missing or expired" });
    }
    const providedHashBuf = crypto.createHash("sha256").update(token).digest();
    const storedHashBuf = Buffer.from(company.initTokenHash, "hex");
    if (providedHashBuf.length !== storedHashBuf.length || !crypto.timingSafeEqual(providedHashBuf, storedHashBuf)) {
      return res.status(403).json({ success: false, message: "Invalid token" });
    }

    // password strength check (basic example) — adjust rules to your needs
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters" });
    }

    // ensure email not used
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "Email already in use" });
    }

    // hash and save user
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      companyId,
      name,
      email,
      password: hashedPassword,
      role: "Admin",
      assignedTo: assignedTo || null,
      requestStatus: "Approved",
      requestedBy: "Company Init",
    });

    await user.save();

    // mark company and clear token
    company.hasAdmin = true;
    company.initTokenHash = null;
    company.initTokenExpires = null;
    await company.save();

    // send confirmation (no password)
    try {
      await sendEmail(
        email,
        "PAMS — Admin Account Created",
        `
          <p>Hello ${name},</p>
          <p>Your Admin account for <strong>${company.name}</strong> has been created successfully.</p>
          <p>You can now <a href="${process.env.APP_URL || '/'}">log in</a> using your email.</p>
          <p>If you did not create this account, contact support immediately.</p>
          <br/>
          <p>Regards,<br/>PAMS Team</p>
        `
      );
    } catch (mailErr) {
      console.error("Confirmation email failed:", mailErr);
    }

    const userObj = user.toObject();
    delete userObj.password;

    return res.status(201).json({ success: true, message: "Admin created", user: userObj });
  } catch (err) {
    next(err);
  }
};

export const reassignUser = async (req, res) => {
  console.log("🔥 Reassign request:", {
    params: req.params,
    body: req.body,
    url: req.originalUrl,
  });

  const useTransactions = process.env.USE_TRANSACTIONS === "true";
  const session = useTransactions ? await mongoose.startSession() : null;
  if (useTransactions) session.startTransaction();

  try {
    const userId = req.params.userId || req.params.id;
    const { assignedTo } = req.body;

    if (!userId) {
      if (useTransactions) await session.abortTransaction();
      return res.status(400).json({ message: "User ID missing in params" });
    }

    if (!assignedTo) {
      if (useTransactions) await session.abortTransaction();
      return res.status(400).json({ message: "assignedTo field is required" });
    }

    if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(assignedTo)) {
      if (useTransactions) await session.abortTransaction();
      return res.status(400).json({ message: "Invalid ObjectId format" });
    }

    const user = useTransactions
      ? await User.findById(userId).session(session)
      : await User.findById(userId);
    if (!user) {
      if (useTransactions) await session.abortTransaction();
      return res.status(404).json({ message: "User not found" });
    }

    const newParent = useTransactions
      ? await User.findById(assignedTo).session(session)
      : await User.findById(assignedTo);
    if (!newParent) {
      if (useTransactions) await session.abortTransaction();
      return res.status(404).json({ message: "New assigned user not found" });
    }

    let updateCount = { managers: 0, agents: 0, users: 0 };

    // 🧩 Reassignment Logic
    if (user.role === "Manager") {
      // ✅ Update all AGENTS under this manager to new manager
      const agents = useTransactions
        ? await User.find({ assignedTo: user._id, role: "Agent" }).session(session)
        : await User.find({ assignedTo: user._id, role: "Agent" });

      for (const agent of agents) {
        await User.findByIdAndUpdate(
          agent._id,
          { assignedTo }, // move agent under new manager
          useTransactions ? { session } : {}
        );
        updateCount.agents++;
      }

      console.log(`✅ All agents under Manager ${user.name} moved to Manager ${newParent.name}`);

      // ❌ Manager itself is NOT updated
      // ❌ Users under agents remain unchanged

    } else if (user.role === "Agent") {
      // ✅ Move all USERS under this agent to another agent
      const users = useTransactions
        ? await User.find({ assignedTo: user._id, role: "User" }).session(session)
        : await User.find({ assignedTo: user._id, role: "User" });

      for (const u of users) {
        await User.findByIdAndUpdate(
          u._id,
          { assignedTo }, // move users to new agent
          useTransactions ? { session } : {}
        );
        updateCount.users++;
      }

      console.log(`✅ All users under Agent ${user.name} moved to Agent ${newParent.name}`);
      // ❌ Agent itself stays under same manager

    } else if (user.role === "User") {
      // ✅ Simple reassignment for user
      await User.findByIdAndUpdate(
        user._id,
        { assignedTo }, // move user to new agent
        useTransactions ? { session } : {}
      );
      updateCount.users++;
      console.log(`✅ User ${user.name} moved to Agent ${newParent.name}`);

    } else {
      if (useTransactions) await session.abortTransaction();
      return res.status(400).json({ message: "Invalid role for reassignment" });
    }

    if (useTransactions) {
      await session.commitTransaction();
      session.endSession();
    }

    res.status(200).json({
      message: `${user.role} reassignment completed successfully`,
      updated: updateCount,
      mode: useTransactions ? "transaction" : "direct",
    });
  } catch (error) {
    console.error("Reassign User Error:", error);
    if (useTransactions) {
      await session.abortTransaction();
      session.endSession();
    }
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const updateFcmToken = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: "FCM token is required" });
    }
    console.log('req.user.id',req.user.id)

    await User.findByIdAndUpdate(req.user.id, { fcmToken: token }, { new: true });

    res.json({ message: "FCM token updated successfully" });
  } catch (error) {
    console.error("Error saving FCM token:", error);
    res.status(500).json({ message: "Failed to save FCM token" });
  }
};




