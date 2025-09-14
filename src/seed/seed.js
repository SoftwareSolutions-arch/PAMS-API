import dotenv from "dotenv";
dotenv.config();
import connectDB from "../config/db.js";
import User from "../models/User.js";
import Account from "../models/Account.js";
import Deposit from "../models/Deposit.js";
import bcrypt from "bcryptjs";

// ---------- Mock Data ----------
const mockUsers = [
  { id: '1', name: 'John Smith', email: 'john.smith@email.com', role: 'Admin' },
  { id: '2', name: 'Sarah Johnson', email: 'sarah.johnson@email.com', role: 'Manager' },
  { id: '3', name: 'Mike Davis', email: 'mike.davis@email.com', role: 'Agent', assignedTo: '2' },
  { id: '4', name: 'Emily Brown', email: 'emily.brown@email.com', role: 'Agent', assignedTo: '2' },
  { id: '5', name: 'David Wilson', email: 'david.wilson@email.com', role: 'Manager' },
  { id: '6', name: 'Alice Cooper', email: 'alice.cooper@email.com', role: 'User', assignedTo: '3' },
  { id: '7', name: 'Bob Miller', email: 'bob.miller@email.com', role: 'User', assignedTo: '3' },
  { id: '8', name: 'Carol White', email: 'carol.white@email.com', role: 'User', assignedTo: '4' },
];

const mockAccounts = [
  // Monthly Account Example
  {
    id: "1",
    clientName: "Alice Cooper",
    accountNumber: "RD001234",
    schemeType: "RD",
    openingBalance: 0,
    balance: 0,
    userId: "6",              // Alice Cooper (User)
    assignedAgent: "3",       // Mike Davis (Agent)
    durationMonths: 24,
    paymentMode: "Monthly",   // REQUIRED
    installmentAmount: 5000,  // REQUIRED for Monthly
    maturityDate: new Date(new Date().setMonth(new Date().getMonth() + 24)),
    status: "Active",
    isFullyPaid: false
  },

  // Yearly Account Example
  {
    id: "2",
    clientName: "Bob Miller",
    accountNumber: "NSC002345",
    schemeType: "NSC",
    openingBalance: 100000,   // one-time yearly payment
    balance: 0,
    userId: "7",              // Bob Miller (User)
    assignedAgent: "3",       // Mike Davis (Agent)
    durationMonths: 60,
    paymentMode: "Yearly",    // REQUIRED
    installmentAmount: null,  // not required
    monthlyTarget: null,      // not required
    maturityDate: new Date(new Date().setMonth(new Date().getMonth() + 60)),
    status: "Active",
    isFullyPaid: false
  },

  // Daily Account Example
  {
    id: "3",
    clientName: "Carol White",
    accountNumber: "KVP003456",
    schemeType: "KVP",
    openingBalance: 0,
    balance: 0,
    userId: "8",              // Carol White (User)
    assignedAgent: "4",       // Emily Brown (Agent)
    durationMonths: 12,
    paymentMode: "Daily",     // REQUIRED
    monthlyTarget: 3000,      // REQUIRED for Daily
    installmentAmount: null,  // not required
    maturityDate: new Date(new Date().setMonth(new Date().getMonth() + 12)),
    status: "Active",
    isFullyPaid: false
  },

  // Another Monthly Account
  {
    id: "4",
    clientName: "Alice Cooper",
    accountNumber: "PPF004567",
    schemeType: "PPF",
    openingBalance: 0,
    balance: 0,
    userId: "6",
    assignedAgent: "3",
    durationMonths: 180,
    paymentMode: "Monthly",
    installmentAmount: 2000,
    monthlyTarget: null,
    maturityDate: new Date(new Date().setMonth(new Date().getMonth() + 180)),
    status: "Active",
    isFullyPaid: false
  },

  // Another Yearly Account
  {
    id: "5",
    clientName: "Bob Miller",
    accountNumber: "RD005678",
    schemeType: "RD",
    openingBalance: 50000,
    balance: 0,
    userId: "7",
    assignedAgent: "3",
    durationMonths: 12,
    paymentMode: "Yearly",
    installmentAmount: null,
    monthlyTarget: null,
    maturityDate: new Date(new Date().setMonth(new Date().getMonth() + 12)),
    status: "Active",
    isFullyPaid: false
  },

  // Another Daily Account
  {
    id: "6",
    clientName: "Carol White",
    accountNumber: "NSC006789",
    schemeType: "NSC",
    openingBalance: 0,
    balance: 0,
    userId: "8",
    assignedAgent: "4",
    durationMonths: 60,
    paymentMode: "Daily",
    monthlyTarget: 5000,
    installmentAmount: null,
    maturityDate: new Date(new Date().setMonth(new Date().getMonth() + 60)),
    status: "Active",
    isFullyPaid: false
  }
];


const mockDeposits = [
  {
    id: '1',
    date: '2024-01-15',
    accountId: '1',
    userId: '6',
    schemeType: 'RD',
    amount: 5000,
    collectedBy: '3'
  },
  {
    id: '2',
    date: '2024-01-14',
    accountId: '2',
    userId: '7',
    schemeType: 'NSC',
    amount: 100000,
    collectedBy: '3'
  },
  {
    id: '3',
    date: '2024-01-13',
    accountId: '3',
    userId: '8',
    schemeType: 'KVP',
    amount: 1000,
    collectedBy: '4'
  },
  {
    id: '4',
    date: '2024-01-12',
    accountId: '4',
    userId: '6',
    schemeType: 'PPF',
    amount: 140000,
    collectedBy: '3'
  },
  {
    id: '5',
    date: '2024-01-11',
    accountId: '5',
    userId: '7',
    schemeType: 'RD',
    amount: 3000,
    collectedBy: '3'
  }
];


// ---------- Seed Script ----------
const run = async () => {
  await connectDB();

  // Clear existing data
  await User.deleteMany();
  await Account.deleteMany();
  await Deposit.deleteMany();

  // STEP 1: Insert Users
  const userIdMap = {}; // mockId -> real Mongo _id
  for (const u of mockUsers) {
    const hashed = await bcrypt.hash("password", 8);
    const newUser = await User.create({
      name: u.name,
      email: u.email,
      password: hashed,
      role: u.role
    });
    userIdMap[u.id] = newUser._id;
  }

  // STEP 2: Update assignedTo
  for (const u of mockUsers) {
    if (u.assignedTo) {
      await User.findByIdAndUpdate(userIdMap[u.id], {
        assignedTo: userIdMap[u.assignedTo]
      });
    }
  }

  // STEP 3: Insert Accounts
  const accountIdMap = {}; // mockId -> real Mongo _id
  for (const a of mockAccounts) {
    const newAcc = await Account.create({
      clientName: a.clientName,
      accountNumber: a.accountNumber,
      schemeType: a.schemeType,
      openingBalance: a.openingBalance,
      balance: a.balance,
      userId: userIdMap[a.userId],
      assignedAgent: userIdMap[a.assignedAgent],
      durationMonths: a.durationMonths,
      paymentMode: a.paymentMode,
      installmentAmount: a.installmentAmount,
      monthlyTarget: a.monthlyTarget,
      status: a.status,
      maturityDate: a.maturityDate,
      isFullyPaid: a.isFullyPaid
    });
    accountIdMap[a.id] = newAcc._id;
  }

  // STEP 4: Insert Deposits
  for (const d of mockDeposits) {
    await Deposit.create({
      date: new Date(d.date),
      accountId: accountIdMap[d.accountId],
      userId: userIdMap[d.userId],
      scheme: d.scheme,
      amount: d.amount,
      collectedBy: userIdMap[d.collectedBy]
    });
  }

  console.log("✅ Seeded all mock data successfully!");
  process.exit(0);
};

run().catch(err => {
  console.error("❌ Error seeding data:", err);
  process.exit(1);
});
