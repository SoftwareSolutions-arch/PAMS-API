import Deposit from "../models/Deposit.js";
import DepositChangeRequest from "../models/DepositChangeRequest.js";

// 🟢 Create a deposit change request (Agent)
export const createChangeRequest = async (req, res) => {
  try {
    const { depositId, newValues, reason } = req.body;

    if (!depositId || !newValues || !reason) {
      return res.status(400).json({ message: "Deposit ID, new values, and reason are required." });
    }

    const deposit = await Deposit.findById(depositId);
    if (!deposit) return res.status(404).json({ message: "Deposit not found" });

    // 🧩 Ensure deposit is editable within 7 days
    const daysSinceDeposit = (Date.now() - new Date(deposit.date)) / (1000 * 60 * 60 * 24);
    if (daysSinceDeposit > 7) {
      return res.status(400).json({ message: "Deposit can only be changed within 7 days." });
    }

    // Store old vs new comparison
    const changeRequest = new DepositChangeRequest({
      depositId,
      agentId: req.user._id,
      oldValues: {
        amount: deposit.amount,
        schemeType: deposit.schemeType,
        date: deposit.date
      },
      newValues,
      reason
    });

    await changeRequest.save();
    res.status(201).json({ message: "Change request submitted successfully", changeRequest });
  } catch (error) {
    console.error("Create Change Request Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// 🟡 Get all change requests (Admin only)
export const getChangeRequests = async (req, res) => {
  try {
    // ✅ Allow only Admins
    if (req.user.role !== "Admin") {
      return res
        .status(403)
        .json({ message: "Only admin can view change requests" });
    }

    // ✅ Fetch and populate all required fields
    const requests = await DepositChangeRequest.find()
      .populate("depositId", "_id date amount schemeType")
      .populate("agentId", "name email role")
      .populate("reviewedBy", "name")
      .sort({ createdAt: -1 });

    // ✅ Transform data into frontend-friendly structure
    const formattedRequests = requests.map((req) => ({
      id: req._id,
      depositId: req.depositId?._id || "",
      requestedBy: {
        name: req.agentId?.name || "Unknown",
        email: req.agentId?.email || "N/A",
        role: req.agentId?.role || "Agent",
      },
      oldValues: req.oldValues || {},
      newValues: req.newValues || {},
      reason: req.reason || "",
      status: req.status || "Pending",
      createdAt: req.createdAt,
      updatedAt: req.updatedAt,
    }));

    res.status(200).json(formattedRequests);
  } catch (error) {
    console.error("Get Change Requests Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// 🔵 Approve or Reject request (Admin only)
export const reviewChangeRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status } = req.body;
    console.log('Umang' ,status)

    // 🧩 Role check
    if (req.user.role !== "Admin") {
      return res
        .status(403)
        .json({ message: "Only admin can approve/reject requests" });
    }

    // 🧩 Fetch request
    const request = await DepositChangeRequest.findById(requestId)
      .populate("depositId", "_id amount schemeType date")
      .populate("agentId", "name email role");

    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    if (request.status !== "Pending") {
      return res
        .status(400)
        .json({ message: "This request has already been reviewed" });
    }

    // 🧩 Process action
    if (status === "Approved") {
      const newAmount = request.newValues?.amount;

      if (typeof newAmount !== "number" || newAmount <= 0) {
        return res
          .status(400)
          .json({ message: "Invalid or missing new amount value" });
      }

      // ✅ Update only the amount field in Deposit
      await Deposit.findByIdAndUpdate(request.depositId._id, {
        $set: { amount: newAmount },
      });

      request.status = "Approved";
    } else if (status === "Rejected") {
      request.status = "Rejected";
    } else {
      return res.status(400).json({ message: "Invalid action" });
    }

    // 🧩 Record reviewer
    request.reviewedBy = req.user._id;
    await request.save();

    // 🧩 Re-populate for clean frontend response
    const updatedRequest = await DepositChangeRequest.findById(request._id)
      .populate("depositId", "_id amount schemeType date")
      .populate("agentId", "name email role")
      .populate("reviewedBy", "name");

    // 🧩 Frontend-ready format
    const formatted = {
      id: updatedRequest._id,
      depositId: updatedRequest.depositId?._id,
      requestedBy: {
        name: updatedRequest.agentId?.name || "Unknown",
        email: updatedRequest.agentId?.email || "N/A",
        role: updatedRequest.agentId?.role || "Agent",
      },
      oldValues: updatedRequest.oldValues,
      newValues: updatedRequest.newValues,
      reason: updatedRequest.reason,
      status: updatedRequest.status,
      createdAt: updatedRequest.createdAt,
      updatedAt: updatedRequest.updatedAt,
    };

    res.status(200).json({
      message: `Request ${formatted.status.toLowerCase()} successfully`,
      request: formatted,
    });
  } catch (error) {
    console.error("Review Change Request Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

