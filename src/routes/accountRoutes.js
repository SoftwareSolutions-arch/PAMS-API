import express from "express";
import { protect, allowRoles } from "../middleware/authMiddleware.js";
import { getAccounts, createAccount, updateAccount, deleteAccount ,getAccountByNumber} from "../controllers/accountController.js";

const router = express.Router();
// src/routes/accountRoutes.js
router.get("/", protect, allowRoles("Admin", "Manager", "Agent", "User"), getAccounts);
router.get("/:accountNumber", protect, allowRoles("Admin", "Manager", "Agent", "User"), getAccountByNumber); // 👈 new route
router.post("/", protect, allowRoles("Admin", "Manager", "Agent"), createAccount);
router.put("/:id", protect, allowRoles("Admin", "Manager"), updateAccount);
router.delete("/:id", protect, allowRoles("Admin"), deleteAccount);

export default router;
