import mongoose from "mongoose";
import User from "../models/User.js";

export const getScope = async (user) => {
  const scope = { users: [], agents: [], clients: [], isAll: false };
  if (!user) return scope;

  // ✅ Normalize IDs
  const userId = user._id instanceof mongoose.Types.ObjectId 
    ? user._id 
    : new mongoose.Types.ObjectId(user.id);
    
  const companyId = user.companyId instanceof mongoose.Types.ObjectId 
    ? user.companyId 
    : new mongoose.Types.ObjectId(user.companyId);

  switch (user.role) {
    case "Admin":
      scope.isAll = true;
      break;

    case "Manager": {
      // ✅ Find all Agents assigned to this Manager
      const agents = await User.find({
        assignedTo: userId,
        role: "Agent",
        companyId,
      }).select("_id");

      scope.agents = agents.map(a => a._id);

      // ✅ Find Clients assigned to those Agents
      if (scope.agents.length > 0) {
        const clients = await User.find({
          assignedTo: { $in: scope.agents },
          role: "User",
          companyId,
        }).select("_id");

        scope.clients = clients.map(c => c._id);
      }
      break;
    }

    case "Agent": {
      // ✅ Get Clients under this Agent
      const clients = await User.find({
        assignedTo: userId,
        role: "User",
        companyId,
      }).select("_id");
      scope.clients = clients.map(c => c._id);
      scope.agents = [userId];
      break;
    }

    case "User":
      scope.clients = [userId];
      break;
  }

  return scope;
};
