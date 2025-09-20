// utils/accountHelper.js
import { Counter } from "../models/Counter.js";

export const checkAndUpdateAccountStatus = async (account) => {
    if (!account) return;

    const today = new Date();
    if (account.status === "Active" && today >= account.maturityDate) {
        account.status = "Matured";
        await account.save();
    }
};

export const generateAccountNumber = async (paymentMode) => {
  let prefix;
  switch (paymentMode) {
    case "Yearly":
      prefix = "YR";
      break;
    case "Monthly":
      prefix = "MN";
      break;
    case "Daily":
      prefix = "DL";
      break;
    default:
      throw new Error("Invalid payment mode");
  }

  const counter = await Counter.findOneAndUpdate(
    { key: paymentMode },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  // 👇 Ensure number always has at least 6 digits
  const paddedNumber = String(counter.seq).padStart(6, "0");

  return `${prefix}${paddedNumber}`;
};

