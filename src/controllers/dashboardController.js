import mongoose from "mongoose";
import User from "../models/User.js";
import Account from "../models/Account.js";
import Deposit from "../models/Deposit.js";
import { getScope } from "../utils/scopeHelper.js";
import { getDateFilter } from "../utils/dateFilter.js";
import { getMonthRange } from "../utils/timezone.js";
import { notificationService } from "../services/notificationService.js";

export const getDashboardOverview = async (req, res, next) => {
  try {
    const scope = await getScope(req.user);

    // Time ranges
    const { start: thisMonthStart, end: thisMonthEnd } = getMonthRange(0);
    const { start: lastMonthStart, end: lastMonthEnd } = getMonthRange(-1);

    // Base filters
    let userFilter = {
      role: "User", requestStatus: "Approved", companyId: new mongoose.Types.ObjectId(req.user.companyId)
    };
    let accountFilter = {
      companyId: new mongoose.Types.ObjectId(req.user.companyId)
    };
    let depositFilter = {
      companyId: new mongoose.Types.ObjectId(req.user.companyId)
    };

    if (!scope.isAll) {
      switch (req.user.role) {
        case "Manager":
          userFilter._id = { $in: scope.clients };
          accountFilter.assignedAgent = { $in: scope.agents };
          depositFilter.collectedBy = { $in: scope.agents };
          break;
        case "Agent":
          userFilter._id = { $in: scope.clients };
          accountFilter.assignedAgent = req.user.id;
          depositFilter.collectedBy = req.user.id;
          break;
        case "User":
          userFilter._id = req.user.id;
          accountFilter.userId = req.user.id;
          depositFilter.userId = req.user.id;
          break;
      }
    }

    // ---------------- HELPERS ----------------
    const countWithRange = (model, filter, field, start, end) =>
      model.countDocuments({ ...filter, [field]: { $gte: start, $lte: end } });

    // ---------------- USERS ----------------
    const [totalUsers, usersThisMonth, usersLastMonth] = await Promise.all([
      User.countDocuments(userFilter),
      countWithRange(User, userFilter, "createdAt", thisMonthStart, thisMonthEnd),
      countWithRange(User, userFilter, "createdAt", lastMonthStart, lastMonthEnd),
    ]);
    const userGrowth = Math.max(0, usersThisMonth - usersLastMonth);

    // ---------------- ACCOUNTS ----------------
    const [totalAccounts, accountsThisMonth, accountsLastMonth] = await Promise.all([
      Account.countDocuments(accountFilter),
      countWithRange(Account, accountFilter, "createdAt", thisMonthStart, thisMonthEnd),
      countWithRange(Account, accountFilter, "createdAt", lastMonthStart, lastMonthEnd),
    ]);
    const accountGrowth = Math.max(0, accountsThisMonth - accountsLastMonth);

    // ---------------- DEPOSITS ----------------
    const [totalDeposits, depositsThisMonth, depositsLastMonth] = await Promise.all([
      Deposit.countDocuments(depositFilter),
      countWithRange(Deposit, depositFilter, "date", thisMonthStart, thisMonthEnd),
      countWithRange(Deposit, depositFilter, "date", lastMonthStart, lastMonthEnd),
    ]);

    // Month-over-month growth (no negatives)
    const depositGrowth = Math.max(0, depositsThisMonth - depositsLastMonth);
    const testCount = await Deposit.countDocuments(depositFilter);
    console.log("Count:", testCount);

    const testAgg = await Deposit.aggregate([
      { $match: depositFilter },
      { $group: { _id: null, totalBalance: { $sum: "$amount" } } }
    ]);
    console.log("Agg:", testAgg);
    // ---------------- BALANCE (optimized single agg) ----------------
    const agg = await Deposit.aggregate([
      { $match: depositFilter },
      {
        $group: {
          _id: null,
          totalBalance: { $sum: "$amount" },
          balanceThisMonth: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ["$date", thisMonthStart] }, { $lte: ["$date", thisMonthEnd] }] },
                "$amount",
                0,
              ],
            },
          },
          balanceLastMonth: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ["$date", lastMonthStart] }, { $lte: ["$date", lastMonthEnd] }] },
                "$amount",
                0,
              ],
            },
          },
        },
      },
    ]);

    const totalBalance = agg[0]?.totalBalance || 0;
    const balanceThisMonth = agg[0]?.balanceThisMonth || 0;
    const balanceLastMonth = agg[0]?.balanceLastMonth || 0;

    let balanceGrowth = 0;
    if (balanceLastMonth > 0) {
      balanceGrowth = Math.max(
        0,
        ((balanceThisMonth - balanceLastMonth) / balanceLastMonth) * 100
      );
    } else if (balanceThisMonth > 0) {
      balanceGrowth = 100;
    }


    // ---------------- RESPONSE ----------------
    const result = {
      totalUsers,
      userGrowth, // absolute number difference
      totalAccounts,
      accountGrowth, // absolute number difference
      totalDeposits,
      depositGrowth, // absolute number difference
      totalBalance,
      balanceGrowth: parseFloat(balanceGrowth.toFixed(2)), // percentage
    };

    // Optional: send a completion notification for a dashboard refresh
    if (req.query.refresh === "true") {
      try {
        await notificationService.send({
          title: "Dashboard Refresh Complete",
          message: `Your dashboard refresh completed successfully.`,
          type: "success",
          recipientIds: [req.user.id],
          data: { module: "dashboard", dashboardName: req.query.name || "Main" }
        });
      } catch (e) {
        console.error("Notification (dashboard refresh) failed:", e?.message || e);
      }
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
};

// Recent Activity
export const getRecentActivity = async (req, res, next) => {
  try {
    const scope = await getScope(req.user);

    // ✅ Calculate date 7 days ago
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // ✅ Base filters for the last 7 days
    let userFilter = {
      companyId: req.user.companyId,
      createdAt: { $gte: sevenDaysAgo }
    };

    let accountFilter = {
      companyId: req.user.companyId,
      createdAt: { $gte: sevenDaysAgo }
    };

    let depositFilter = {
      companyId: req.user.companyId,
      createdAt: { $gte: sevenDaysAgo }
    };

    // ✅ Role-based filtering
    if (!scope.isAll) {
      if (req.user.role === "Manager") {
        userFilter._id = { $in: [...scope.agents, ...scope.clients] };
        accountFilter.assignedAgent = { $in: scope.agents };
        depositFilter.collectedBy = { $in: scope.agents };
      } else if (req.user.role === "Agent") {
        userFilter._id = { $in: scope.clients };
        accountFilter.assignedAgent = req.user.id;
        depositFilter.collectedBy = req.user.id;
      } else if (req.user.role === "User") {
        userFilter._id = req.user.id;
        accountFilter.userId = req.user.id;
        depositFilter.userId = req.user.id;
      }
    }

    const events = [];

    // ✅ Get users (created/updated in last 7 days)
    const users = await User.find(userFilter)
      .sort({ updatedAt: -1 })
      .limit(3);

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

    // ✅ Get accounts (created in last 7 days)
    const accounts = await Account.find(accountFilter)
      .sort({ createdAt: -1 })
      .limit(3);

    accounts.forEach(a => {
      events.push({
        type: "Account Opened",
        message: `${a.schemeType} account for ${a.clientName}`,
        date: a.createdAt
      });
    });

    // ✅ Get deposits (created in last 7 days)
    const deposits = await Deposit.find(depositFilter)
      .sort({ createdAt: -1 })
      .limit(3)
      .populate("collectedBy", "name");

    deposits.forEach(d => {
      events.push({
        type: "Deposit",
        message: `₹${d.amount.toLocaleString()} collected by ${d.collectedBy?.name || "Agent"}`,
        date: d.createdAt
      });
    });

    // ✅ Combine, sort, and return latest 5
    events.sort((a, b) => b.date - a.date);
    res.json(events.slice(0, 5));
  } catch (err) {
    next(err);
  }
};

// Agent Performance (Upgraded: includes today, month, and custom range via from/to)
export const getAgentPerformance = async (req, res, next) => {
  try {
    const scope = await getScope(req.user);

    if (req.user.role === "Agent" || req.user.role === "User") {
      return res.status(403).json({ error: "Not authorized to view agent performance" });
    }

    const now = new Date();
    const { from, to } = req.query;

    // ✅ Today’s range
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    // ✅ This month’s range
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // ✅ Custom range (from/to query)
    let rangeFilter = {};
    if (from && to) {
      rangeFilter = { date: { $gte: new Date(from), $lt: new Date(to) } };
    }

    // Base filter (manager scope)
    let baseFilter = { ...rangeFilter };
    if (!scope.isAll) {
      baseFilter.collectedBy = { $in: scope.agents };
    }

    // 🟢 Total deposits (all-time OR custom from/to)
    const totalData = await Deposit.aggregate([
      { $match: baseFilter },
      {
        $group: {
          _id: "$collectedBy",
          totalDeposits: { $sum: 1 },
          totalAmount: { $sum: "$amount" }
        }
      }
    ]);

    // 🟢 Today’s deposits
    const todayData = await Deposit.aggregate([
      { $match: { ...baseFilter, date: { $gte: startOfDay, $lt: endOfDay } } },
      { $group: { _id: "$collectedBy", todayAmount: { $sum: "$amount" } } }
    ]);

    // 🟢 This month’s deposits
    const monthData = await Deposit.aggregate([
      { $match: { ...baseFilter, date: { $gte: startOfMonth, $lt: endOfMonth } } },
      { $group: { _id: "$collectedBy", monthAmount: { $sum: "$amount" } } }
    ]);

    // 🟢 Fetch only manager’s agents
    const agents = await User.find(
      scope.isAll ? { role: "Agent" } : { _id: { $in: scope.agents }, role: "Agent" }
    ).select("name");

    // 🟢 Merge results
    const summary = agents.map(agent => {
      const id = agent._id.toString();
      const total = totalData.find(d => d._id?.toString() === id);
      const today = todayData.find(d => d._id?.toString() === id);
      const month = monthData.find(d => d._id?.toString() === id);

      return {
        agentId: id,
        agent: agent.name,
        totalDeposits: total?.totalDeposits || 0,
        totalAmount: total?.totalAmount || 0,
        todayAmount: today?.todayAmount || 0,
        monthAmount: month?.monthAmount || 0
      };
    });

    res.json(summary);
  } catch (err) {
    next(err);
  }
};

// Scheme Summary
export const getSchemeSummary = async (req, res, next) => {
  try {
    const scope = await getScope(req.user);
    const { from, to } = req.query;
    const accountDateFilter = getDateFilter(from, to);

    let filter = { ...accountDateFilter, companyId: req.user.companyId };
    if (!scope.isAll) {
      if (req.user.role === "Manager") {
        filter.assignedAgent = { $in: scope.agents };
      } else if (req.user.role === "Agent") {
        filter.assignedAgent = req.user.id;
      } else if (req.user.role === "User") {
        filter.userId = req.user.id;
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
