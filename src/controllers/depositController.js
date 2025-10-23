import mongoose from "mongoose";

import { withTransaction } from "../utils/withTransaction.js";
import Deposit from "../models/Deposit.js";
import Account from "../models/Account.js";
import User from "../models/User.js";
import { getScope } from "../utils/scopeHelper.js";
import { logAudit } from "../utils/auditLogger.js";
import { sendFirebaseNotification } from "../utils/sendFirebaseNotification.js";

// GET Deposits with role-based filtering
export const getDeposits = async (req, res, next) => {
  try {
    const scope = await getScope(req.user);

    let filter = {
      companyId: req.user.companyId,
    };

    // 🔹 Role-based scope
    if (!scope.isAll) {
      if (req.user.role === "Manager") {
        filter.collectedBy = { $in: scope.agents };
      } else if (req.user.role === "Agent") {
        filter.collectedBy = req.user.id;
      } else if (req.user.role === "User") {
        filter.userId = req.user.id;
      }
    }

    // 🔹 Date filters
    const { date, startDate, endDate } = req.query;
    if (date === "today") {
      const today = new Date();
      const startOfDay = new Date(today.setHours(0, 0, 0, 0));
      const endOfDay = new Date(today.setHours(23, 59, 59, 999));
      filter.date = { $gte: startOfDay, $lte: endOfDay };
    } else if (startDate && endDate) {
      filter.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    // ✅ Fetch deposits with latest first
    const deposits = await Deposit.find(filter)
      .populate("accountId", "clientName accountNumber schemeType")
      .populate("collectedBy", "name role email")
      .sort({ createdAt: -1 }) // 🆕 newest deposits first
      .lean();

    // ✅ Flatten response
    const formattedDeposits = deposits.map((d) => ({
      _id: d._id,
      date: d.date,
      clientName: d.accountId?.clientName || null,
      accountNumber: d.accountId?.accountNumber || null,
      schemeType: d.accountId?.schemeType || d.schemeType,
      amount: d.amount,
      collectedBy: d.collectedBy
        ? {
            _id: d.collectedBy._id,
            name: d.collectedBy.name,
            role: d.collectedBy.role,
            email: d.collectedBy.email,
          }
        : null,
      userId: d.userId,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    }));

    res.json(formattedDeposits);
  } catch (err) {
    next(err);
  }
};

/**
 * Full-featured createDeposit that preserves all payment-mode rules,
 * audit logging and uses withTransaction to handle session only when enabled.
 */
export const createDeposit = async (req, res, next) => {
  try {
    const deposit = await withTransaction(async (session) => {
      const opts = session ? { session } : {};
      const { accountId, userId, amount } = req.body;

      // --------------------------
      // Manual Input Validation
      // --------------------------
      if (!accountId || typeof accountId !== "string") {
        await logAudit({
          action: "CREATE_DEPOSIT_FAILED",
          entityType: "DepositAttempt",
          details: { reason: "INVALID_ACCOUNT_ID", accountId, userId, amount },
          reqUser: req.user,
        });
        throw new Error("Valid accountId is required");
      }
      if (!userId || typeof userId !== "string") {
        await logAudit({
          action: "CREATE_DEPOSIT_FAILED",
          entityType: "DepositAttempt",
          details: { reason: "INVALID_USER_ID", accountId, userId, amount },
          reqUser: req.user,
        });
        throw new Error("Valid userId is required");
      }
      if (typeof amount !== "number" || amount <= 0) {
        await logAudit({
          action: "CREATE_DEPOSIT_FAILED",
          entityType: "DepositAttempt",
          details: { reason: "INVALID_AMOUNT", accountId, userId, amount },
          reqUser: req.user,
        });
        throw new Error("Amount must be a positive number");
      }

      // --------------------------
      // Role check (outside transaction ideally, but we already are inside withTransaction wrapper)
      // --------------------------
      if (!["Admin", "Manager", "Agent"].includes(req.user.role)) {
        await logAudit({
          action: "CREATE_DEPOSIT_FAILED",
          entityType: "DepositAttempt",
          details: { reason: "ROLE_NOT_ALLOWED", accountId, userId, amount },
          reqUser: req.user,
        });
        throw new Error("Only Admin, Manager, or Agents can create deposits");
      }

      // --------------------------
      // Fetch and initial validations (inside transaction for consistency)
      // --------------------------
      const account = await Account.findById(accountId)
        .populate("userId", "name")
        .session(session);

      if (!account) {
        await logAudit({
          action: "CREATE_DEPOSIT_FAILED",
          entityType: "DepositAttempt",
          details: { reason: "ACCOUNT_NOT_FOUND", accountId, userId, amount },
          reqUser: req.user,
        });
        throw new Error("Account not found");
      }

      if (!account.userId || account.userId._id.toString() !== userId) {
        await logAudit({
          action: "CREATE_DEPOSIT_FAILED",
          entityType: "DepositAttempt",
          details: { reason: "USER_ACCOUNT_MISMATCH", accountId, userId, amount },
          reqUser: req.user,
        });
        throw new Error("User does not match account");
      }

      // --------------------------
      // Scope checks (fetches inside for consistency)
      // --------------------------
      if (req.user.role === "Agent") {
        const client = await User.findById(userId).session(session);
        if (!client || client.assignedTo.toString() !== req.user.id.toString()) {
          await logAudit({
            action: "CREATE_DEPOSIT_FAILED",
            entityType: "DepositAttempt",
            details: { reason: "AGENT_SCOPE_VIOLATION", accountId, userId, amount },
            reqUser: req.user,
          });
          throw new Error("You can only deposit for your own clients");
        }
      }

      if (req.user.role === "Manager") {
        const scope = await getScope(req.user); // assumes getScope uses req.user and returns { clients: [...] }
        if (!scope || !scope.clients.includes(userId.toString())) {
          await logAudit({
            action: "CREATE_DEPOSIT_FAILED",
            entityType: "DepositAttempt",
            details: { reason: "MANAGER_SCOPE_VIOLATION", accountId, userId, amount },
            reqUser: req.user,
          });
          throw new Error("You can only deposit for clients under your agents");
        }
      }

      const now = new Date();

      // --------------------------
      // Maturity and payable checks (inside for atomic read)
      // --------------------------
      if (account.maturityDate && now >= account.maturityDate) {
        account.status = "Matured";
        await account.save(opts);

        await logAudit({
          action: "CREATE_DEPOSIT_FAILED",
          entityType: "DepositAttempt",
          details: { reason: "ACCOUNT_MATURED", accountId, userId, amount },
          reqUser: req.user,
        });
        // Commit update that sets matured status, then block deposit creation
        throw new Error("Account has matured, no more deposits allowed");
      }

      // Aggregate total collected (inside transaction)
      const totalAllAgg = session
        ? await Deposit.aggregate([
          { $match: { accountId: account._id } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]).session(session)
        : await Deposit.aggregate([
          { $match: { accountId: account._id } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]);

      const collectedAll = totalAllAgg.length ? totalAllAgg[0].total : 0;

      if (typeof account.totalPayableAmount !== "number" || account.totalPayableAmount <= 0) {
        await logAudit({
          action: "CREATE_DEPOSIT_FAILED",
          entityType: "DepositAttempt",
          details: { reason: "MISSING_TOTAL_PAYABLE", accountId, userId, amount },
          reqUser: req.user,
        });
        throw new Error("Account configuration invalid (missing totalPayableAmount)");
      }

      if (collectedAll + amount > account.totalPayableAmount) {
        await logAudit({
          action: "CREATE_DEPOSIT_FAILED",
          entityType: "DepositAttempt",
          details: {
            reason: "TOTAL_PAYABLE_EXCEEDED",
            accountId,
            userId,
            amount,
            collectedAll,
            totalPayableAmount: account.totalPayableAmount,
          },
          reqUser: req.user,
        });
        throw new Error("Total payable exceeded");
      }

      // --------------------------
      // Payment mode validations (Daily / Monthly / Yearly)
      // --------------------------
      let statusUpdate = {};
      let isFullyPaidUpdate = false;

      if (account.paymentMode === "Yearly") {
        // required is yearlyAmount if defined else totalPayableAmount
        const required = typeof account.yearlyAmount === "number" && account.yearlyAmount > 0
          ? account.yearlyAmount
          : account.totalPayableAmount;

        if (account.isFullyPaid) {
          await logAudit({
            action: "CREATE_DEPOSIT_FAILED",
            entityType: "DepositAttempt",
            details: { reason: "YEARLY_ALREADY_PAID", accountId, userId, amount },
            reqUser: req.user,
          });
          throw new Error("Yearly account already paid in full");
        }

        if (amount !== required) {
          await logAudit({
            action: "CREATE_DEPOSIT_FAILED",
            entityType: "DepositAttempt",
            details: { reason: "YEARLY_AMOUNT_MISMATCH", accountId, userId, amount, required },
            reqUser: req.user,
          });
          throw new Error(`Yearly account requires a single payment of ${required}`);
        }

        isFullyPaidUpdate = true;
        statusUpdate = { status: "OnTrack" };
      }

      if (account.paymentMode === "Monthly") {
        const required = account.installmentAmount;
        if (!required || required <= 0) {
          await logAudit({
            action: "CREATE_DEPOSIT_FAILED",
            entityType: "DepositAttempt",
            details: { reason: "MISSING_INSTALLMENT_AMOUNT", accountId, userId, amount },
            reqUser: req.user,
          });
          throw new Error("Missing installmentAmount");
        }

        if (amount !== required) {
          await logAudit({
            action: "CREATE_DEPOSIT_FAILED",
            entityType: "DepositAttempt",
            details: { reason: "MONTHLY_AMOUNT_MISMATCH", accountId, userId, amount, required },
            reqUser: req.user,
          });
          throw new Error(`Monthly account requires fixed installment of ${required}`);
        }

        // check if already paid in this month
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(startOfMonth);
        endOfMonth.setMonth(endOfMonth.getMonth() + 1);

        const alreadyPaid = await Deposit.findOne({
          accountId: account._id,
          date: { $gte: startOfMonth, $lt: endOfMonth },
        }).session(session);

        if (alreadyPaid) {
          await logAudit({
            action: "CREATE_DEPOSIT_FAILED",
            entityType: "DepositAttempt",
            details: { reason: "MONTHLY_ALREADY_PAID", accountId, userId, amount },
            reqUser: req.user,
          });
          throw new Error("This month's installment already paid");
        }

        // Not setting isFullyPaid here unless collectedAll + amount >= totalPayableAmount later
        statusUpdate = { status: "Pending" }; // later it may become OnTrack if fully paid
      }

      if (account.paymentMode === "Daily") {
        if (!account.monthlyTarget || account.monthlyTarget <= 0) {
          await logAudit({
            action: "CREATE_DEPOSIT_FAILED",
            entityType: "DepositAttempt",
            details: { reason: "MISSING_MONTHLY_TARGET", accountId, userId, amount },
            reqUser: req.user,
          });
          throw new Error("Daily account must have a monthlyTarget set");
        }

        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(startOfMonth);
        endOfMonth.setMonth(endOfMonth.getMonth() + 1);

        const totalThisMonthAgg = session
          ? await Deposit.aggregate([
            { $match: { accountId: account._id, date: { $gte: startOfMonth, $lt: endOfMonth } } },
            { $group: { _id: null, total: { $sum: "$amount" } } },
          ]).session(session)
          : await Deposit.aggregate([
            { $match: { accountId: account._id, date: { $gte: startOfMonth, $lt: endOfMonth } } },
            { $group: { _id: null, total: { $sum: "$amount" } } },
          ]);

        const collectedThisMonth = totalThisMonthAgg.length ? totalThisMonthAgg[0].total : 0;

        if (collectedThisMonth + amount > account.monthlyTarget) {
          await logAudit({
            action: "CREATE_DEPOSIT_FAILED",
            entityType: "DepositAttempt",
            details: {
              reason: "DAILY_MONTHLY_TARGET_EXCEEDED",
              accountId,
              userId,
              amount,
              collected: collectedThisMonth,
              monthlyTarget: account.monthlyTarget,
            },
            reqUser: req.user,
          });
          throw new Error("Daily account monthly target exceeded");
        }

        statusUpdate = { status: collectedThisMonth + amount >= account.monthlyTarget ? "OnTrack" : "Pending" };
      }

      // --------------------------
      // CREATE DEPOSIT & UPDATE ACCOUNT (atomic)
      // --------------------------
      const depositData = {
        companyId: req.user.companyId,
        date: now,
        accountId,
        userId,
        amount,
        collectedBy: req.user.id,
      };

      if (["RD", "NSC", "KVP", "PPF"].includes(account.schemeType)) {
        depositData.schemeType = account.schemeType;
      }

      const deposit = new Deposit(depositData);
      await deposit.save(opts);

      // Atomic balance increment and status update
      const afterCollected = collectedAll + amount;

      // Prepare update fields carefully: $inc plus other updates
      const updateFields = { $inc: { balance: amount } };

      // merge statusUpdate if present
      if (statusUpdate && Object.keys(statusUpdate).length > 0) {
        Object.assign(updateFields, statusUpdate);
      }

      if (isFullyPaidUpdate || afterCollected >= account.totalPayableAmount) {
        updateFields.isFullyPaid = true;
        updateFields.status = "OnTrack";
      }

      // Activate if needed (use current balance for check)
      if ((account.balance === 0 || account.balance == null) && amount > 0 && account.status === "Inactive") {
        updateFields.status = "Active";
      }

      await Account.findByIdAndUpdate(accountId, updateFields, opts);

      // --------------------------
      // AUDIT LOG SUCCESS
      // --------------------------
      await logAudit({
        action: "CREATE_DEPOSIT",
        entityType: "Deposit",
        entityId: deposit._id,
        details: {
          amount,
          schemeType: deposit.schemeType || account.schemeType, // fallback
          accountId: account._id,
          userId,
          accountBalance: (account.balance || 0) + amount, // in-memory best-effort
          totalCollected: afterCollected,
          totalPayableAmount: account.totalPayableAmount,
          clientName: account.clientName || account.userId?.name,
        },
        reqUser: req.user,
      });

      return deposit;
    }); // end withTransaction callback

    // Respond success
    return res.status(201).json({ message: "Deposit created successfully", deposit });
  } catch (err) {
    // All inner audit failures already logged before we threw errors.
    // Use next to keep centralized error handling consistent.
    return next(new Error(err.message || "Deposit creation failed"));
  }
};


// UPDATE Deposit (only Admin) with validations, balance update + audit log
export const updateDeposit = async (req, res, next) => {
  try {
    const { amount, date } = req.body;

    // ✅ Only Admin allowed
    if (req.user.role !== "Admin") {
      await logAudit({
        action: "UPDATE_DEPOSIT_FAILED",
        entityType: "DepositAttempt",
        details: {
          reason: "ROLE_NOT_ALLOWED",
          depositId: req.params.id,
          attemptedBy: req.user.id,
          payload: req.body,
        },
        reqUser: req.user,
      });
      res.status(403);
      throw new Error("Only Admin can update deposits");
    }

    // ✅ Find deposit
    const deposit = await Deposit.findById(req.params.id);
    if (!deposit) {
      await logAudit({
        action: "UPDATE_DEPOSIT_FAILED",
        entityType: "DepositAttempt",
        details: {
          reason: "DEPOSIT_NOT_FOUND",
          depositId: req.params.id,
          payload: req.body,
        },
        reqUser: req.user,
      });
      res.status(404);
      throw new Error("Deposit not found");
    }

    // ✅ Find account
    const account = await Account.findById(deposit.accountId);
    if (!account) {
      await logAudit({
        action: "UPDATE_DEPOSIT_FAILED",
        entityType: "DepositAttempt",
        details: {
          reason: "ACCOUNT_NOT_FOUND",
          depositId: deposit._id,
          accountId: deposit.accountId,
        },
        reqUser: req.user,
      });
      res.status(404);
      throw new Error("Associated account not found");
    }

    // ✅ Validate amount if provided
    if (amount !== undefined && (typeof amount !== "number" || amount <= 0)) {
      await logAudit({
        action: "UPDATE_DEPOSIT_FAILED",
        entityType: "DepositAttempt",
        details: {
          reason: "INVALID_AMOUNT",
          depositId: deposit._id,
          attemptedAmount: amount,
        },
        reqUser: req.user,
      });
      res.status(400);
      throw new Error("Amount must be a positive number");
    }

    // ✅ Ensure account has totalPayableAmount
    if (typeof account.totalPayableAmount !== "number") {
      await logAudit({
        action: "UPDATE_DEPOSIT_FAILED",
        entityType: "DepositAttempt",
        details: {
          reason: "MISSING_TOTAL_PAYABLE",
          accountId: account._id,
        },
        reqUser: req.user,
      });
      res.status(500);
      throw new Error("Account misconfigured: missing totalPayableAmount");
    }

    // ✅ Totals check
    const totalAgg = await Deposit.aggregate([
      { $match: { accountId: account._id } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const collectedAll = totalAgg.length ? totalAgg[0].total : 0;
    const collectedExcludingThis = collectedAll - (deposit.amount || 0);

    const newAmount = amount !== undefined ? amount : deposit.amount;
    if (collectedExcludingThis + newAmount > account.totalPayableAmount) {
      await logAudit({
        action: "UPDATE_DEPOSIT_FAILED",
        entityType: "DepositAttempt",
        details: {
          reason: "TOTAL_PAYABLE_EXCEEDED",
          accountId: account._id,
          depositId: deposit._id,
          collectedExcludingThis,
          attemptedNewAmount: newAmount,
          totalPayableAmount: account.totalPayableAmount,
        },
        reqUser: req.user,
      });
      res.status(400);
      throw new Error("Total payable exceeded");
    }

    // ✅ Payment mode checks
    const depositDate = date ? new Date(date) : new Date(deposit.date);
    const startOfMonth = new Date(
      depositDate.getFullYear(),
      depositDate.getMonth(),
      1
    );
    const endOfMonth = new Date(startOfMonth);
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);

    if (account.paymentMode === "Yearly") {
      const required = account.yearlyAmount ?? account.totalPayableAmount;
      if (newAmount !== required) {
        await logAudit({
          action: "UPDATE_DEPOSIT_FAILED",
          entityType: "DepositAttempt",
          details: {
            reason: "YEARLY_AMOUNT_MISMATCH",
            accountId: account._id,
            required,
            attempted: newAmount,
          },
          reqUser: req.user,
        });
        res.status(400);
        throw new Error(`Yearly account deposit must equal ${required}`);
      }
    }

    if (account.paymentMode === "Monthly") {
      const required = account.installmentAmount;
      if (!required || required <= 0) {
        await logAudit({
          action: "UPDATE_DEPOSIT_FAILED",
          entityType: "DepositAttempt",
          details: { reason: "MISSING_INSTALLMENT", accountId: account._id },
          reqUser: req.user,
        });
        res.status(500);
        throw new Error("Account misconfigured: missing installmentAmount");
      }

      if (newAmount !== required) {
        await logAudit({
          action: "UPDATE_DEPOSIT_FAILED",
          entityType: "DepositAttempt",
          details: {
            reason: "MONTHLY_AMOUNT_MISMATCH",
            accountId: account._id,
            required,
            attempted: newAmount,
          },
          reqUser: req.user,
        });
        res.status(400);
        throw new Error(`Monthly account requires installmentAmount = ${required}`);
      }

      const depositsThisMonth = await Deposit.find({
        accountId: account._id,
        date: { $gte: startOfMonth, $lt: endOfMonth },
        _id: { $ne: deposit._id },
      });

      if (depositsThisMonth.length > 0) {
        await logAudit({
          action: "UPDATE_DEPOSIT_FAILED",
          entityType: "DepositAttempt",
          details: {
            reason: "MONTHLY_MULTIPLE_DEPOSITS",
            accountId: account._id,
            depositId: deposit._id,
          },
          reqUser: req.user,
        });
        res.status(400);
        throw new Error("Monthly account can only have one deposit per month");
      }
    }

    if (account.paymentMode === "Daily") {
      if (!account.monthlyTarget || account.monthlyTarget <= 0) {
        await logAudit({
          action: "UPDATE_DEPOSIT_FAILED",
          entityType: "DepositAttempt",
          details: {
            reason: "MISSING_MONTHLY_TARGET",
            accountId: account._id,
          },
          reqUser: req.user,
        });
        res.status(500);
        throw new Error("Daily account misconfigured: missing monthlyTarget");
      }

      const monthlyAgg = await Deposit.aggregate([
        {
          $match: {
            accountId: account._id,
            date: { $gte: startOfMonth, $lt: endOfMonth },
            _id: { $ne: deposit._id },
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]);
      const collectedThisMonthExcl = monthlyAgg.length
        ? monthlyAgg[0].total
        : 0;
      const adjustedMonthTotal = collectedThisMonthExcl + newAmount;

      if (adjustedMonthTotal > account.monthlyTarget) {
        await logAudit({
          action: "UPDATE_DEPOSIT_FAILED",
          entityType: "DepositAttempt",
          details: {
            reason: "DAILY_MONTHLY_TARGET_EXCEEDED",
            accountId: account._id,
            depositId: deposit._id,
            collectedThisMonthExcl,
            attemptedNewAmount: newAmount,
            monthlyTarget: account.monthlyTarget,
          },
          reqUser: req.user,
        });
        res.status(400);
        throw new Error("Daily account monthly target exceeded");
      }
    }

    // ✅ Update deposit
    const oldValues = {
      amount: deposit.amount,
      date: deposit.date,
      schemeType: deposit.schemeType,
    };

    if (amount !== undefined && amount !== deposit.amount) {
      deposit.amount = amount;
    }

    if (date) {
      const parsed = new Date(date);
      if (isNaN(parsed)) {
        await logAudit({
          action: "UPDATE_DEPOSIT_FAILED",
          entityType: "DepositAttempt",
          details: {
            reason: "INVALID_DATE",
            depositId: deposit._id,
            attemptedDate: date,
          },
          reqUser: req.user,
        });
        res.status(400);
        throw new Error("Invalid date format");
      }
      deposit.date = parsed;
    }

    deposit.schemeType = account.schemeType;
    await deposit.save();

    // ✅ Recalculate account balance
    const afterAgg = await Deposit.aggregate([
      { $match: { accountId: account._id } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const afterCollected = afterAgg.length ? afterAgg[0].total : 0;
    account.balance = afterCollected;

    if (afterCollected >= account.totalPayableAmount) {
      account.status = "OnTrack";
      if (account.paymentMode === "Yearly") account.isFullyPaid = true;
    } else {
      if (account.paymentMode === "Daily") {
        const monthAgg = await Deposit.aggregate([
          {
            $match: {
              accountId: account._id,
              date: {
                $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
                $lt: new Date(
                  new Date().getFullYear(),
                  new Date().getMonth() + 1
                ),
              },
            },
          },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]);
        const monthCollected = monthAgg.length ? monthAgg[0].total : 0;
        account.status =
          monthCollected >= account.monthlyTarget ? "OnTrack" : "Pending";
      } else {
        account.status =
          account.status === "Inactive" ? "Inactive" : "Active";
      }
      if (account.paymentMode === "Yearly") account.isFullyPaid = false;
    }

    await account.save();

    // ✅ Audit success
    await logAudit({
      action: "UPDATE_DEPOSIT",
      entityType: "Deposit",
      entityId: deposit._id,
      details: {
        old: oldValues,
        new: {
          amount: deposit.amount,
          date: deposit.date,
          schemeType: deposit.schemeType,
        },
        accountId: account._id,
        accountBalance: account.balance,
        totalCollected: afterCollected,
        totalPayableAmount: account.totalPayableAmount,
      },
      reqUser: req.user,
    });

    res.json({ message: "Deposit updated successfully", deposit });
  } catch (err) {
    next(err);
  }
};

// DELETE Deposit (only Admin) with validations, balance update + audit log
export const deleteDeposit = async (req, res, next) => {
  try {
    // ✅ Only Admin allowed
    if (req.user.role !== "Admin") {
      await logAudit({
        action: "DELETE_DEPOSIT_FAILED",
        entityType: "DepositAttempt",
        details: { reason: "ROLE_NOT_ALLOWED", depositId: req.params.id },
        reqUser: req.user,
      });
      res.status(403);
      throw new Error("Only Admin can delete deposits");
    }

    // ✅ Find deposit
    const deposit = await Deposit.findById(req.params.id);
    if (!deposit) {
      await logAudit({
        action: "DELETE_DEPOSIT_FAILED",
        entityType: "DepositAttempt",
        details: { reason: "DEPOSIT_NOT_FOUND", depositId: req.params.id },
        reqUser: req.user,
      });
      res.status(404);
      throw new Error("Deposit not found");
    }

    // ✅ Find account
    const account = await Account.findById(deposit.accountId);
    if (!account) {
      await logAudit({
        action: "DELETE_DEPOSIT_FAILED",
        entityType: "DepositAttempt",
        details: {
          reason: "ACCOUNT_NOT_FOUND",
          depositId: deposit._id,
          accountId: deposit.accountId,
        },
        reqUser: req.user,
      });
      res.status(404);
      throw new Error("Associated account not found");
    }

    // ✅ Current totals
    const totalAgg = await Deposit.aggregate([
      { $match: { accountId: account._id } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const collectedAll = totalAgg.length ? totalAgg[0].total : 0;
    const newCollected = collectedAll - deposit.amount;

    // --- PAYMENT MODE VALIDATIONS ---
    if (account.paymentMode === "Yearly") {
      const depositCount = await Deposit.countDocuments({
        accountId: account._id,
      });
      if (depositCount === 1) {
        await logAudit({
          action: "DELETE_DEPOSIT_FAILED",
          entityType: "DepositAttempt",
          details: {
            reason: "CANNOT_DELETE_ONLY_YEARLY_DEPOSIT",
            accountId: account._id,
            depositId: deposit._id,
          },
          reqUser: req.user,
        });
        res.status(400);
        throw new Error(
          "Cannot delete the only yearly deposit — account would become invalid"
        );
      }
      if (
        account.isFullyPaid &&
        newCollected < (account.totalPayableAmount || account.yearlyAmount || 0)
      ) {
        account.isFullyPaid = false;
      }
    }

    // ✅ Recompute account totals excluding this deposit
    const updatedTotalAgg = await Deposit.aggregate([
      { $match: { accountId: account._id, _id: { $ne: deposit._id } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const updatedCollected = updatedTotalAgg.length
      ? updatedTotalAgg[0].total
      : 0;
    account.balance = Math.max(0, updatedCollected);

    // ✅ Update status & isFullyPaid
    const totalPayable = account.totalPayableAmount ?? account.yearlyAmount ?? null;

    if (totalPayable !== null && updatedCollected >= totalPayable) {
      account.status = "OnTrack";
      if (account.paymentMode === "Yearly") account.isFullyPaid = true;
    } else {
      if (account.paymentMode === "Monthly") {
        const startOfMonth = new Date(
          deposit.date.getFullYear(),
          deposit.date.getMonth(),
          1
        );
        const endOfMonth = new Date(startOfMonth);
        endOfMonth.setMonth(endOfMonth.getMonth() + 1);

        const otherThisMonth = await Deposit.countDocuments({
          accountId: account._id,
          _id: { $ne: deposit._id },
          date: { $gte: startOfMonth, $lt: endOfMonth },
        });

        account.status = otherThisMonth > 0 ? "Active" : "Pending";
      } else if (account.paymentMode === "Daily") {
        const startOfMonth = new Date(
          deposit.date.getFullYear(),
          deposit.date.getMonth(),
          1
        );
        const endOfMonth = new Date(startOfMonth);
        endOfMonth.setMonth(endOfMonth.getMonth() + 1);

        const monthAgg = await Deposit.aggregate([
          {
            $match: {
              accountId: account._id,
              _id: { $ne: deposit._id },
              date: { $gte: startOfMonth, $lt: endOfMonth },
            },
          },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]);
        const collectedThisMonth = monthAgg.length ? monthAgg[0].total : 0;
        account.status =
          account.monthlyTarget && collectedThisMonth >= account.monthlyTarget
            ? "OnTrack"
            : "Pending";
      } else {
        account.status = account.balance > 0 ? "Active" : "Inactive";
      }

      if (account.paymentMode === "Yearly") {
        account.isFullyPaid = false;
      }
    }

    // --- AUDIT ATTEMPT ---
    await logAudit({
      action: "DELETE_DEPOSIT_ATTEMPT",
      entityType: "Deposit",
      entityId: deposit._id,
      details: {
        reason: "DELETE_REQUEST",
        depositId: deposit._id,
        accountId: account._id,
        depositAmount: deposit.amount,
        oldCollectedTotal: collectedAll,
        expectedNewTotal: updatedCollected,
        paymentMode: account.paymentMode,
      },
      reqUser: req.user,
    });

    // --- Delete record ---
    await deposit.deleteOne();
    await account.save();

    // --- AUDIT SUCCESS ---
    await logAudit({
      action: "DELETE_DEPOSIT",
      entityType: "Deposit",
      entityId: deposit._id,
      details: {
        amount: deposit.amount,
        date: deposit.date,
        accountId: account._id,
        userId: deposit.userId,
        schemeType: deposit.schemeType,
        oldBalance: collectedAll,
        newBalance: account.balance,
        accountStatus: account.status,
      },
      reqUser: req.user,
    });

    res.json({
      message: "Deposit deleted successfully and account balance adjusted",
      accountBalance: account.balance,
      accountStatus: account.status,
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
    let filter = { accountId, companyId: req.user.companyId };

    if (!scope.isAll) {
      if (req.user.role === "Manager") {
        // Manager → only deposits collected by their agents
        filter.collectedBy = { $in: scope.agents };
      } else if (req.user.role === "Agent") {
        // Agent → only deposits they collected
        filter.collectedBy = req.user.id;
      } else if (req.user.role === "User") {
        // User → only their own deposits
        filter.userId = req.user.id;
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
      date: { $gte: from, $lte: to },
      companyId: req.user.companyId
    };

    // Scope restrictions
    if (!scope.isAll) {
      if (req.user.role === "Manager") {
        filter.collectedBy = { $in: scope.agents };
      } else if (req.user.role === "Agent") {
        filter.collectedBy = req.user.id;
      } else if (req.user.role === "User") {
        filter.userId = req.user.id;
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

/**
 * Bulk create deposits (Agent only).
 * Works with or without replica set via USE_TRANSACTIONS env flag.
 */
export const bulkCreateDeposits = async (req, res, next) => {
  try {
    const result = await withTransaction(async (session) => {
      const opts = session ? { session } : {};
      const deposits = req.body.deposits;
      const now = new Date();

      // 🔹 Validate input
      if (!Array.isArray(deposits) || deposits.length === 0)
        return res.status(400).json({ message: "Deposits array required" });

      if (req.user.role !== "Agent")
        return res.status(403).json({ message: "Only Agents can perform bulk deposits" });

      const validDeposits = [];
      const failed = [];
      const failureSummary = {};

      // ⚡ Fetch all accounts
      const accountIds = deposits.map((d) => d.accountId);
      const accounts = await Account.find({ _id: { $in: accountIds } })
        .populate("userId", "name")
        .session(session || null);
      const accountsMap = new Map(accounts.map((acc) => [acc._id.toString(), acc]));

      // ✅ Validate each deposit
      for (const { accountId, amount, collectedBy } of deposits) {
        const account = accountsMap.get(accountId);

        const fail = (error) => {
          failed.push({ accountId, amount, error });
          failureSummary[error] = (failureSummary[error] || 0) + 1;
        };

        if (typeof amount !== "number" || amount <= 0) {
          fail("INVALID_AMOUNT");
          continue;
        }

        if (collectedBy !== req.user.id.toString()) {
          fail("COLLECTED_BY_MISMATCH");
          continue;
        }

        if (!account) {
          fail("ACCOUNT_NOT_FOUND");
          continue;
        }

        if (!account.userId) {
          fail("USER_NOT_FOUND_OR_INVALID");
          continue;
        }

        const userId =
          typeof account.userId === "object" && account.userId._id
            ? account.userId._id.toString()
            : account.userId.toString();

        // ⏱ Duplicate detection window
        const startDate = new Date(now);
        const endDate = new Date(now);

        switch (account.paymentMode) {
          case "Daily":
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);
            break;
          case "Monthly":
            startDate.setDate(1);
            endDate.setMonth(endDate.getMonth() + 1, 0);
            endDate.setHours(23, 59, 59, 999);
            break;
          case "Yearly":
            startDate.setMonth(0, 1);
            startDate.setHours(0, 0, 0, 0);
            endDate.setFullYear(endDate.getFullYear(), 11, 31);
            endDate.setHours(23, 59, 59, 999);
            break;
          default:
            break;
        }

        const alreadyDeposited = await Deposit.findOne({
          accountId: account._id,
          date: { $gte: startDate, $lte: endDate },
        }).session(session || null);

        if (alreadyDeposited) {
          const errMsg =
            account.paymentMode === "Daily"
              ? "Today’s deposit already recorded"
              : account.paymentMode === "Monthly"
                ? "This month’s deposit already recorded"
                : "Yearly account already paid in full";
          fail(errMsg);
          continue;
        }

        validDeposits.push({ account, userId, amount, accountId });
      }

      // 🚫 No valid deposits
      if (validDeposits.length === 0) {
        await logAudit({
          action: "BULK_CREATE_DEPOSITS_FAILED",
          entityType: "DepositBatch",
          details: {
            reason: "NO_VALID_DEPOSITS",
            failedCount: failed.length,
            failureSummary,
          },
          reqUser: req.user,
        });

        return {
          total: deposits.length,
          successCount: 0,
          failedCount: failed.length,
          failedAccounts: failed,
          successAccounts: [],
          failureSummary,
        };
      }

      // 💾 Bulk insert + balance update
      const chunkSize = 100;
      const allSuccess = [];

      for (let i = 0; i < validDeposits.length; i += chunkSize) {
        const chunk = validDeposits.slice(i, i + chunkSize);

        // Insert deposits
        const depositOps = chunk.map(({ account, userId, amount }) => ({
          insertOne: {
            document: {
              accountId: new mongoose.Types.ObjectId(account._id),
              userId: new mongoose.Types.ObjectId(userId),
              amount,
              companyId: req.user.companyId,
              date: now,
              collectedBy: new mongoose.Types.ObjectId(req.user.id),
              createdAt: now,
              updatedAt: now,
            },
          },
        }));

        await Deposit.bulkWrite(depositOps, { ...opts, ordered: false });

        // Update balances
        const accountOps = chunk.map(({ account, amount }) => ({
          updateOne: {
            filter: { _id: new mongoose.Types.ObjectId(account._id) },
            update: { $inc: { balance: amount }, $set: { updatedAt: now } },
          },
        }));

        await Account.bulkWrite(accountOps, { ...opts, ordered: false });

        // Success log
        const chunkSuccess = chunk.map((item) => ({
          accountId: item.accountId,
          accountNumber: item.account.accountNumber,
          clientName: item.account.userId.name,
          amount: item.amount,
        }));

        allSuccess.push(...chunkSuccess);

        await logAudit({
          action: "BULK_CREATE_DEPOSITS_SUCCESS",
          entityType: "DepositBatch",
          details: {
            chunkSize: chunk.length,
            agentId: req.user.id,
            chunkAccounts: chunk.map((c) => c.accountId),
          },
          reqUser: req.user,
        });
      }

      // ✅ Final audit
      await logAudit({
        action: "BULK_CREATE_DEPOSITS_COMPLETED",
        entityType: "DepositBatch",
        details: {
          total: deposits.length,
          successCount: validDeposits.length,
          failedCount: failed.length,
          failureSummary,
        },
        reqUser: req.user,
      });
        try {
      const userIds = [...new Set(validDeposits.map((v) => v.userId.toString()))];
      const users = await User.find({
        _id: { $in: userIds },
        fcmToken: { $exists: true, $ne: null },
      });

      for (const user of users) {
        await sendFirebaseNotification(
          user.fcmToken,
          "Deposit Added 💰",
          `Your account has been credited by Agent ${req.user.name}`,
          { type: "deposit", userId: user._id.toString() }
        );
      }
    } catch (notifyErr) {
      console.error("⚠️ Error sending notifications:", notifyErr.message);
    }

      return {
        total: deposits.length,
        successCount: validDeposits.length,
        failedCount: failed.length,
        failedAccounts: failed,
        successAccounts: allSuccess,
        failureSummary,
      };
      
    }); // end withTransaction

    // 🔥 Send notification to all users whose accounts got deposits
  


    // 📤 Send final response
    res.status(200).json(result);
  } catch (err) {
    await logAudit({
      action: "BULK_CREATE_DEPOSITS_FAILED",
      entityType: "DepositBatch",
      details: { reason: err.message },
      reqUser: req.user,
    });

    console.error("❌ bulkCreateDeposits error:", err);
    next(new Error(err.message || "Bulk deposit creation failed"));
  }
};

// GET /api/deposits/eligible
export const getEligibleAccountsForBulk = async (req, res, next) => {
  try {
    const scope = await getScope(req.user);
    const now = new Date();

    // Pagination setup
    const page = parseInt(req.query.page) || 1;
    const limit = 50;
    const skip = (page - 1) * limit;

    // 🔹 Scope filter
    let accountFilter = {};
    if (!scope.isAll) {
      if (req.user.role === "Manager") {
        accountFilter.assignedAgent = { $in: scope.agents };
      } else if (req.user.role === "Agent") {
        accountFilter.assignedAgent = req.user.id;
      } else if (req.user.role === "User") {
        accountFilter.userId = req.user.id;
      }
    }

    // 🔹 Search and filters from query
    const { search, status, schemeType } = req.query;

    if (search) {
      accountFilter.$or = [
        { clientName: new RegExp(search, "i") },
        { accountNumber: new RegExp(search, "i") },
      ];
    }

    if (status) {
      accountFilter.status = status;
    }

    if (schemeType) {
      accountFilter.schemeType = schemeType;
    }

    // 🔹 Count total filtered records first
    const totalAccounts = await Account.countDocuments(accountFilter);

    // 🔹 Fetch paginated filtered accounts
    const accounts = await Account.find(accountFilter)
      .populate("userId", "name")
      .skip(skip)
      .limit(limit)
      .lean();

    // Date ranges
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // Split by payment mode
    const dailyIds = [];
    const monthlyIds = [];
    const yearlyIds = [];

    for (const acc of accounts) {
      if (acc.status === "Matured" || acc.isFullyPaid) continue;
      if (acc.paymentMode === "Daily") dailyIds.push(acc._id);
      else if (acc.paymentMode === "Monthly") monthlyIds.push(acc._id);
      else if (acc.paymentMode === "Yearly") yearlyIds.push(acc._id);
    }

    // Batch deposit fetch
    const [dailyDeposits, monthlyDeposits, yearlyDeposits] = await Promise.all([
      dailyIds.length
        ? Deposit.find({
            accountId: { $in: dailyIds },
            date: { $gte: startOfDay, $lte: endOfDay },
          })
            .select("accountId")
            .lean()
        : [],
      monthlyIds.length
        ? Deposit.find({
            accountId: { $in: monthlyIds },
            date: { $gte: startOfMonth, $lte: endOfMonth },
          })
            .select("accountId")
            .lean()
        : [],
      yearlyIds.length
        ? Deposit.find({
            accountId: { $in: yearlyIds },
          })
            .select("accountId")
            .lean()
        : [],
    ]);

    const dailyMap = new Set(dailyDeposits.map((d) => d.accountId.toString()));
    const monthlyMap = new Set(monthlyDeposits.map((d) => d.accountId.toString()));
    const yearlyMap = new Set(yearlyDeposits.map((d) => d.accountId.toString()));

    // Eligibility check
    const eligible = accounts.filter((acc) => {
      if (acc.status === "Matured" || acc.isFullyPaid) return false;
      if (acc.paymentMode === "Daily") return !dailyMap.has(acc._id.toString());
      if (acc.paymentMode === "Monthly") return !monthlyMap.has(acc._id.toString());
      if (acc.paymentMode === "Yearly") return !yearlyMap.has(acc._id.toString());
      return false;
    });

    const totalPages = Math.ceil(totalAccounts / limit);

    res.json({
      currentPage: page,
      totalPages,
      totalAccounts,
      perPage: limit,
      eligibleCount: eligible.length,
      eligibleAccounts: eligible,
    });
  } catch (err) {
    console.error("Error in getEligibleAccountsForBulk:", err);
    next(err);
  }
};



