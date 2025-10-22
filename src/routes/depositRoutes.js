import express from "express";
import { protect, allowRoles } from "../middleware/authMiddleware.js";
import { getDeposits, getDepositsPaginated, createDeposit, updateDeposit, deleteDeposit ,getDepositsByAccount ,getDepositsByDateRange ,bulkCreateDeposits , getEligibleAccountsForBulk} from "../controllers/depositController.js";

const router = express.Router();

// Get deposits (all roles, but scoped by scopeHelper)
router.get("/", protect, allowRoles("Admin", "Manager", "Agent", "User"), getDeposits);

// Cursor-based pagination (SSR-ready)
router.get("/paginated", protect, allowRoles("Admin", "Manager", "Agent", "User"), getDepositsPaginated);

// Create deposit (only Agent)
router.post("/", protect, allowRoles("Admin", "Manager","Agent"), createDeposit);

// Bulk create deposits (Agents only)
router.post("/bulk", protect, allowRoles("Admin","Agent"), bulkCreateDeposits);

// Get eligible accounts for bulk deposit (Agent only)
router.get("/eligible", protect, allowRoles("Admin","Agent"), getEligibleAccountsForBulk);

// Update deposit (Admin can correct, Manager cannot)
router.put("/:id", protect, allowRoles("Admin"), updateDeposit);

// Delete deposit (Admin only)
router.delete("/:id", protect, allowRoles("Admin"), deleteDeposit);

// Get deposits by account
router.get("/account/:accountId", protect, allowRoles("Admin", "Manager", "Agent", "User"), getDepositsByAccount);

router.get("/by-date-range", protect, allowRoles("Admin", "Manager", "Agent", "User"), getDepositsByDateRange);

export default router;
