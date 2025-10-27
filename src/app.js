import express from "express";
import cors from "cors";
import morgan from "morgan";

import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import accountRoutes from "./routes/accountRoutes.js";
import depositRoutes from "./routes/depositRoutes.js";
import depositChangeRequestRoutes from "./routes/depositChangeRequestRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import auditRoutes from "./routes/auditRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import companyRoutes from "./routes/companyRoutes.js";
import orgChartRoutes from "./routes/orgChart.routes.js";
import accountChangeRequestRoutes from "./routes/accountChangeRequestRoutes.js";
import clientAddressRoutes from "./routes/addressRoutes.js";
import schemeRoutes from "./routes/schemeRoutes.js";
import paymentRoutes from "./routes/payment.js";
import supportRoutes from "./routes/supportRoutes.js";

import { startMaturityCron } from "./cron/updateMaturedAccounts.js";
import { notFound, errorHandler } from "./middleware/errorMiddleware.js";
import { auditLogger } from "./middleware/auditMiddleware.js";
import superAdminRoutes from "./routes/superAdminRoutes.js";
import sendInvite from "./routes/inviteRoutes.js";

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// ✅ Audit logger before routes (logs every request)
app.use(auditLogger);

// ✅ Start cron job
startMaturityCron();

// ✅ Root route
app.get("/", (req, res) => {
  res.status(200).json({
    message: "🚀 PAMS API is running",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ✅ Keep-alive endpoint
app.get("/api/ping", (req, res) => {
  res.status(200).json({ message: "pong", timestamp: new Date().toISOString() });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/accounts", accountRoutes);
app.use("/api/deposits", depositRoutes);
app.use("/api/deposits/change-requests", depositChangeRequestRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/superadmin/companies", companyRoutes);
app.use("/api/company", companyRoutes);
app.use("/api/invites", sendInvite);
app.use("/api/superadmin/auth", superAdminRoutes);
app.use("/api/org-chart", orgChartRoutes);
app.use("/api/account-change-requests", accountChangeRequestRoutes);
app.use("/api/clients", clientAddressRoutes);
app.use("/api/schemes", schemeRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/support", supportRoutes);

// Not found + error handlers
app.use(notFound);
app.use(errorHandler);

// ✅ Generic error handler (fallback)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Server error" });
});

// ✅ Self-ping logic (every 5 min) for Render
if (process.env.RENDER_EXTERNAL_URL) {
  setInterval(async () => {
    try {
      const url = `${process.env.RENDER_EXTERNAL_URL}/api/ping`;
      const res = await fetch(url);
      console.log("Keep-alive ping:", url, res.status);
    } catch (err) {
      console.error("Keep-alive failed:", err.message);
    }
  }, 5 * 60 * 1000); // 5 minutes
}

export default app;
