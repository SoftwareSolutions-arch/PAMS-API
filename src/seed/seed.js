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
  { id: '1', clientName: 'Alice Cooper', accountNumber: 'RD001234', schemeType: 'RD', balance: 45000, openingBalance: 40000, userId: '6', assignedAgent: '3' ,durationMonths: 24},
  { id: '2', clientName: 'Bob Miller', accountNumber: 'NSC002345', schemeType: 'NSC', balance: 120000, openingBalance: 100000, userId: '7', assignedAgent: '3' ,durationMonths: 60 },
  { id: '3', clientName: 'Carol White', accountNumber: 'KVP003456', schemeType: 'KVP', balance: 85000, openingBalance: 75000, userId: '8', assignedAgent: '4' ,durationMonths: 124 },
  { id: '4', clientName: 'Alice Cooper', accountNumber: 'PPF004567', schemeType: 'PPF', balance: 150000, openingBalance: 140000, userId: '6', assignedAgent: '3' ,durationMonths: 180 },
  { id: '5', clientName: 'Bob Miller', accountNumber: 'RD005678', schemeType: 'RD', balance: 32000, openingBalance: 30000, userId: '7', assignedAgent: '3' ,durationMonths: 12 },
  { id: '6', clientName: 'Carol White', accountNumber: 'NSC006789', schemeType: 'NSC', balance: 95000, openingBalance: 90000, userId: '8', assignedAgent: '4' ,durationMonths: 60},
];

const mockDeposits = [
  { id: '1', date: '2024-01-15', accountId: '1', userId: '6', scheme: 'RD', amount: 5000, collectedBy: '3' },
  { id: '2', date: '2024-01-14', accountId: '2', userId: '7', scheme: 'NSC', amount: 15000, collectedBy: '3' },
  { id: '3', date: '2024-01-13', accountId: '3', userId: '8', scheme: 'KVP', amount: 10000, collectedBy: '4' },
  { id: '4', date: '2024-01-12', accountId: '4', userId: '6', scheme: 'PPF', amount: 25000, collectedBy: '3' },
  { id: '5', date: '2024-01-11', accountId: '5', userId: '7', scheme: 'RD', amount: 3000, collectedBy: '3' },
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
      durationMonths: a.durationMonths
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
