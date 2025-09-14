import Deposit from "../models/Deposit.js";
import Account from "../models/Account.js";
import User from "../models/User.js";
import { getScope } from "../utils/scopeHelper.js";
import AuditLog from "../models/AuditLog.js";

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
    const { accountId, userId, amount } = req.body;

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

    // Validate userId
    if (account.userId.toString() !== userId) {
      res.status(400);
      throw new Error("User does not match account");
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

    // --------------------------
    // PAYMENT MODE VALIDATIONS
    // --------------------------
    if (account.paymentMode === "Yearly") {
      if (account.isFullyPaid) {
        res.status(400);
        throw new Error("Yearly account already paid in full");
      }
      if (amount !== account.openingBalance) {
        res.status(400);
        throw new Error(
          `Yearly account requires a single payment of ${account.openingBalance}`
        );
      }
      account.isFullyPaid = true;
      account.status = "OnTrack"; // yearly fully paid
    }

    if (account.paymentMode === "Monthly") {
      if (amount !== account.installmentAmount) {
        res.status(400);
        throw new Error(
          `Monthly account requires fixed installment of ${account.installmentAmount}`
        );
      }

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const endOfMonth = new Date(startOfMonth);
      endOfMonth.setMonth(endOfMonth.getMonth() + 1);

      const alreadyPaid = await Deposit.findOne({
        accountId: account._id,
        date: { $gte: startOfMonth, $lt: endOfMonth }
      });

      if (alreadyPaid) {
        res.status(400);
        throw new Error("This month's installment already paid");
      }
    }

    if (account.paymentMode === "Daily") {
      if (!account.monthlyTarget) {
        res.status(400);
        throw new Error("Daily account must have a monthlyTarget set");
      }

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const endOfMonth = new Date(startOfMonth);
      endOfMonth.setMonth(endOfMonth.getMonth() + 1);

      const totalThisMonth = await Deposit.aggregate([
        {
          $match: {
            accountId: account._id,
            date: { $gte: startOfMonth, $lt: endOfMonth }
          }
        },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]);

      const collected =
        totalThisMonth.length > 0 ? totalThisMonth[0].total : 0;
        console.log(collected, amount, account.monthlyTarget);

      if (collected + amount > account.monthlyTarget) {
        res.status(400);
        throw new Error(
          `Daily account limit exceeded: monthly target is ${account.monthlyTarget}, already collected ${collected}`
        );
      }

      account.status =
        collected + amount >= account.monthlyTarget ? "OnTrack" : "Pending";
    }

    // Block if matured
    if (new Date() >= account.maturityDate) {
      account.status = "Matured";
      await account.save();
      res.status(400);
      throw new Error("Account has matured, no more deposits allowed");
    }

    // --------------------------
    // CREATE DEPOSIT
    // --------------------------
    const deposit = new Deposit({
      date: new Date(),
      accountId,
      userId,
      schemeType: account.schemeType, // always from account
      amount,
      collectedBy: req.user._id
    });

    await deposit.save();

    // Update balance
    account.balance += amount;
    if (account.balance > 0 && account.status === "Inactive") {
      account.status = "Active";
    }

    await account.save();

    // --------------------------
    // AUDIT LOG
    // --------------------------
    await AuditLog.create({
      action: "CREATE_DEPOSIT",
      entityType: "Deposit",
      entityId: deposit._id,
      details: {
        amount,
        schemeType: account.schemeType,
        accountId: account._id,
        userId,
        accountBalance: account.balance
      },
      performedBy: req.user._id
    });

    res.status(201).json({ message: "Deposit created successfully", deposit });
  } catch (err) {
    next(err);
  }
};

// UPDATE Deposit (only Admin) with validations, balance adjustment + audit log
export const updateDeposit = async (req, res, next) => {
  try {
    const { amount } = req.body;

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

    // -------------------------
    // PAYMENT MODE VALIDATIONS
    // -------------------------
    if (account.paymentMode === "Yearly") {
      if (account.isFullyPaid && amount !== deposit.amount) {
        res.status(400);
        throw new Error("Yearly account is already fully paid, cannot change");
      }
      if (amount && amount !== account.openingBalance) {
        res.status(400);
        throw new Error(
          `Yearly account deposit must equal openingBalance (${account.openingBalance})`
        );
      }
    }

    if (account.paymentMode === "Monthly") {
      if (amount && amount !== account.installmentAmount) {
        res.status(400);
        throw new Error(
          `Monthly account deposit must equal installmentAmount (${account.installmentAmount})`
        );
      }

      const startOfMonth = new Date(deposit.date);
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const endOfMonth = new Date(startOfMonth);
      endOfMonth.setMonth(endOfMonth.getMonth() + 1);

      const depositsThisMonth = await Deposit.find({
        accountId: account._id,
        date: { $gte: startOfMonth, $lt: endOfMonth }
      });

      if (depositsThisMonth.length > 1) {
        res.status(400);
        throw new Error("Monthly account can only have one deposit per month");
      }
    }

    if (account.paymentMode === "Daily") {
      if (amount && amount > 0) {
        const startOfMonth = new Date(deposit.date);
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const endOfMonth = new Date(startOfMonth);
        endOfMonth.setMonth(endOfMonth.getMonth() + 1);

        const totalThisMonth = await Deposit.aggregate([
          {
            $match: {
              accountId: account._id,
              date: { $gte: startOfMonth, $lt: endOfMonth }
            }
          },
          { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);

        const collected =
          totalThisMonth.length > 0 ? totalThisMonth[0].total : 0;
        const adjusted = collected - deposit.amount + amount;

        if (adjusted > account.monthlyTarget) {
          res.status(400);
          throw new Error(
            `Daily account limit exceeded: monthly target is ${account.monthlyTarget}, would become ${adjusted}`
          );
        }
      }
    }

    // -------------------------
    // UPDATE DEPOSIT & ACCOUNT
    // -------------------------
    let oldValues = {
      amount: deposit.amount,
      schemeType: deposit.schemeType,
      accountBalance: account.balance
    };

    if (amount && amount > 0 && amount !== deposit.amount) {
      const diff = amount - deposit.amount;
      account.balance += diff;
      await account.save();
      deposit.amount = amount;
    }

    // Always sync schemeType with account
    deposit.schemeType = account.schemeType;

    await deposit.save();

    // -------------------------
    // AUDIT LOG
    // -------------------------
    await AuditLog.create({
      action: "UPDATE_DEPOSIT",
      entityType: "Deposit",
      entityId: deposit._id,
      details: {
        old: oldValues,
        new: {
          amount: deposit.amount,
          schemeType: deposit.schemeType,
          accountBalance: account.balance
        },
        accountId: account._id,
        userId: deposit.userId
      },
      performedBy: req.user._id
    });

    res.json({ message: "Deposit updated successfully", deposit });
  } catch (err) {
    next(err);
  }
};

// DELETE Deposit (only Admin) with balance adjustment + audit log
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

    // --- PAYMENT MODE VALIDATIONS ---
    if (account.paymentMode === "Yearly") {
      const depositCount = await Deposit.countDocuments({ accountId: account._id });
      if (depositCount === 1) {
        res.status(400);
        throw new Error("Cannot delete the only yearly deposit — account would become invalid");
      }
      if (account.isFullyPaid) {
        account.isFullyPaid = false;
        account.status = "Inactive";
      }
    }

    if (account.paymentMode === "Monthly") {
      const startOfMonth = new Date(deposit.date);
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const endOfMonth = new Date(startOfMonth);
      endOfMonth.setMonth(endOfMonth.getMonth() + 1);

      const otherThisMonth = await Deposit.countDocuments({
        accountId: account._id,
        _id: { $ne: deposit._id },
        date: { $gte: startOfMonth, $lt: endOfMonth }
      });

      if (otherThisMonth === 0) {
        account.status = "Pending";
      }
    }

    if (account.paymentMode === "Daily") {
      const startOfMonth = new Date(deposit.date);
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const endOfMonth = new Date(startOfMonth);
      endOfMonth.setMonth(endOfMonth.getMonth() + 1);

      const totalThisMonth = await Deposit.aggregate([
        {
          $match: {
            accountId: account._id,
            _id: { $ne: deposit._id },
            date: { $gte: startOfMonth, $lt: endOfMonth }
          }
        },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]);

      const collected = totalThisMonth.length > 0 ? totalThisMonth[0].total : 0;
      account.status = collected >= account.monthlyTarget ? "OnTrack" : "Pending";
    }

    // --- BALANCE UPDATE ---
    account.balance -= deposit.amount;
    if (account.balance < 0) account.balance = 0;

    const remainingDeposits = await Deposit.countDocuments({
      accountId: account._id,
      _id: { $ne: deposit._id }
    });

    if (remainingDeposits === 0 && ["Monthly", "Daily"].includes(account.paymentMode)) {
      account.status = "Inactive";
    }

    await account.save();

    // --- AUDIT LOG ---
    await AuditLog.create({
      action: "DELETE_DEPOSIT",
      entityType: "Deposit",
      entityId: deposit._id,
      details: {
        amount: deposit.amount,
        date: deposit.date,
        accountId: account._id,
        userId: deposit.userId,
        schemeType: deposit.schemeType,
        oldBalance: account.balance + deposit.amount,
        newBalance: account.balance
      },
      performedBy: req.user._id
    });

    // Delete deposit
    await deposit.deleteOne();

    res.json({
      message: "Deposit deleted successfully and account balance adjusted",
      accountBalance: account.balance,
      accountStatus: account.status
    });
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

