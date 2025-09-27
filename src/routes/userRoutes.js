import express from "express";
import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  getUserAccounts,
  getUserDeposits,
  requestUser,
  getPendingRequests,
  handleRequest
} from "../controllers/userController.js";
import { protect, allowRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

// 📌 Get all users
router.get("/", protect, allowRoles("Admin", "Manager", "Agent", "User"), getUsers);

// 📌 Admin direct create (Approved instantly)
router.post("/", protect, allowRoles("Admin"), createUser);

// 📌 Manager/Agent request new user (Pending state)
router.post("/request", protect, allowRoles("Manager", "Agent"), requestUser);

// 📌 Admin fetch all pending requests
router.get("/requests", protect, allowRoles("Admin"), getPendingRequests);

// 📌 Admin approve/reject request
router.patch("/requests/:id", protect, allowRoles("Admin"), handleRequest);

// 📌 Update & Delete (restricted)
router.put("/:id", protect, allowRoles("Admin", "Manager"), updateUser);
router.delete("/:id", protect, allowRoles("Admin"), deleteUser);

// 📌 Accounts & Deposits
router.get("/:id/accounts", protect, allowRoles("Admin", "Manager", "Agent"), getUserAccounts);
router.get("/:id/deposits", protect, allowRoles("Admin", "Manager", "Agent"), getUserDeposits);

export default router;
