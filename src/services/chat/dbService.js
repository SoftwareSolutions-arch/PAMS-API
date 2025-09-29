// services/chat/dbService.js
import Account from "../../models/Account.js";
import Deposit from "../../models/Deposit.js";

/**
 * Fetch all accounts for a user (returns [] if none)
 * @param {string|ObjectId} userId
 */
export async function fetchAccountsForUser(userId) {
  return await Account.find({ userId }).lean();
}

/**
 * Fetch a single account (by accountNumber) and its deposits.
 * Returns { account: null | Account, deposits: [] } or { account: "FORBIDDEN" } for scope mismatch (see controller/handler).
 */
export async function fetchAccountAndDepositsByNumber(accountNumber) {
  const account = await Account.findOne({ accountNumber }).lean();
  if (!account) return { account: null, deposits: [] };
  const deposits = await Deposit.find({ accountNumber: account.accountNumber }).lean();
  return { account, deposits };
}

/**
 * Fetch deposits by account object (convenience)
 */
export async function fetchDepositsForAccount(account) {
  if (!account) return [];
  return await Deposit.find({ accountNumber: account.accountNumber }).lean();
}
