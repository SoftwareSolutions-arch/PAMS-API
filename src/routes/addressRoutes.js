import express from "express";
import {
    createUserAddress,
    getUserAddresses,
    getUserAddressById,
    updateUserAddress,
    deleteUserAddress,
    getAgentClientAddresses
} from "../controllers/AddressController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// ✅ CRUD Routes
router.post("/:userId/addresses",protect, createUserAddress);
router.get("/addresses",protect, getAgentClientAddresses);
router.get("/:userId/addresses",protect, getUserAddresses);
router.get("/:userId/addresses/:addressId", protect,getUserAddressById);
router.put("/:userId/addresses/:addressId",protect,updateUserAddress);
router.delete("/:userId/addresses/:addressId", protect,deleteUserAddress);

export default router;
