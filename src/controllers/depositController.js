import Deposit from "../models/Deposit.js";
import Account from "../models/Account.js";
import User from "../models/User.js";
import { getScope } from "../utils/scopeHelper.js";

// GET Deposits with role-based filtering
export const getDeposits = async (req, res, next) => {
  try {
    const scope = await getScope(req.user);

    let filter = {};
    if (!scope.isAll) {
      if (req.user.role === "Manager") {
        filter = { collectedBy: { $in: scope.agents } };
      } else if (req.user.role === "Agent") {
        filter = { collectedBy: req.user._id };
      } else if (req.user.role === "User") {
        filter = { userId: req.user._id };
      }
    }

    const deposits = await Deposit.find(filter);
    res.json(deposits);
  } catch (err) {
    next(err);
  }
};

// CREATE Deposit with role and scope checks
export const createDeposit = async (req, res, next) => {
  try {
    const { accountId, userId, schemeType, amount } = req.body;

    // Role check
    if (!["Admin", "Manager", "Agent"].includes(req.user.role)) {
      res.status(403);
      throw new Error("Only Admin, Manager, or Agents can create deposits");
    }

    // Amount validation
    if (!amount || amount <= 0) {
      res.status(400);
      throw new Error("Amount must be greater than 0");
    }

    // Validate account
    const account = await Account.findById(accountId);
    if (!account) {
      res.status(404);
      throw new Error("Account not found");
    }

    // User must match account
    if (account.userId.toString() !== userId) {
      res.status(400);
      throw new Error("User does not match account");
    }

    // schemeType must match
    if (account.schemeType !== schemeType) {
      res.status(400);
      throw new Error("schemeType does not match account type");
    }

    // Scope check: Agent
    if (req.user.role === "Agent") {
      const client = await User.findById(userId);
      if (!client || client.assignedTo.toString() !== req.user._id.toString()) {
        res.status(403);
        throw new Error("You can only deposit for your own clients");
      }
    }

    // Scope check: Manager
    if (req.user.role === "Manager") {
      const scope = await getScope(req.user);
      if (!scope.clients.includes(userId.toString())) {
        res.status(403);
        throw new Error("You can only deposit for clients under your agents");
      }
    }

    // Create deposit
    const deposit = new Deposit({
      date: new Date().toISOString().split("T")[0], // YYYY-MM-DD
      accountId,
      userId,
      schemeType,
      amount,
      collectedBy: req.user._id,
      createdAt: new Date()
    });

    await deposit.save();

    // Update account balance
    account.balance += amount;
    await account.save();

    res.status(201).json({ message: "Deposit created successfully", deposit });
  } catch (err) {
    next(err);
  }
};

// UPDATE Deposit (only Admin)
export const updateDeposit = async (req, res, next) => {
  try {
    const { amount, schemeType } = req.body;

    if (req.user.role !== "Admin") {
      res.status(403);
      throw new Error("Only Admin can update deposits");
    }

    const deposit = await Deposit.findById(req.params.id);
    if (!deposit) {
      res.status(404);
      throw new Error("Deposit not found");
    }

    const account = await Account.findById(deposit.accountId);
    if (!account) {
      res.status(404);
      throw new Error("Associated account not found");
    }

    // Validate schemeType match
    if (schemeType && schemeType !== account.schemeType) {
      res.status(400);
      throw new Error("schemeType must match account type");
    }

    // Adjust balance if amount updated
    if (amount && amount > 0 && amount !== deposit.amount) {
      const diff = amount - deposit.amount;
      account.balance += diff;
      await account.save();
      deposit.amount = amount;
    }

    if (schemeType) deposit.schemeType = schemeType;

    await deposit.save();

    res.json({ message: "Deposit updated successfully", deposit });
  } catch (err) {
    next(err);
  }
};

// DELETE Deposit (only Admin) with balance adjustment
export const deleteDeposit = async (req, res, next) => {
  try {
    if (req.user.role !== "Admin") {
      res.status(403);
      throw new Error("Only Admin can delete deposits");
    }

    const deposit = await Deposit.findById(req.params.id);
    if (!deposit) {
      res.status(404);
      throw new Error("Deposit not found");
    }

    const account = await Account.findById(deposit.accountId);
    if (!account) {
      res.status(404);
      throw new Error("Associated account not found");
    }

    // Adjust account balance
    account.balance -= deposit.amount;
    await account.save();

    await deposit.deleteOne();

    res.json({ message: "Deposit deleted successfully and account balance adjusted" });
  } catch (err) {
    next(err);
  }
};

// GET Deposits by Account Number
export const getDepositsByAccount = async (req, res, next) => {
  try {
    const { accountId } = req.params;

    const scope = await getScope(req.user);
    let filter = { accountId };

    if (!scope.isAll) {
      if (req.user.role === "Manager") {
        // Manager → only deposits collected by their agents
        filter.collectedBy = { $in: scope.agents };
      } else if (req.user.role === "Agent") {
        // Agent → only deposits they collected
        filter.collectedBy = req.user._id;
      } else if (req.user.role === "User") {
        // User → only their own deposits
        filter.userId = req.user._id;
      }
    }

    const deposits = await Deposit.find(filter)
      .populate("accountId", "accountNumber schemeType")
      .populate("collectedBy", "name email");

    if (!deposits || deposits.length === 0) {
      return res.status(404).json({ error: "No deposits found for this account" });
    }

    res.json(deposits);
  } catch (err) {
    next(err);
  }
};

// GET Deposits by Date Range with role and scope filtering
export const getDepositsByDateRange = async (req, res, next) => {
  try {
    const { from, to } = req.query;

    if (!from || !to) {
      res.status(400);
      throw new Error("Both 'from' and 'to' dates are required (YYYY-MM-DD)");
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (isNaN(fromDate) || isNaN(toDate)) {
      res.status(400);
      throw new Error("Invalid date format. Use YYYY-MM-DD");
    }

    const scope = await getScope(req.user);

    let filter = {
      date: { $gte: from, $lte: to }
    };

    // Scope restrictions
    if (!scope.isAll) {
      if (req.user.role === "Manager") {
        filter.collectedBy = { $in: scope.agents };
      } else if (req.user.role === "Agent") {
        filter.collectedBy = req.user._id;
      } else if (req.user.role === "User") {
        filter.userId = req.user._id;
      }
    }

    const deposits = await Deposit.find(filter)
      .populate("accountId", "accountNumber schemeType")
      .populate("collectedBy", "name email");

    res.json({ count: deposits.length, deposits });
  } catch (err) {
    next(err);
  }
};

