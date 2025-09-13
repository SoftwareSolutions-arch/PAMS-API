import express from "express";
import { getUsers, createUser, updateUser, deleteUser, getUserAccounts, getUserDeposits } from "../controllers/userController.js";
import { protect, allowRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protect, allowRoles("Admin", "Manager", "Agent", "User"), getUsers);
router.post("/", protect, allowRoles("Admin", "Manager"), createUser);
router.put("/:id", protect, allowRoles("Admin", "Manager"), updateUser);
router.delete("/:id", protect, allowRoles("Admin"), deleteUser);
router.get("/:id/accounts", protect, allowRoles("Admin", "Manager", "Agent"), getUserAccounts);
router.get("/:id/deposits", protect, allowRoles("Admin", "Manager", "Agent"), getUserDeposits);

export default router;
