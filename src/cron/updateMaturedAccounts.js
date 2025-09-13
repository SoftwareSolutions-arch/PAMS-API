import cron from "node-cron";
import Account from "../models/Account.js";

export const startMaturityCron = () => {
  // Runs every midnight (00:00)
  cron.schedule("0 0 * * *", async () => {
    try {
      const today = new Date();

      const result = await Account.updateMany(
        { status: "Active", maturityDate: { $lte: today } },
        { $set: { status: "Matured" } }
      );

      if (result.modifiedCount > 0) {
        console.log(`✅ Maturity Cron: ${result.modifiedCount} accounts updated to 'Matured'`);
      }
    } catch (err) {
      console.error("❌ Maturity Cron Error:", err.message);
    }
  });
};
