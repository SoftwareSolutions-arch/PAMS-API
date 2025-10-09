// controllers/accountChangeRequest.controller.js
import AccountChangeRequest from "../models/AccountChangeRequest.js";
import Account from "../models/Account.js";

export const createChangeRequest = async (req, res) => {
  try {
    const { accountId, newValues, reason } = req.body;
    const user = req.user;

    // Validate required inputs
    if (!accountId || !reason || !newValues) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const account = await Account.findById(accountId);
    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    // Capture only relevant old values for audit trail
    const oldValues = {
      clientName: account.clientName,
      nomineeName: account.nomineeName || "",
      nomineeRelation: account.nomineeRelation || "",
    };

    // Remove empty nominee fields if frontend didn’t send them
    const filteredNewValues = {};
    if (newValues.clientName) filteredNewValues.clientName = newValues.clientName;
    if (newValues.nomineeName) filteredNewValues.nomineeName = newValues.nomineeName;
    if (newValues.nomineeRelation)
      filteredNewValues.nomineeRelation = newValues.nomineeRelation;

    const request = await AccountChangeRequest.create({
      accountId,
      companyId: user.companyId,
      oldValues,
      newValues: filteredNewValues,
      reason,
      requestedBy: user.id,
    });

    res.status(201).json({
      message: "Account change request submitted successfully",
      request,
    });
  } catch (error) {
    console.error("Create Change Request Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getAllChangeRequests = async (req, res) => {
  try {
    const { status } = req.query;

    // 🔹 Default filter: show only pending requests unless status is explicitly passed
    const filter = status ? { status } : { status: "Pending" };

    const requests = await AccountChangeRequest.find(filter)
      .populate("requestedBy", "name email")
      .populate("reviewedBy", "name email")
      .populate("accountId", "clientName accountNumber nomineeName nomineeRelation")
      .sort({ createdAt: -1 }); // latest first

    res.status(200).json(requests);
  } catch (error) {
    console.error("Get Change Requests Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const approveChangeRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const admin = req.user;

    const request = await AccountChangeRequest.findById(id);
    if (!request) return res.status(404).json({ message: "Request not found" });
    if (request.status !== "Pending")
      return res.status(400).json({ message: "Request already processed" });

    // Apply the new values to the Account
    await Account.findByIdAndUpdate(request.accountId, request.newValues, { new: true });

    request.status = "Approved";
    request.reviewedBy = admin._id;
    request.reviewedAt = new Date();
    await request.save();

    res.status(200).json({ message: "Change request approved", request });
  } catch (error) {
    console.error("Approve Change Request Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const rejectChangeRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const admin = req.user;

    const request = await AccountChangeRequest.findById(id);
    if (!request) return res.status(404).json({ message: "Request not found" });
    if (request.status !== "Pending")
      return res.status(400).json({ message: "Request already processed" });

    request.status = "Rejected";
    request.reviewedBy = admin._id;
    request.reviewedAt = new Date();
    await request.save();

    res.status(200).json({ message: "Change request rejected", request });
  } catch (error) {
    console.error("Reject Change Request Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};