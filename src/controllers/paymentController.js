import Razorpay from "razorpay";

// Initialize Razorpay client with credentials from environment variables
// Ensure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are set in your environment
const razorpayClient = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * POST /api/payment/create-order
 * Creates a Razorpay order on the server and returns minimal details.
 * Expects { amount } in the request body (in INR). Defaults to ₹499.
 */
export const createOrder = async (req, res) => {
  try {
    // Default amount in INR if not provided
    const amountInRupeesRaw =
      req?.body?.amount === undefined || req?.body?.amount === null
        ? 499
        : req.body.amount;

    const amountInRupees = Number(amountInRupeesRaw);
    if (Number.isNaN(amountInRupees) || amountInRupees <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    // Razorpay expects amount in the smallest currency unit (paise)
    const amountInPaise = Math.round(amountInRupees * 100);

    const order = await razorpayClient.orders.create({
      amount: amountInPaise,
      currency: "INR",
      // Optional, useful for tracing in dashboards/logs
      receipt: `rcpt_${Date.now()}`,
    });

    // Optional console logging for debugging/verification
    console.log("Razorpay order created:", order.id);

    return res.status(200).json({
      id: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (error) {
    console.error("Failed to create Razorpay order:", error?.message || error);
    return res.status(500).json({ error: "Failed to create order" });
  }
};

/**
 * GET /api/payment/test
 * Quick health check for the payment API.
 */
export const test = (req, res) => {
  return res.status(200).json({ message: "Payment API active" });
};
