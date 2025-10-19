
import dayjs from "dayjs";
import User from "../models/User.js";
import Account from "../models/Account.js";
import Deposit from "../models/Deposit.js";
import { getScope } from "../utils/scopeHelper.js";
import { buildFilter } from "../utils/filterHelper.js";
import { Parser as Json2CsvParser } from "json2csv";
import PDFDocument from "pdfkit";

import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import mongoose from "mongoose";

dayjs.extend(utc);
dayjs.extend(timezone);

// Helper to determine effective scope based on query params
const getEffectiveScope = async (reqUser, managerId, agentId) => {
  if (reqUser.role === "Admin" && managerId) {
    const manager = await User.findOne({
      _id: managerId,
      role: "Manager",
      companyId: reqUser.companyId     // ✅ enforce company
    });

    if (!manager) {
      throw new Error("Invalid Manager ID or not in your company");
    }

    return await getScope(manager);
  }

  if ((reqUser.role === "Admin" || reqUser.role === "Manager") && agentId) {
    const agent = await User.findOne({
      _id: agentId,
      role: "Agent",
      companyId: reqUser.companyId     // ✅ enforce company
    });

    if (!agent) {
      throw new Error("Invalid Agent ID or not in your company");
    }

    if (reqUser.role === "Manager" && agent.assignedTo.toString() !== reqUser._id.toString()) {
      throw new Error("This agent does not belong to you");
    }

    return await getScope(agent);
  }

  return await getScope(reqUser); // ✅ already company-aware inside getScope
};

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
    const scope = await getEffectiveScope(
      req.user,
      req.query.managerId,
      req.query.agentId
    );

    const { from, to } = req.query;

    // ✅ build filters with helper
    let userFilter = buildFilter(req, scope, { role: "User" });
    let accountFilter = buildFilter(req, scope);
    let depositFilter = buildFilter(req, scope);

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
      const rangeFilterUsers = buildFilter(req, scope, {
        role: "User",
        createdAt: {
          ...(from ? { $gte: new Date(from) } : {}),
          ...(to ? { $lte: new Date(to) } : {}),
        },
      });

      const rangeFilterAccounts = buildFilter(req, scope, {
        createdAt: {
          ...(from ? { $gte: new Date(from) } : {}),
          ...(to ? { $lte: new Date(to) } : {}),
        },
      });

      const rangeFilterDeposits = buildFilter(req, scope, {
        date: {
          ...(from ? { $gte: new Date(from) } : {}),
          ...(to ? { $lte: new Date(to) } : {}),
        },
      });

      totalUsers = await User.countDocuments(rangeFilterUsers);
      totalAccounts = await Account.countDocuments(rangeFilterAccounts);
      totalDeposits = await Deposit.countDocuments(rangeFilterDeposits);

      const agg = await Deposit.aggregate([
        { $match: rangeFilterDeposits },
        { $group: { _id: null, totalAmount: { $sum: "$amount" } } },
      ]);
      totalAmount = agg.length > 0 ? agg[0].totalAmount : 0;

      // Growth for custom range → just totals
      userGrowth = totalUsers;
      accountGrowth = totalAccounts;
      depositGrowth = totalDeposits;
      balanceGrowth = 0;
    } else {
      // ✅ CASE 1: Default calendar-based logic
      const { start: thisMonthStart, end: thisMonthEnd } = getMonthRange(0);
      const { start: lastMonthStart, end: lastMonthEnd } = getMonthRange(-1);
      const { start: thisWeekStart, end: thisWeekEnd } = getWeekRange(0);
      const { start: lastWeekStart, end: lastWeekEnd } = getWeekRange(-1);

      // ---------------- USERS ----------------
      totalUsers = await User.countDocuments(userFilter);
      const usersThisMonth = await User.countDocuments({
        ...userFilter,
        createdAt: { $gte: thisMonthStart, $lte: thisMonthEnd },
      });
      const usersLastMonth = await User.countDocuments({
        ...userFilter,
        createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
      });
      userGrowth = Math.max(0, usersThisMonth - usersLastMonth);

      // ---------------- ACCOUNTS ----------------
      totalAccounts = await Account.countDocuments(accountFilter);
      const accountsThisMonth = await Account.countDocuments({
        ...accountFilter,
        createdAt: { $gte: thisMonthStart, $lte: thisMonthEnd },
      });
      const accountsLastMonth = await Account.countDocuments({
        ...accountFilter,
        createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
      });
      accountGrowth = Math.max(0, accountsThisMonth - accountsLastMonth);

      // ---------------- DEPOSITS ----------------
      totalDeposits = await Deposit.countDocuments(depositFilter);
      const depositsThisMonth = await Deposit.countDocuments({
        ...depositFilter,
        date: { $gte: thisMonthStart, $lte: thisMonthEnd },
      });
      const depositsLastMonth = await Deposit.countDocuments({
        ...depositFilter,
        date: { $gte: lastMonthStart, $lte: lastMonthEnd },
      });
      depositGrowth = Math.max(0, depositsThisMonth - depositsLastMonth);

      // ---------------- BALANCE ----------------
      // Lifetime balance (overall total)
      const agg = await Deposit.aggregate([
        { $match: depositFilter },
        { $group: { _id: null, totalAmount: { $sum: "$amount" } } },
      ]);
      totalAmount = agg.length > 0 ? agg[0].totalAmount : 0;

      // This month balance
      const balanceThisMonthAgg = await Deposit.aggregate([
        {
          $match: {
            ...depositFilter,
            date: { $gte: thisMonthStart, $lte: thisMonthEnd },
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]);

      // Last month balance
      const balanceLastMonthAgg = await Deposit.aggregate([
        {
          $match: {
            ...depositFilter,
            date: { $gte: lastMonthStart, $lte: lastMonthEnd },
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]);

      const balanceThisMonth = balanceThisMonthAgg[0]?.total || 0;
      const balanceLastMonth = balanceLastMonthAgg[0]?.total || 0;

      // Growth %
      let balanceGrowth = 0;
      if (balanceLastMonth > 0) {
        balanceGrowth = Math.max(
          0,
          ((balanceThisMonth - balanceLastMonth) / balanceLastMonth) * 100
        );
      } else if (balanceThisMonth > 0) {
        balanceGrowth = 100;
      } else {
        balanceGrowth = 0;
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
    const scope = await getEffectiveScope(
      req.user,
      req.query.managerId,
      req.query.agentId
    );

    // ✅ Use buildFilter (ensures companyId + role scope)
    const filter = buildFilter(req, scope);

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
    const scope = await getEffectiveScope(
      req.user,
      req.query.managerId,
      req.query.agentId
    );

    // ✅ Use buildFilter for consistent company + scope filter
    const filter = buildFilter(req, scope);

    const data = await Deposit.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { $substr: ["$date", 0, 7] }, // YYYY-MM format
          amount: { $sum: "$amount" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const formatted = data.map(d => ({
      month: d._id,
      amount: d.amount
    }));

    res.json(formatted);
  } catch (err) {
    next(err);
  }
};

// User Activity (Deposits by user)
export const getUserActivity = async (req, res, next) => {
  try {
    const scope = await getEffectiveScope(
      req.user,
      req.query.managerId,
      req.query.agentId
    );

    // ✅ Deposit filter (company + scope)
    const filter = buildFilter(req, scope);

    // ❌ If role is plain User, no need to return activity
    if (req.user.role === "User" && !scope.isAll) {
      return res.json([]);
    }

    // 🔹 Aggregate deposits per collector
    const data = await Deposit.aggregate([
      { $match: filter },
      { $group: { _id: "$collectedBy", entries: { $sum: 1 } } }
    ]);

    // 🔹 Fetch users from same company (using helper)
    const userFilter = buildFilter(req, scope);
    const users = await User.find(userFilter).select("name");

    // 🔹 Map userId → name
    const map = {};
    users.forEach(u => (map[u._id.toString()] = u.name));

    const formatted = data.map(d => ({
      user: map[d._id?.toString()] || d._id,
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
    const scope = await getEffectiveScope(
      req.user,
      req.query.managerId,
      req.query.agentId
    );

    // ✅ Use buildFilter for consistency
    const filter = buildFilter(req, scope);

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
    const scope = await getEffectiveScope(
      req.user,
      req.query.managerId,
      req.query.agentId
    );

    // ✅ Use buildFilter for each model
    const userFilter = buildFilter(req, scope, { role: "User" });
    const accountFilter = buildFilter(req, scope);
    const depositFilter = buildFilter(req, scope);

    const events = [];

    // 🔹 Users
    const users = await User.find(userFilter).sort({ updatedAt: -1 }).limit(5);
    users.forEach(u => {
      events.push({
        type:
          u.createdAt.getTime() === u.updatedAt.getTime()
            ? "User Created"
            : "User Updated",
        message:
          u.createdAt.getTime() === u.updatedAt.getTime()
            ? `New ${u.role} ${u.name} added`
            : `${u.role} updated for ${u.name}`,
        date: u.updatedAt,
      });
    });

    // 🔹 Accounts
    const accounts = await Account.find(accountFilter)
      .sort({ createdAt: -1 })
      .limit(5);
    accounts.forEach(a => {
      events.push({
        type: "Account Opened",
        message: `${a.schemeType} account for ${a.clientName}`,
        date: a.createdAt,
      });
    });

    // 🔹 Deposits
    const deposits = await Deposit.find(depositFilter)
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("collectedBy", "name");

    deposits.forEach(d => {
      events.push({
        type: "Deposit",
        message: `₹${d.amount.toLocaleString()} collected by ${d.collectedBy?.name || "Agent"
          }`,
        date: d.createdAt,
      });
    });

    // 🔹 Merge + sort
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

    // ✅ Build filter with company + scope + date
    const filter = buildFilter(req, scope, {
      date: { $gte: fromDate, $lte: toDate }
    });

    // 🔹 Fetch deposits
    const deposits = await Deposit.find(filter)
      .populate("accountId", "accountNumber schemeType")
      .populate("collectedBy", "name email");

    // 🔹 Summary
    const totalAmount = deposits.reduce((sum, d) => sum + d.amount, 0);

    // 🔹 Monthly chart data
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
    const accountFilter = buildFilter(req, scope, {
      createdAt: { $gte: fromDate, $lte: toDate }
    });

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
    accounts.forEach(a => {
      schemeDistribution[a.schemeType] =
        (schemeDistribution[a.schemeType] || 0) + 1;
    });

    // Status Distribution
    const statusDistribution = {};
    accounts.forEach(a => {
      statusDistribution[a.status] =
        (statusDistribution[a.status] || 0) + 1;
    });

    // PaymentMode Breakdown
    const paymentModeBreakdown = {
      Yearly: { count: 0, target: 0, balance: 0, completionRate: "0%" },
      Monthly: { count: 0, target: 0, balance: 0, completionRate: "0%" },
      Daily: { count: 0, target: 0, balance: 0, completionRate: "0%" }
    };

    accounts.forEach(a => {
      if (!paymentModeBreakdown[a.paymentMode]) return;
      paymentModeBreakdown[a.paymentMode].count++;
      paymentModeBreakdown[a.paymentMode].target += a.totalPayableAmount || 0;
      paymentModeBreakdown[a.paymentMode].balance += a.balance || 0;
    });

    Object.keys(paymentModeBreakdown).forEach(mode => {
      const { target, balance } = paymentModeBreakdown[mode];
      paymentModeBreakdown[mode].completionRate =
        target > 0 ? ((balance / target) * 100).toFixed(2) + "%" : "0%";
    });

    // Add per-account progress
    const accountsWithProgress = accounts.map(a => {
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
    const depositFilter = buildFilter(req, scope, {
      date: { $gte: fromDate, $lte: toDate }
    });

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
    const trend = depositTrend.map(t => ({
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

    // ✅ Base filter with companyId + scope + date range
    const filter = buildFilter(req, scope, {
      createdAt: { $gte: fromDate, $lte: toDate }
    });

    // 🔹 Fetch users
    const users = await User.find(filter).select("-password");

    // 🔹 Summary
    const totalUsers = users.length;

    // 🔹 Role Distribution
    const roleDistribution = {};
    users.forEach(u => {
      roleDistribution[u.role] = (roleDistribution[u.role] || 0) + 1;
    });

    // 🔹 Status Distribution
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

    // ✅ Company + scope filter
    const filter = buildFilter(req, scope);

    // 🔹 Aggregate Accounts by paymentMode
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

    // 🔹 Convert into { Daily: X, Monthly: Y, Yearly: Z }
    const completionRates = result.reduce(
      (acc, r) => {
        acc[r.mode] = r.count;
        return acc;
      },
      { Daily: 0, Monthly: 0, Yearly: 0 } // defaults
    );

    res.json(completionRates);
  } catch (err) {
    next(err);
  }
};


const sanitizeFilename = (name) => name.replace(/[^a-zA-Z0-9_\-\.]/g, "_");

const objId = (v) => {
  try {
    if (!v) return v;
    if (mongoose.Types.ObjectId.isValid(v)) return new mongoose.Types.ObjectId(v);
    return v;
  } catch {
    return v;
  }
};

const handleEmptyExport = (format, role, res) => {
  const filename = `${sanitizeFilename(`deposit_report_${role}_${dayjs().format("YYYY-MM-DD")}`)}`;
  if (format === "csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}.csv`);
    const headerRow = ["Date", "AccountNumber", "ClientName", "SchemeType", "Amount", "CollectedBy", "UserName", "Status"].join(",") + "\n";
    return res.status(200).send(headerRow);
  } else {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}.pdf`);
    const doc = new PDFDocument({ margin: 36, size: "A4" });
    doc.pipe(res);
    doc.fontSize(16).text("Deposit Report", { align: "center" });
    doc.moveDown();
    doc.fontSize(12).text("No records found for given filters.", { align: "center" });
    doc.end();
    return;
  }
};

const streamDepositsAsCSV = async (filter, filename, res) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}.csv`);

  const cursor = Deposit.find(filter)
    .sort({ date: 1 })
    .populate("accountId", "accountNumber schemeType clientName status")
    .populate("userId", "name email")
    .populate("collectedBy", "name email")
    .lean()
    .cursor();

  const fields = ["Date", "AccountNumber", "ClientName", "SchemeType", "Amount", "CollectedBy", "UserName", "Status"];
  const parser = new Json2CsvParser({ fields, header: true });

  res.write(parser.parse([]) + "\n");

  for await (const d of cursor) {
    const row = {
      Date: d.date ? dayjs(d.date).format("YYYY-MM-DD") : "",
      AccountNumber: d.accountId?.accountNumber || "",
      ClientName: d.accountId?.clientName || "",
      SchemeType: d.accountId?.schemeType || d.schemeType || "",
      Amount: typeof d.amount === "number" ? d.amount.toFixed(2) : d.amount,
      CollectedBy: d.collectedBy?.name || "",
      UserName: d.userId?.name || "",
      Status: d.accountId?.status || "",
    };
    const escaped = fields.map(f => {
      const v = row[f] ?? "";
      const s = String(v).replace(/"/g, '""');
      return s.includes(",") || s.includes("\n") || s.includes('"') ? `"${s}"` : s;
    }).join(",");
    res.write(escaped + "\n");
  }

  res.end();
};

const renderDepositsAsPDF = async (deposits, role, filename, res, startDate, endDate, status) => {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}.pdf`);

  const doc = new PDFDocument({ margin: 36, size: "A4" });
  doc.pipe(res);

  doc.fontSize(16).text("Deposit Report", { align: "center" });

  const rangeText = [
    startDate ? `From ${dayjs(startDate).format("YYYY-MM-DD")}` : null,
    endDate ? `To ${dayjs(endDate).format("YYYY-MM-DD")}` : null,
    status ? `Status: ${status}` : null,
  ].filter(Boolean).join("  |  ");

  if (rangeText) {
    doc.moveDown(0.5).fontSize(10).text(rangeText, { align: "center" });
  }
  doc.moveDown(1);

  const headers = ["Date", "Account #", "Client", "Scheme", "Amount", "Collected By"];
  const colWidths = [70, 90, 150, 80, 60, 100];
  const startX = doc.page.margins.left;
  let y = doc.y;

  const drawHeaderRow = () => {
    let x = startX;
    doc.font("Helvetica-Bold").fontSize(9);
    headers.forEach((h, i) => {
      doc.text(h, x + 2, y, { width: colWidths[i], ellipsis: true });
      x += colWidths[i];
    });
    y += 18;
    doc.moveTo(startX, y - 4).lineTo(doc.page.width - doc.page.margins.right, y - 4).strokeOpacity(0.05).stroke();
  };

  const ensurePage = () => {
    const bottomLimit = doc.page.height - doc.page.margins.bottom - 30;
    if (y > bottomLimit) {
      doc.addPage();
      y = doc.y;
      drawHeaderRow();
    }
  };

  drawHeaderRow();
  doc.font("Helvetica").fontSize(9);

  deposits.forEach(d => {
    ensurePage();
    const row = [
      d.date ? dayjs(d.date).format("YYYY-MM-DD") : "",
      d.accountId?.accountNumber || "",
      d.accountId?.clientName || "",
      d.accountId?.schemeType || d.schemeType || "",
      typeof d.amount === "number" ? d.amount.toFixed(2) : d.amount,
      d.collectedBy?.name || "",
    ];
    let x = startX;
    row.forEach((c, i) => {
      doc.text(String(c ?? ""), x + 2, y, { width: colWidths[i], ellipsis: true });
      x += colWidths[i];
    });
    y += 16;
  });

  doc.end();
};

export const downloadDepositsReport = async (req, res, next) => {
  try {
    const q = req.query || {};
    const format = String(q.format || "csv").toLowerCase();
    const {
      from,
      to,
      year,
      status: rawStatus,
      schemeType,
      collectedBy,
      startDate: altStart,
      endDate: altEnd
    } = q;

    const allowedStatuses = new Set(["active", "ontrack", "pending", "defaulter", "matured", "closed"]);

    let status = rawStatus?.trim();
    if (status && !allowedStatuses.has(status.toLowerCase())) {
      return res.status(400).json({ error: "Invalid status filter." });
    }

    let start = from || altStart;
    let end = to || altEnd;

    let startDate = start ? dayjs(start).startOf("day").toDate() : null;
    let endDate = end ? dayjs(end).endOf("day").toDate() : null;

    if ((start && !dayjs(start).isValid()) || (end && !dayjs(end).isValid())) {
      return res.status(400).json({ error: "Invalid date format." });
    }

    const filter = { companyId: objId(req.user.companyId) };
    const scope = await getScope(req.user);
    const role = String(req.user.role || "User").toLowerCase();
    const userId = objId(req.user._id ?? req.user.id);

    if (!scope.isAll) {
      if (role === "manager") {
        filter.collectedBy = { $in: (scope.agents || []).map(objId) };
      } else if (role === "agent") {
        filter.collectedBy = userId;
      } else {
        filter.userId = userId;
      }
    }

    if (collectedBy && mongoose.Types.ObjectId.isValid(collectedBy)) {
      filter.collectedBy = objId(collectedBy);
    }

    if (schemeType) {
      filter.schemeType = schemeType;
    }

    if (startDate || endDate) {
      filter.date = {
        ...(startDate ? { $gte: startDate } : {}),
        ...(endDate ? { $lte: endDate } : {}),
      };
    }

    if (!startDate && !endDate && year && !isNaN(+year)) {
      filter.$expr = { $eq: [{ $year: "$date" }, parseInt(year)] };
    }

    if (status) {
      const accountFilter = {
        companyId: objId(req.user.companyId),
        status,
      };
      if (!scope.isAll) {
        if (role === "manager") accountFilter.assignedAgent = { $in: (scope.agents || []).map(objId) };
        else if (role === "agent") accountFilter.assignedAgent = userId;
        else accountFilter.userId = userId;
      }

      const accounts = await Account.find(accountFilter).select("_id").lean();
      if (!accounts.length) return handleEmptyExport(format, role, res);
      filter.accountId = { $in: accounts.map(a => objId(a._id)) };
    }

    const filename = sanitizeFilename(`deposit_report_${role}_${dayjs().format("YYYY-MM-DD")}`);

    if (format === "csv") {
      return await streamDepositsAsCSV(filter, filename, res);
    }

    const deposits = await Deposit.find(filter)
      .sort({ date: 1 })
      .populate("accountId", "accountNumber schemeType clientName status")
      .populate("userId", "name email")
      .populate("collectedBy", "name email")
      .lean();

    return renderDepositsAsPDF(deposits, role, filename, res, startDate, endDate, status);
  } catch (err) {
    next(err);
  }
};

