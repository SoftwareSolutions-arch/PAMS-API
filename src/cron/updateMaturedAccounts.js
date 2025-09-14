import cron from "node-cron";
import Account from "../models/Account.js";
import Deposit from "../models/Deposit.js";

// Helper: Date boundaries
const getMonthRange = () => {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);

  return { start, end };
};

const getYearRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const end = new Date(now.getFullYear() + 1, 0, 1);
  return { start, end };
};

export const startMaturityCron = () => {
  // Runs every midnight (00:00)
  cron.schedule("0 0 * * *", async () => {
    try {
      const today = new Date();

      // 1) Maturity check
      const maturedResult = await Account.updateMany(
        { status: "Active", maturityDate: { $lte: today } },
        { $set: { status: "Matured" } }
      );

      if (maturedResult.modifiedCount > 0) {
        console.log(`✅ Maturity Cron: ${maturedResult.modifiedCount} accounts updated to 'Matured'`);
      }

      // 2) Target validation for Active accounts
      const activeAccounts = await Account.find({ status: "Active" });

      for (const acc of activeAccounts) {
        if (acc.paymentMode === "Monthly") {
          const { start, end } = getMonthRange();

          const totalDeposits = await Deposit.aggregate([
            {
              $match: {
                accountId: acc._id,
                date: { $gte: start.toISOString().split("T")[0], $lt: end.toISOString().split("T")[0] }
              }
            },
            { $group: { _id: null, total: { $sum: "$amount" } } }
          ]);

          const totalAmount = totalDeposits.length > 0 ? totalDeposits[0].total : 0;

          if (totalAmount < acc.monthlyTarget) {
            acc.status = "Inactive";
          } else {
            acc.status = "Active";
          }
          await acc.save();
        }

        if (acc.paymentMode === "Yearly") {
          const { start, end } = getYearRange();

          const totalDeposits = await Deposit.aggregate([
            {
              $match: {
                accountId: acc._id,
                date: { $gte: start.toISOString().split("T")[0], $lt: end.toISOString().split("T")[0] }
              }
            },
            { $group: { _id: null, total: { $sum: "$amount" } } }
          ]);

          const totalAmount = totalDeposits.length > 0 ? totalDeposits[0].total : 0;

          if (totalAmount < (acc.monthlyTarget || 0) * 12) {
            acc.status = "Inactive";
          } else {
            acc.status = "Active";
          }
          await acc.save();
        }
      }

      console.log("✅ Cron Job: Maturity + Target validation done");

    } catch (err) {
      console.error("❌ Cron Job Error:", err.message);
    }
  });
};
