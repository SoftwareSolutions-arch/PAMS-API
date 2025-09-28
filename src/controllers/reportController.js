
import dayjs from "dayjs";
import User from "../models/User.js";
import Account from "../models/Account.js";
import Deposit from "../models/Deposit.js";
import { getScope } from "../utils/scopeHelper.js";

// Helper to determine effective scope based on query params
const getEffectiveScope = async (reqUser, managerId, agentId) => {
  if (reqUser.role === "Admin" && managerId) {
    const manager = await User.findById(managerId);
    if (!manager || manager.role !== "Manager") {
      throw new Error("Invalid Manager ID");
    }
    return await getScope(manager);
  }

  if ((reqUser.role === "Admin" || reqUser.role === "Manager") && agentId) {
    const agent = await User.findById(agentId);
    if (!agent || agent.role !== "Agent") {
      throw new Error("Invalid Agent ID");
    }

    if (reqUser.role === "Manager" && agent.assignedTo.toString() !== reqUser._id.toString()) {
      throw new Error("This agent does not belong to you");
    }

    return await getScope(agent);
  }

  return await getScope(reqUser);
};

// Overview Stats - Users, Accounts, Deposits
// src/controllers/reportController.js

// Helpers
const getMonthRange = (offset = 0) => ({
  start: dayjs().add(offset, "month").startOf("month").toDate(),
  end: dayjs().add(offset, "month").endOf("month").toDate(),
});
const getWeekRange = (offset = 0) => ({
  start: dayjs().add(offset, "week").startOf("week").toDate(),
  end: dayjs().add(offset, "week").endOf("week").toDate(),
});

export const getOverview = async (req, res, next) => {
  try {
    const scope = await getEffectiveScope(req.user, req.query.managerId, req.query.agentId);

    const { from, to } = req.query;

    let userFilter = { role: "User" };
    let accountFilter = {};
    let depositFilter = {};

    if (!scope.isAll) {
      if (req.user.role === "Manager" || req.query.managerId) {
        userFilter._id = { $in: scope.clients };
        accountFilter.assignedAgent = { $in: scope.agents };
        depositFilter.collectedBy = { $in: scope.agents };
      } else if (req.user.role === "Agent" || req.query.agentId) {
        userFilter._id = { $in: scope.clients };
        accountFilter.assignedAgent = req.user._id;
        depositFilter.collectedBy = req.user._id;
      } else if (req.user.role === "User") {
        userFilter._id = req.user._id;
        accountFilter.userId = req.user._id;
        depositFilter.userId = req.user._id;
      }
    }

    let totalUsers = 0,
        totalAccounts = 0,
        totalDeposits = 0,
        totalAmount = 0,
        userGrowth = 0,
        accountGrowth = 0,
        depositGrowth = 0,
        balanceGrowth = 0;

    if (from || to) {
      // ✅ CASE 2: Custom date range
      const rangeFilterUsers = {
        ...userFilter,
        createdAt: {
          ...(from ? { $gte: new Date(from) } : {}),
          ...(to ? { $lte: new Date(to) } : {}),
        },
      };
      const rangeFilterAccounts = {
        ...accountFilter,
        createdAt: {
          ...(from ? { $gte: new Date(from) } : {}),
          ...(to ? { $lte: new Date(to) } : {}),
        },
      };
      const rangeFilterDeposits = {
        ...depositFilter,
        date: {
          ...(from ? { $gte: new Date(from) } : {}),
          ...(to ? { $lte: new Date(to) } : {}),
        },
      };

      totalUsers = await User.countDocuments(rangeFilterUsers);
      totalAccounts = await Account.countDocuments(rangeFilterAccounts);
      totalDeposits = await Deposit.countDocuments(rangeFilterDeposits);

      const agg = await Deposit.aggregate([
        { $match: rangeFilterDeposits },
        { $group: { _id: null, totalAmount: { $sum: "$amount" } } },
      ]);
      totalAmount = agg.length > 0 ? agg[0].totalAmount : 0;

      // Growth for custom range → just return totals as growth (since range is fixed window)
      userGrowth = totalUsers;
      accountGrowth = totalAccounts;
      depositGrowth = totalDeposits;
      balanceGrowth = 0; // Optional: ya phir ((end-start)/start)*100 agar tumhe percentage chaiye
    } else {
      // ✅ CASE 1: Default calendar-based logic
      const { start: thisMonthStart, end: thisMonthEnd } = getMonthRange(0);
      const { start: lastMonthStart, end: lastMonthEnd } = getMonthRange(-1);
      const { start: thisWeekStart, end: thisWeekEnd } = getWeekRange(0);
      const { start: lastWeekStart, end: lastWeekEnd } = getWeekRange(-1);

      totalUsers = await User.countDocuments(userFilter);
      const usersThisMonth = await User.countDocuments({
        ...userFilter,
        createdAt: { $gte: thisMonthStart, $lte: thisMonthEnd },
      });
      const usersLastMonth = await User.countDocuments({
        ...userFilter,
        createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
      });
      userGrowth = usersThisMonth - usersLastMonth;

      totalAccounts = await Account.countDocuments(accountFilter);
      const accountsThisMonth = await Account.countDocuments({
        ...accountFilter,
        createdAt: { $gte: thisMonthStart, $lte: thisMonthEnd },
      });
      const accountsLastMonth = await Account.countDocuments({
        ...accountFilter,
        createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
      });
      accountGrowth = accountsThisMonth - accountsLastMonth;

      totalDeposits = await Deposit.countDocuments(depositFilter);
      const depositsThisWeek = await Deposit.countDocuments({
        ...depositFilter,
        date: { $gte: thisWeekStart, $lte: thisWeekEnd },
      });
      const depositsLastWeek = await Deposit.countDocuments({
        ...depositFilter,
        date: { $gte: lastWeekStart, $lte: lastWeekEnd },
      });
      depositGrowth = Math.abs(depositsThisWeek - depositsLastWeek);

      const agg = await Deposit.aggregate([
        { $match: depositFilter },
        { $group: { _id: null, totalAmount: { $sum: "$amount" } } },
      ]);
      totalAmount = agg.length > 0 ? agg[0].totalAmount : 0;

      const balanceThisMonthAgg = await Deposit.aggregate([
        { $match: { ...depositFilter, date: { $gte: thisMonthStart, $lte: thisMonthEnd } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]);
      const balanceLastMonthAgg = await Deposit.aggregate([
        { $match: { ...depositFilter, date: { $gte: lastMonthStart, $lte: lastMonthEnd } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]);

      const balanceThisMonth = balanceThisMonthAgg[0]?.total || 0;
      const balanceLastMonth = balanceLastMonthAgg[0]?.total || 0;

      if (balanceLastMonth > 0) {
        balanceGrowth = ((balanceThisMonth - balanceLastMonth) / balanceLastMonth) * 100;
      } else if (balanceThisMonth > 0) {
        balanceGrowth = 100;
      }
    }

    res.json({
      totalUsers,
      userGrowth,
      totalAccounts,
      accountGrowth,
      totalDeposits,
      depositGrowth,
      totalAmount,
      balanceGrowth: parseFloat(balanceGrowth.toFixed(2)),
    });
  } catch (err) {
    next(err);
  }
};

// Scheme Distribution (Count by schemeType)
export const getSchemes = async (req, res, next) => {
  try {
    const scope = await getEffectiveScope(req.user, req.query.managerId, req.query.agentId);

    let filter = {};
    if (!scope.isAll) {
      if (req.user.role === "Manager" || req.query.managerId) {
        filter = { assignedAgent: { $in: scope.agents } };
      } else if (req.user.role === "Agent" || req.query.agentId) {
        filter = { assignedAgent: req.user._id };
      } else if (req.user.role === "User") {
        filter = { userId: req.user._id };
      }
    }

    const schemes = await Account.aggregate([
      { $match: filter },
      { $group: { _id: "$schemeType", count: { $sum: 1 } } }
    ]);

    const formatted = {};
    schemes.forEach(s => (formatted[s._id] = s.count));
    res.json(formatted);
  } catch (err) {
    next(err);
  }
};

// Monthly Performance (Deposits over time)
export const getPerformance = async (req, res, next) => {
  try {
    const scope = await getEffectiveScope(req.user, req.query.managerId, req.query.agentId);

    let filter = {};
    if (!scope.isAll) {
      if (req.user.role === "Manager" || req.query.managerId) {
        filter = { collectedBy: { $in: scope.agents } };
      } else if (req.user.role === "Agent" || req.query.agentId) {
        filter = { collectedBy: req.user._id };
      } else if (req.user.role === "User") {
        filter = { userId: req.user._id };
      }
    }

    const data = await Deposit.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { $substr: ["$date", 0, 7] },
          amount: { $sum: "$amount" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const formatted = data.map(d => ({ month: d._id, amount: d.amount }));
    res.json(formatted);
  } catch (err) {
    next(err);
  }
};

// User Activity (Deposits by user)
export const getUserActivity = async (req, res, next) => {
  try {
    const scope = await getEffectiveScope(req.user, req.query.managerId, req.query.agentId);

    let filter = {};
    if (!scope.isAll) {
      if (req.user.role === "Manager" || req.query.managerId) {
        filter = { collectedBy: { $in: scope.agents } };
      } else if (req.user.role === "Agent" || req.query.agentId) {
        filter = { collectedBy: req.user._id };
      } else {
        return res.json([]);
      }
    }

    const data = await Deposit.aggregate([
      { $match: filter },
      { $group: { _id: "$collectedBy", entries: { $sum: 1 } } }
    ]);

    const users = await User.find({}).select("name");
    const map = {};
    users.forEach(u => (map[u._id.toString()] = u.name));

    const formatted = data.map(d => ({
      user: map[d._id] || d._id,
      entries: d.entries
    }));

    res.json(formatted);
  } catch (err) {
    next(err);
  }
};

// Role Distribution (Count by role)
export const getRoleStats = async (req, res, next) => {
  try {
    const scope = await getEffectiveScope(req.user, req.query.managerId, req.query.agentId);

    let filter = {};
    if (!scope.isAll) {
      if (req.user.role === "Manager" || req.query.managerId) {
        filter = { _id: { $in: [...scope.agents, ...scope.clients] } };
      } else if (req.user.role === "Agent" || req.query.agentId) {
        filter = { _id: { $in: scope.clients } };
      } else if (req.user.role === "User") {
        filter = { _id: req.user._id };
      }
    }

    const data = await User.aggregate([
      { $match: filter },
      { $group: { _id: "$role", count: { $sum: 1 } } }
    ]);

    const formatted = {};
    data.forEach(r => (formatted[r._id] = r.count));
    res.json(formatted);
  } catch (err) {
    next(err);
  }
};

// Recent Activity (Users, Accounts, Deposits)
export const getRecentActivity = async (req, res, next) => {
  try {
    const scope = await getEffectiveScope(req.user, req.query.managerId, req.query.agentId);

    let userFilter = {};
    let accountFilter = {};
    let depositFilter = {};
    if (!scope.isAll) {
      if (req.user.role === "Manager" || req.query.managerId) {
        userFilter = { _id: { $in: [...scope.agents, ...scope.clients] } };
        accountFilter = { assignedAgent: { $in: scope.agents } };
        depositFilter = { collectedBy: { $in: scope.agents } };
      } else if (req.user.role === "Agent" || req.query.agentId) {
        userFilter = { _id: { $in: scope.clients } };
        accountFilter = { assignedAgent: req.user._id };
        depositFilter = { collectedBy: req.user._id };
      } else if (req.user.role === "User") {
        userFilter = { _id: req.user._id };
        accountFilter = { userId: req.user._id };
        depositFilter = { userId: req.user._id };
      }
    }

    const events = [];

    const users = await User.find(userFilter).sort({ updatedAt: -1 }).limit(5);
    users.forEach(u => {
      events.push({
        type: u.createdAt.getTime() === u.updatedAt.getTime() ? "User Created" : "User Updated",
        message:
          u.createdAt.getTime() === u.updatedAt.getTime()
            ? `New ${u.role} ${u.name} added`
            : `${u.role} updated for ${u.name}`,
        date: u.updatedAt
      });
    });

    const accounts = await Account.find(accountFilter).sort({ createdAt: -1 }).limit(5);
    accounts.forEach(a => {
      events.push({
        type: "Account Opened",
        message: `${a.schemeType} account for ${a.clientName}`,
        date: a.createdAt
      });
    });

    const deposits = await Deposit.find(depositFilter)
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("collectedBy", "name");

    deposits.forEach(d => {
      events.push({
        type: "Deposit",
        message: `₹${d.amount.toLocaleString()} collected by ${d.collectedBy?.name || "Agent"}`,
        date: d.createdAt
      });
    });

    events.sort((a, b) => b.date - a.date);
    res.json(events.slice(0, 10));
  } catch (err) {
    next(err);
  }
};

// Deposits Report with Date Range and role/scope filtering
export const getDepositsReport = async (req, res, next) => {
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

    // Fetch deposits
    const deposits = await Deposit.find(filter)
      .populate("accountId", "accountNumber schemeType")
      .populate("collectedBy", "name email");

    // Summary
    const totalAmount = deposits.reduce((sum, d) => sum + d.amount, 0);

    // Monthly chart data
    const monthly = await Deposit.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { $substr: ["$date", 0, 7] }, // YYYY-MM
          amount: { $sum: "$amount" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const monthlyPerformance = monthly.map(m => ({
      month: m._id,
      amount: m.amount
    }));

    res.json({
      range: { from, to },
      summary: {
        totalDeposits: deposits.length,
        totalAmount
      },
      monthlyPerformance,
      deposits
    });
  } catch (err) {
    next(err);
  }
};

// Accounts Report with Date Range and role/scope filtering
export const getAccountsReport = async (req, res, next) => {
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

    // ---------------- Accounts ----------------
    let accountFilter = {
      createdAt: { $gte: fromDate, $lte: toDate }
    };

    if (!scope.isAll) {
      if (req.user.role === "Manager") {
        accountFilter.assignedAgent = { $in: scope.agents };
      } else if (req.user.role === "Agent") {
        accountFilter.assignedAgent = req.user._id;
      } else if (req.user.role === "User") {
        accountFilter.userId = req.user._id;
      }
    }

    const accounts = await Account.find(accountFilter).populate(
      "assignedAgent",
      "name email"
    );

    // Summary
    const totalAccounts = accounts.length;
    const totalTargetAmount = accounts.reduce(
      (sum, a) => sum + (a.totalPayableAmount || 0),
      0
    );
    const totalBalance = accounts.reduce(
      (sum, a) => sum + (a.balance || 0),
      0
    );

    // Scheme Distribution
    const schemeDistribution = {};
    accounts.forEach((a) => {
      schemeDistribution[a.schemeType] =
        (schemeDistribution[a.schemeType] || 0) + 1;
    });

    // Status Distribution
    const statusDistribution = {};
    accounts.forEach((a) => {
      statusDistribution[a.status] =
        (statusDistribution[a.status] || 0) + 1;
    });

    // PaymentMode Breakdown
    const paymentModeBreakdown = {
      Yearly: { count: 0, target: 0, balance: 0, completionRate: "0%" },
      Monthly: { count: 0, target: 0, balance: 0, completionRate: "0%" },
      Daily: { count: 0, target: 0, balance: 0, completionRate: "0%" }
    };

    accounts.forEach((a) => {
      if (!paymentModeBreakdown[a.paymentMode]) return;
      paymentModeBreakdown[a.paymentMode].count++;
      paymentModeBreakdown[a.paymentMode].target += a.totalPayableAmount || 0;
      paymentModeBreakdown[a.paymentMode].balance += a.balance || 0;
    });

    Object.keys(paymentModeBreakdown).forEach((mode) => {
      const { target, balance } = paymentModeBreakdown[mode];
      paymentModeBreakdown[mode].completionRate =
        target > 0 ? ((balance / target) * 100).toFixed(2) + "%" : "0%";
    });

    // Add per-account progress
    const accountsWithProgress = accounts.map((a) => {
      const progress =
        a.totalPayableAmount > 0
          ? ((a.balance / a.totalPayableAmount) * 100).toFixed(2)
          : "0.00";
      return {
        ...a.toObject(),
        progress: `${progress}%`
      };
    });

    // ---------------- Deposit Trend ----------------
    let depositFilter = {
      date: { $gte: fromDate, $lte: toDate }
    };

    if (!scope.isAll) {
      if (req.user.role === "Manager") {
        depositFilter.collectedBy = { $in: scope.agents };
      } else if (req.user.role === "Agent") {
        depositFilter.collectedBy = req.user._id;
      } else if (req.user.role === "User") {
        depositFilter.userId = req.user._id;
      }
    }

    const depositTrend = await Deposit.aggregate([
      { $match: depositFilter },
      {
        $group: {
          _id: {
            year: { $year: "$date" },
            month: { $month: "$date" }
          },
          totalDeposits: { $sum: "$amount" },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);

    // Map trend into readable labels
    const trend = depositTrend.map((t) => ({
      month: `${t._id.year}-${String(t._id.month).padStart(2, "0")}`,
      totalDeposits: t.totalDeposits,
      count: t.count
    }));

    // ---------------- Final Response ----------------
    res.json({
      range: { from, to },
      summary: {
        totalAccounts,
        totalTargetAmount,
        totalBalance,
        completionRate:
          totalTargetAmount > 0
            ? ((totalBalance / totalTargetAmount) * 100).toFixed(2) + "%"
            : "0%"
      },
      schemeDistribution,
      statusDistribution,
      paymentModeBreakdown,
      depositTrend: trend,
      accounts: accountsWithProgress
    });
  } catch (err) {
    next(err);
  }
};

// Users Report with Date Range and role/scope filtering
export const getUsersReport = async (req, res, next) => {
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
      createdAt: { $gte: fromDate, $lte: toDate }
    };

    // Scope restrictions
    if (!scope.isAll) {
      if (req.user.role === "Manager") {
        filter._id = { $in: [...scope.agents, ...scope.clients] };
      } else if (req.user.role === "Agent") {
        filter._id = { $in: scope.clients };
      } else if (req.user.role === "User") {
        filter._id = req.user._id;
      }
    }

    // Fetch users
    const users = await User.find(filter).select("-password");

    // Summary
    const totalUsers = users.length;

    // Role Distribution
    const roleDistribution = {};
    users.forEach(u => {
      roleDistribution[u.role] = (roleDistribution[u.role] || 0) + 1;
    });

    // Status Distribution
    const statusDistribution = { Active: 0, Blocked: 0 };
    users.forEach(u => {
      statusDistribution[u.isBlocked ? "Blocked" : "Active"]++;
    });

    res.json({
      range: { from, to },
      summary: { totalUsers },
      roleDistribution,
      statusDistribution,
      users
    });
  } catch (err) {
    next(err);
  }
};

// controllers/reportController.js
export const getCompletionRates = async (req, res, next) => {
  try {
    const scope = await getEffectiveScope(
      req.user,
      req.query.managerId,
      req.query.agentId
    );

    let filter = {};
    if (!scope.isAll) {
      if (req.user.role === "Manager") {
        filter.assignedAgent = { $in: scope.agents };
      } else if (req.user.role === "Agent") {
        filter.assignedAgent = req.user._id;
      } else if (req.user.role === "User") {
        filter.userId = req.user._id;
      }
    }

    // Aggregate Accounts by paymentMode
    const result = await Account.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$paymentMode", // e.g. "Daily", "Monthly", "Yearly"
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          mode: "$_id",
          _id: 0,
          count: 1,
        },
      },
    ]);

    // Convert into { Daily: X, Monthly: Y, Yearly: Z }
    const completionRates = result.reduce(
      (acc, r) => {
        acc[r.mode] = r.count;
        return acc;
      },
      { Daily: 0, Monthly: 0, Yearly: 0 } // default 0 if missing
    );

    res.json(completionRates);
  } catch (err) {
    next(err);
  }
};


