import UserAddress from "../models/UserAddress.js";
import User from "../models/User.js";


/**
 * @desc Create a new client address
 * @route POST /api/clients/:userId/addresses
 */
export const createUserAddress = async (req, res) => {
  try {
    const { userId } = req.params;
    const { companyId } = req.user;
    const payload = req.body;

    if (!payload.lat || !payload.lng) {
      return res
        .status(400)
        .json({ message: "Latitude and longitude are required" });
    }

    // 🔹 Fetch the user to get assigned agent
    const user = await User.findOne({ _id: userId, companyId });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 🔹 Extract agentId from user's assignedTo
    const agentId = user.assignedTo;
    console.log("agentId" ,agentId)
    if (!agentId) {
      return res.status(400).json({
        message: "User is not assigned to any agent",
      });
    }

    // 🔍 Check if this user already has an address
    const existingAddress = await UserAddress.findOne({ userId, companyId });

    if (existingAddress) {
      return res.status(400).json({
        message:
          "Address already exists for this user. Please update the existing address instead.",
      });
    }

    // ✅ Create new address
    const address = await UserAddress.create({
      ...payload,
      userId,
      agentId,
      companyId,
    });

    return res.status(201).json({
      message: "Client address created successfully",
      data: address,
    });
  } catch (err) {
    console.error("Error creating address:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};


export const getAgentClientAddresses = async (req, res) => {
  try {
    const { companyId, id: agentId, role } = req.user;
    const { 
      agentFilterId,
      city, 
      state, 
      pinCode, 
      page = 1, 
      limit = 10 
    } = req.query;

    // 🧩 Base filter
    let filter = { companyId };

    // 🔐 Role-based filtering
    if (role === "Agent") {
      filter.agentId = agentId;
    } else if (role === "Admin") {
      if (agentFilterId) filter.agentId = agentFilterId;
    } else {
      return res.status(403).json({ message: "Access denied" });
    }

    // 🔍 Optional search filters
    if (city) filter.city = new RegExp(city, "i"); // case-insensitive partial match
    if (state) filter.state = new RegExp(state, "i");
    if (pinCode) filter.pinCode = new RegExp(pinCode, "i");

    // 📊 Pagination logic
    const pageNum = parseInt(page, 10) || 1;
    const pageLimit = parseInt(limit, 10) || 10;
    const skip = (pageNum - 1) * pageLimit;

    // 🧮 Count total records before pagination
    const totalRecords = await UserAddress.countDocuments(filter);

    // 🗂️ Fetch paginated records
    const addresses = await UserAddress.find(filter)
      .populate("userId", "name email phone")
      .populate("agentId", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageLimit);

    // 📦 Pagination metadata
    const totalPages = Math.ceil(totalRecords / pageLimit);

    res.status(200).json({
      message:
        role === "Admin"
          ? "Fetched all client addresses for your company."
          : "Fetched addresses of your assigned clients.",
      // pagination: {
      //   totalRecords,
      //   totalPages,
      //   currentPage: pageNum,
      //   limit: pageLimit,
      //   hasNextPage: pageNum < totalPages,
      // },
      count: addresses.length,
      data: addresses,
    });
  } catch (err) {
    console.error("Error fetching client addresses:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * @desc Get all addresses of a user
 * @route GET /api/clients/:userId/addresses
 */
export const getUserAddresses = async (req, res) => {
  try {
    const { userId } = req.params;
    const { companyId } = req.user;

    const addresses = await UserAddress.find({ userId, companyId }).sort({ createdAt: -1 });

    res.status(200).json({
      message: "Client addresses fetched successfully",
      count: addresses.length,
      data: addresses,
    });
  } catch (err) {
    console.error("Error fetching addresses:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * @desc Get single address by ID
 * @route GET /api/clients/:userId/addresses/:addressId
 */
export const getUserAddressById = async (req, res) => {
  try {
    const { userId, addressId } = req.params;
    const { companyId } = req.user;

    const address = await UserAddress.findOne({ _id: addressId, userId, companyId });
    if (!address) return res.status(404).json({ message: "Address not found" });

    res.status(200).json({ message: "Address fetched successfully", data: address });
  } catch (err) {
    console.error("Error fetching address:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * @desc Update a specific address
 * @route PUT /api/clients/:userId/addresses/:addressId
 */
export const updateUserAddress = async (req, res) => {
  try {
    const { userId, addressId } = req.params;
    const { companyId } = req.user;
    const updates = req.body;

    const updated = await UserAddress.findOneAndUpdate(
      { _id: addressId, userId, companyId },
      updates,
      { new: true }
    );

    if (!updated) return res.status(404).json({ message: "Address not found" });

    res.status(200).json({ message: "Address updated successfully", data: updated });
  } catch (err) {
    console.error("Error updating address:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * @desc Delete a specific address
 * @route DELETE /api/clients/:userId/addresses/:addressId
 */
export const deleteUserAddress = async (req, res) => {
  try {
    const { userId, addressId } = req.params;
    const { companyId } = req.user;

    const deleted = await UserAddress.findOneAndDelete({
      _id: addressId,
      userId,
      companyId,
    });

    if (!deleted) return res.status(404).json({ message: "Address not found" });

    res.status(200).json({ message: "Address deleted successfully" });
  } catch (err) {
    console.error("Error deleting address:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
