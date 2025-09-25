import User from "../models/User.js";
import Account from "../models/Account.js";
import Deposit from "../models/Deposit.js";
import { getScope } from "../utils/scopeHelper.js";
import { getDateFilter } from "../utils/dateFilter.js";

// Dashboard Overview
export const getDashboardOverview = async (req, res, next) => {
  try {
    const scope = await getScope(req.user);
    const { from, to } = req.query;
    const dateFilter = getDateFilter(from, to);

    let userFilter = { ...dateFilter, role: "User" };
    let accountFilter = { ...dateFilter };
    let depositFilter = { ...getDateFilter(from, to, "date") };

    if (!scope.isAll) {
      if (req.user.role === "Manager") {
        userFilter._id = { $in: scope.clients };
        accountFilter.assignedAgent = { $in: scope.agents };
        depositFilter.collectedBy = { $in: scope.agents };
      } else if (req.user.role === "Agent") {
        userFilter._id = { $in: scope.clients };
        accountFilter.assignedAgent = req.user._id;
        depositFilter.collectedBy = req.user._id;
      } else if (req.user.role === "User") {
        userFilter._id = req.user._id;
        accountFilter.userId = req.user._id;
        depositFilter.userId = req.user._id;
      }
    }

    const totalUsers = await User.countDocuments(userFilter);
    const totalAccounts = await Account.countDocuments(accountFilter);
    const totalDeposits = await Deposit.countDocuments(depositFilter);

    const agg = await Deposit.aggregate([
      { $match: depositFilter },
      { $group: { _id: null, totalBalance: { $sum: "$amount" } } }
    ]);
    const totalBalance = agg.length > 0 ? agg[0].totalBalance : 0;

    res.json({ totalUsers, totalAccounts, totalDeposits, totalBalance });
  } catch (err) {
    next(err);
  }
};

// Recent Activity
export const getRecentActivity = async (req, res, next) => {
  try {
    const scope = await getScope(req.user);
    const { from, to } = req.query;
    const userDateFilter = getDateFilter(from, to);
    const accountDateFilter = getDateFilter(from, to);
    const depositDateFilter = getDateFilter(from, to, "date");

    let userFilter = { ...userDateFilter };
    let accountFilter = { ...accountDateFilter };
    let depositFilter = { ...depositDateFilter };

    if (!scope.isAll) {
      if (req.user.role === "Manager") {
        userFilter._id = { $in: [...scope.agents, ...scope.clients] };
        accountFilter.assignedAgent = { $in: scope.agents };
        depositFilter.collectedBy = { $in: scope.agents };
      } else if (req.user.role === "Agent") {
        userFilter._id = { $in: scope.clients };
        accountFilter.assignedAgent = req.user._id;
        depositFilter.collectedBy = req.user._id;
      } else if (req.user.role === "User") {
        userFilter._id = req.user._id;
        accountFilter.userId = req.user._id;
        depositFilter.userId = req.user._id;
      }
    }

    const events = [];

    const users = await User.find(userFilter).sort({ updatedAt: -1 }).limit(3);
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

    const accounts = await Account.find(accountFilter).sort({ createdAt: -1 }).limit(3);
    accounts.forEach(a => {
      events.push({
        type: "Account Opened",
        message: `${a.schemeType} account for ${a.clientName}`,
        date: a.createdAt
      });
    });

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

    let filter = { ...accountDateFilter };
    if (!scope.isAll) {
      if (req.user.role === "Manager") {
        filter.assignedAgent = { $in: scope.agents };
      } else if (req.user.role === "Agent") {
        filter.assignedAgent = req.user._id;
      } else if (req.user.role === "User") {
        filter.userId = req.user._id;
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
