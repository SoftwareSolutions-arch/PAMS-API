import express from "express";
import multer from "multer";
import { protect, allowRoles } from "../middleware/authMiddleware.js";
import { getDeposits, createDeposit, updateDeposit, deleteDeposit ,getDepositsByAccount ,getDepositsByDateRange ,bulkCreateDeposits , getEligibleAccountsForBulk, uploadPastPayments} from "../controllers/depositController.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Get deposits (all roles, but scoped by scopeHelper)
router.get("/", protect, allowRoles("Admin", "Manager", "Agent", "User"), getDeposits);

// Create deposit (only Agent)
router.post("/", protect, allowRoles("Admin", "Manager","Agent"), createDeposit);

// Bulk create deposits (Agents only)
router.post("/bulk", protect, allowRoles("Admin","Agent"), bulkCreateDeposits);

// Past payment XML upload
router.post(
  "/past-payments",
  protect,
  allowRoles("Admin", "Manager", "Agent"),
  upload.single("file"),
  uploadPastPayments
);

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
