// services/chat/questionHandlers.js
import { getScope } from "../../utils/scopeHelper.js";
import {
  fetchAccountsForUser,
  fetchAccountAndDepositsByNumber,
  fetchDepositsForAccount,
} from "./dbService.js";
import { askGPT } from "./openaiService.js";

/* helper sets (same as before) */
const GREETINGS = ["hi", "hello", "hey", "good morning", "good afternoon", "good evening"];
const HELP_KEYWORDS = ["help", "what can you do", "commands", "options"];
const SMALL_TALK = {
  howAreYou: ["how are you", "how r you", "how's it going", "how is it going"],
  thanks: ["thank", "thanks", "thx"],
  goodbye: ["bye", "goodbye", "see you"],
};

function includesAnyLower(haystack, arr) {
  return arr.some((k) => haystack.includes(k));
}
function startsWithAnyLower(haystack, arr) {
  return arr.some((k) => haystack.startsWith(k));
}
function needsDbLookup(lower) {
  return (
    lower.includes("balance") ||
    lower.includes("maturity") ||
    lower.includes("missed") ||
    lower.includes("final") ||
    lower.includes("account")
  );
}

/** regex for matching common accountNumber pattern, adjust to your format */
const ACCOUNT_NUMBER_REGEX = /\b[A-Z]{2}\d{6}\b/gi;

/** match scheme types roughly (RD, KVP, FD, SIP etc) - expand as required */
const SCHEME_TYPES = ["rd", "kvp", "fd", "sip", "recurring", "rd"];

function buildDbSummary(account, deposits) {
  const balance =
    account.balance != null
      ? account.balance
      : deposits.reduce((s, d) => s + (d.paidAmount || d.amount || 0), 0);

  const missed = deposits.filter((d) => d.status === "Missed").length;
  const finalAmount = account.finalAmount || account.totalPayableAmount || 0;
  const maturityDate = account.maturityDate
    ? new Date(account.maturityDate).toDateString()
    : "Not available";

  return `
Account Number: ${account.accountNumber}
Client: ${account.clientName}
Scheme: ${account.schemeType}
Payment Mode: ${account.paymentMode}
Current Balance: ₹${balance.toLocaleString()}
Missed Payments: ${missed}
Projected Final Amount: ₹${finalAmount.toLocaleString()}
Projected Maturity Date: ${maturityDate}
`;
}

/**
 * handleQuestion(req, message, opts)
 * opts may include selectedAccountNumber (from client UI)
 */
export async function handleQuestion(req, message, opts = {}) {
  const lower = (message || "").toLowerCase().trim();

  // 1: greetings/help/smalltalk (no account needed)
  if (startsWithAnyLower(lower, GREETINGS)) {
    return {
      handledBy: "greeting",
      reply:
        "Hello! 👋 You can ask me about your balance, maturity date, missed payments, final amount, or account number. Type 'help' to see all options.",
    };
  }

  if (includesAnyLower(lower, HELP_KEYWORDS)) {
    return {
      handledBy: "help",
      reply: `Here are some things you can ask me:
- "What is my balance?"
- "How many missed payments do I have?"
- "When is my maturity date?"
- "What is my final amount?"
- "What is my account number?"
- Or specify an account: "Balance for DL000013"`,
    };
  }

  if (includesAnyLower(lower, SMALL_TALK.howAreYou)) {
    return { handledBy: "smalltalk", reply: "I’m doing great — thanks! How can I help with your account today?" };
  }
  if (includesAnyLower(lower, SMALL_TALK.thanks)) {
    return { handledBy: "smalltalk", reply: "You're welcome! 🙌 Always here to help." };
  }
  if (includesAnyLower(lower, SMALL_TALK.goodbye)) {
    return { handledBy: "smalltalk", reply: "Goodbye! 👋 Have a great day ahead." };
  }

  // 2: If DB lookup needed, fetch user's accounts
  const scope = await getScope(req.user);
  // build allowedUserIds as before (string array)
  let allowedUserIds = [];
  if (!scope.isAll) {
    if (req.user.role === "Manager") allowedUserIds = [...(scope.agents || []), ...(scope.clients || [])].map(String);
    else if (req.user.role === "Agent") allowedUserIds = (scope.clients || []).map(String);
    else if (req.user.role === "User") allowedUserIds = [String(req.user._id)];
  }

  // fetch all accounts for the user (for selection)
  const accounts = await fetchAccountsForUser(req.user._id);

  // If the controller must enforce scope, filter accounts
  const visibleAccounts = accounts.filter((a) => {
    if (!allowedUserIds || allowedUserIds.length === 0) return true;
    return allowedUserIds.includes(String(a.userId));
  });

  // If user requested a specific accountNumber in opts, prefer that.
  let selectedAccount = null;
  let selectedDeposits = [];

  const requestedAccountNumber = opts.selectedAccountNumber?.trim();
  if (requestedAccountNumber) {
    const lookup = await fetchAccountAndDepositsByNumber(requestedAccountNumber);
    if (lookup.account === null) {
      return { handledBy: "no-account", reply: `I couldn't find account ${requestedAccountNumber}.` };
    }
    // scope check
    if (allowedUserIds.length > 0 && !allowedUserIds.includes(String(lookup.account.userId))) {
      return { handledBy: "forbidden", reply: "Not authorized to view this account." };
    }
    selectedAccount = lookup.account;
    selectedDeposits = lookup.deposits;
  } else {
    // try detect account number in message
    const matched = (message || "").match(ACCOUNT_NUMBER_REGEX);
    if (matched && matched.length > 0) {
      const accNum = matched[0];
      const lookup = await fetchAccountAndDepositsByNumber(accNum);
      if (lookup.account) {
        if (allowedUserIds.length > 0 && !allowedUserIds.includes(String(lookup.account.userId))) {
          return { handledBy: "forbidden", reply: "Not authorized to view this account." };
        }
        selectedAccount = lookup.account;
        selectedDeposits = lookup.deposits;
      } else {
        // account string present but not found
        return { handledBy: "no-account", reply: `I couldn't find account ${accNum}.` };
      }
    } else if (visibleAccounts.length === 1) {
      // single account — pick it automatically
      selectedAccount = visibleAccounts[0];
      selectedDeposits = await fetchDepositsForAccount(selectedAccount);
    } else if (visibleAccounts.length > 1 && needsDbLookup(lower)) {
      // multiple accounts: try scheme match from message (e.g., "KVP", "RD")
      const schemeMatch = SCHEME_TYPES.find((s) => lower.includes(s));
      if (schemeMatch) {
        const found = visibleAccounts.find((a) => (a.schemeType || "").toLowerCase().includes(schemeMatch));
        if (found) {
          selectedAccount = found;
          selectedDeposits = await fetchDepositsForAccount(found);
        }
      }
      // if still no selectedAccount and DB data needed, ask the user to pick
      if (!selectedAccount && needsDbLookup(lower)) {
        // return list of accounts for frontend to display
        const compact = visibleAccounts.map((a) => ({
          accountNumber: a.accountNumber,
          scheme: a.schemeType,
          balance: a.balance ?? 0,
          paymentMode: a.paymentMode,
        }));
        return {
          handledBy: "choose-account",
          reply: `You have multiple accounts. Which one do you want to refer to?`,
          accounts: compact, // included so frontend can render choices
        };
      }
    }
  }

  // If we reached here and DB lookup isn't needed, optionally allow GPT fallback
  if (!needsDbLookup(lower)) {
    const maybeDbSummary = selectedAccount ? buildDbSummary(selectedAccount, selectedDeposits || []) : "No account data available.";
    const replyFromGpt = await askGPT(maybeDbSummary, message);
    return { handledBy: "gpt", reply: replyFromGpt || "I don't have that info." };
  }

  // Now selectedAccount must be present for DB-driven answers
  if (!selectedAccount) {
    return { handledBy: "no-account", reply: "I couldn't find an active account for you. Please specify an account or create one." };
  }

  // compute values for direct answers
  const balance =
    selectedAccount.balance != null
      ? selectedAccount.balance
      : (selectedDeposits || []).reduce((sum, d) => sum + (d.paidAmount || d.amount || 0), 0);

  const missed = (selectedDeposits || []).filter((d) => d.status === "Missed").length;
  const finalAmount = selectedAccount.finalAmount || selectedAccount.totalPayableAmount || 0;
  const maturityDate = selectedAccount.maturityDate ? new Date(selectedAccount.maturityDate).toDateString() : "Not available";

  if (lower.includes("balance")) {
    return { handledBy: "db", reply: `Your current balance for ${selectedAccount.accountNumber} is ₹${balance.toLocaleString()}.` };
  }

  if (lower.includes("missed")) {
    return { handledBy: "db", reply: `You have ${missed} missed payment${missed !== 1 ? "s" : ""} for ${selectedAccount.accountNumber}.` };
  }

  if (lower.includes("maturity")) {
    return { handledBy: "db", reply: `Projected maturity date for ${selectedAccount.accountNumber} is ${maturityDate}.` };
  }

  if (lower.includes("final")) {
    return { handledBy: "db", reply: `Projected final amount for ${selectedAccount.accountNumber} is ₹${finalAmount.toLocaleString()}.` };
  }

  if (lower.includes("account")) {
    return { handledBy: "db", reply: `Account number: ${selectedAccount.accountNumber} (Scheme: ${selectedAccount.schemeType}).` };
  }

  // fallback: use GPT with DB summary for the selectedAccount
  const dbSummary = buildDbSummary(selectedAccount, selectedDeposits || []);
  const gptReply = await askGPT(dbSummary, message);
  return { handledBy: "gpt", reply: gptReply || "I don't have that info." };
}
