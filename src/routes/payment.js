import express from "express";
import { createOrder, test } from "../controllers/paymentController.js";

const router = express.Router();

// Test endpoint for quick verification
router.get("/test", test);

// Create Razorpay order
router.post("/create-order", createOrder);

export default router;
