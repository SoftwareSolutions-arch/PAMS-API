import Account from "../models/Account.js";
import User from "../models/User.js";
import Deposit from "../models/Deposit.js";
import { getScope } from "../utils/scopeHelper.js";
import { generateAccountNumber } from "../utils/accountHelper.js";

// GET Accounts with role-based filtering
// GET Accounts with role-based filtering + query params + populate
export const getAccounts = async (req, res, next) => {
  try {
    const scope = await getScope(req.user);

    let filter = {};

    // Role-based scope filtering
    if (!scope.isAll) {
      if (req.user.role === "Manager") {
        filter = { assignedAgent: { $in: scope.agents } };
      } else if (req.user.role === "Agent") {
        filter = { assignedAgent: req.user._id };
      } else if (req.user.role === "User") {
        filter = { userId: req.user._id };
      }
    }

    // Extra filters from query params
    if (req.query.paymentMode) {
      filter.paymentMode = req.query.paymentMode; // e.g. ?paymentMode=Daily
    }

    if (req.query.status) {
      filter.status = req.query.status; // e.g. ?status=Active
    }

    if (req.query.schemeType) {
      filter.schemeType = req.query.schemeType; // e.g. ?schemeType=RD
    }

    // Fetch accounts with related details
    const accounts = await Account.find(filter)
      .populate("userId", "name email") // show client info
      .populate("assignedAgent", "name email"); // show agent info

    res.json(accounts);
  } catch (err) {
    next(err);
  }
};

// CREATE Account with role and scope checks
export const createAccount = async (req, res, next) => {
  try {
    const {
      clientName,
      schemeType,
      userId,
      assignedAgent,
      durationMonths,
      paymentMode,
      installmentAmount,
      dailyDepositAmount,
      monthlyTarget,
      yearlyAmount, // only for Yearly

      // ✅ New fields
      aadharCardNumber,
      panNumber,
      clientImage,
      nomineeName,
      nomineeRelation,
      remarks,
      lastPaymentDate,
      clientSignature
    } = req.body;

    // 1. Validation: Client must exist
    const client = await User.findById(userId);
    if (!client || client.role !== "User") {
      res.status(400);
      throw new Error("Invalid client");
    }

    // 2. Duration validation
    if (!durationMonths || durationMonths <= 0) {
      res.status(400);
      throw new Error("Duration (in months) is required");
    }

    // 3. Payment mode validation
    if (!["Yearly", "Monthly", "Daily"].includes(paymentMode)) {
      res.status(400);
      throw new Error("Payment mode must be Yearly, Monthly or Daily");
    }

    let totalPayableAmount = 0;

    if (paymentMode === "Yearly") {
      if (!yearlyAmount || yearlyAmount <= 0) {
        res.status(400);
        throw new Error("Yearly accounts require a valid yearlyAmount");
      }
      totalPayableAmount = yearlyAmount;
    }

    if (paymentMode === "Monthly") {
      if (!installmentAmount || installmentAmount <= 0) {
        res.status(400);
        throw new Error("Monthly accounts require a valid installmentAmount");
      }
      totalPayableAmount = installmentAmount * durationMonths;
    }

    if (paymentMode === "Daily") {
      if (!dailyDepositAmount || dailyDepositAmount <= 0) {
        res.status(400);
        throw new Error("Daily accounts require a valid dailyDepositAmount");
      }
      if (!monthlyTarget || monthlyTarget <= 0) {
        // auto-calc monthlyTarget from dailyDepositAmount if not provided
        monthlyTarget = dailyDepositAmount * 30;
      }
      totalPayableAmount = monthlyTarget * durationMonths;
    }

    // 4. Calculate maturity date
    const maturityDate = new Date();
    maturityDate.setMonth(maturityDate.getMonth() + durationMonths);

    // 5. Role-based validation
    if (req.user.role === "Admin") {
      const agent = await User.findById(assignedAgent);
      if (!agent || agent.role !== "Agent") {
        res.status(400);
        throw new Error("Account must be assigned to a valid Agent");
      }
      if (client.assignedTo.toString() !== assignedAgent.toString()) {
        res.status(400);
        throw new Error("This user does not belong to the assigned Agent");
      }
    }

    if (req.user.role === "Manager") {
      const agent = await User.findOne({
        _id: assignedAgent,
        role: "Agent",
        assignedTo: req.user._id
      });
      if (!agent) {
        res.status(403);
        throw new Error("You can only assign accounts to your own agents");
      }
      if (client.assignedTo.toString() !== assignedAgent.toString()) {
        res.status(400);
        throw new Error("This user does not belong to the selected Agent");
      }
    }

    if (req.user.role === "Agent") {
      if (assignedAgent.toString() !== req.user._id.toString()) {
        res.status(403);
        throw new Error("Agent can only assign accounts to themselves");
      }
      if (client.assignedTo.toString() !== req.user._id.toString()) {
        res.status(400);
        throw new Error("This user does not belong to you");
      }
    }

    const accountNumber = await generateAccountNumber(paymentMode);

    // 6. Create account (with calculated total + new fields)
    const account = new Account({
      clientName,
      accountNumber,
      schemeType,
      balance: 0,
      userId,
      assignedAgent,
      durationMonths,
      maturityDate,
      paymentMode,
      yearlyAmount: paymentMode === "Yearly" ? yearlyAmount : null,
      installmentAmount: paymentMode === "Monthly" ? installmentAmount : null,
      dailyDepositAmountAmount: paymentMode === "Daily" ? dailyDepositAmount : null,
      monthlyTarget: paymentMode === "Daily" ? monthlyTarget : null,
      totalPayableAmount,
      isFullyPaid: paymentMode === "Yearly" ? false : undefined,
      status: "Active",
      // ✅ New fields 
      aadharCardNumber,
      panNumber,
      clientImage,
      nomineeName,
      nomineeRelation,
      remarks,
      lastPaymentDate,
      clientSignature
    });

    await account.save();
    res.status(201).json({ message: "Account created successfully", account });
  } catch (err) {
    next(err);
  }
};

// UPDATE Account with role and scope checks
export const updateAccount = async (req, res, next) => {
  try {
    const account = await Account.findById(req.params.id);
    if (!account) {
      res.status(404);
      throw new Error("Account not found");
    }

    const {
      userId,
      assignedAgent,
      durationMonths,
      status,
      paymentMode,
      installmentAmount,
      monthlyTarget
    } = req.body;

    // -------- Role-based checks --------
    if (req.user.role === "Manager") {
      const scope = await getScope(req.user);
      if (!scope.agents.includes(account.assignedAgent.toString())) {
        res.status(403);
        throw new Error("Not authorized to update this account");
      }
      if (assignedAgent && !scope.agents.includes(assignedAgent.toString())) {
        res.status(403);
        throw new Error("You can only reassign accounts to your own agents");
      }
      if (userId && assignedAgent) {
        const client = await User.findById(userId);
        if (
          !client ||
          client.role !== "User" ||
          client.assignedTo.toString() !== assignedAgent.toString()
        ) {
          res.status(400);
          throw new Error("Invalid user assignment for this agent");
        }
      }
    }

    if (req.user.role === "Admin") {
      if (assignedAgent) {
        const agent = await User.findById(assignedAgent);
        if (!agent || agent.role !== "Agent") {
          res.status(400);
          throw new Error("assignedAgent must be a valid Agent");
        }
      }
      if (userId) {
        const client = await User.findById(userId);
        if (!client || client.role !== "User") {
          res.status(400);
          throw new Error("userId must be a valid User");
        }
        if (
          assignedAgent &&
          client.assignedTo.toString() !== assignedAgent.toString()
        ) {
          res.status(400);
          throw new Error("This user does not belong to the assigned Agent");
        }
      }
    }

    // -------- Duration update --------
    if (durationMonths && durationMonths > 0) {
      const maturityDate = new Date();
      maturityDate.setMonth(maturityDate.getMonth() + durationMonths);
      account.durationMonths = durationMonths;
      account.maturityDate = maturityDate;
    }

    // -------- Status update --------
    if (status) {
      if (!["Active", "OnTrack", "Pending", "Matured", "Closed"].includes(status)) {
        res.status(400);
        throw new Error("Invalid status");
      }
      account.status = status;
    }

    // -------- Payment Mode --------
    if (paymentMode) {
      if (!["Yearly", "Monthly", "Daily"].includes(paymentMode)) {
        res.status(400);
        throw new Error("Invalid paymentMode");
      }
      account.paymentMode = paymentMode;

      if (paymentMode === "Monthly") {
        if (!installmentAmount || installmentAmount <= 0) {
          res.status(400);
          throw new Error("Monthly accounts require a valid installmentAmount");
        }
        account.installmentAmount = installmentAmount;
        account.monthlyTarget = undefined;
        account.isFullyPaid = undefined;

        // recalc total payable
        account.totalPayableAmount = installmentAmount * account.durationMonths;
        account.yearlyAmount = undefined;
      }

      if (paymentMode === "Daily") {
        if (!monthlyTarget || monthlyTarget <= 0) {
          res.status(400);
          throw new Error("Daily accounts require a valid monthlyTarget");
        }
        account.monthlyTarget = monthlyTarget;
        account.installmentAmount = undefined;
        account.isFullyPaid = undefined;

        // recalc total payable
        account.totalPayableAmount = monthlyTarget * account.durationMonths;
        account.yearlyAmount = undefined;
      }

      if (paymentMode === "Yearly") {
        if (!req.body.yearlyAmount || req.body.yearlyAmount <= 0) {
          res.status(400);
          throw new Error("Yearly accounts require a valid yearlyAmount");
        }
        account.yearlyAmount = req.body.yearlyAmount;
        account.isFullyPaid = account.isFullyPaid || false;
        account.installmentAmount = undefined;
        account.monthlyTarget = undefined;

        // recalc total payable
        account.totalPayableAmount = req.body.yearlyAmount;
      }
    }

    // -------- Save final update --------
    await account.save();

    res.json({ message: "Account updated successfully", account });
  } catch (err) {
    next(err);
  }
};

// DELETE Account with balance adjustment
export const deleteAccount = async (req, res, next) => {
  try {
    const account = await Account.findById(req.params.id);
    if (!account) {
      res.status(404);
      throw new Error("Account not found");
    }

    if (req.user.role !== "Admin") {
      res.status(403);
      throw new Error("Only Admin can delete accounts");
    }

    await Deposit.deleteMany({ accountId: account._id });
    await account.deleteOne();

    res.json({ message: "Account and related deposits deleted successfully" });
  } catch (err) {
    next(err);
  }
};

// GET Account by Account Number with role and scope checks
export const getAccountByNumber = async (req, res, next) => {
  try {
    const { accountNumber } = req.params;

    // Scope check
    const scope = await getScope(req.user);

    let filter = { accountNumber };
    if (!scope.isAll) {
      if (req.user.role === "Manager") {
        filter.assignedAgent = { $in: scope.agents };
      } else if (req.user.role === "Agent") {
        filter.assignedAgent = req.user._id;
      } else if (req.user.role === "User") {
        filter.userId = req.user._id;
      }
    }

    const account = await Account.findOne(filter);
    if (!account) {
      res.status(404);
      throw new Error("Account not found or not accessible");
    }

    res.json(account);
  } catch (err) {
    next(err);
  }
};
