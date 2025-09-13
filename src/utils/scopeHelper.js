import User from "../models/User.js";

// Helper to calculate accessible IDs based on role
export const getScope = async (user) => {
    const scope = {
        users: [],     // accessible userIds
        agents: [],    // accessible agentIds
        clients: [],   // accessible clientIds
        isAll: false   // true = Admin (no restrictions)
    };

    if (!user) return scope;

    switch (user.role) {
        case "Admin":
            scope.isAll = true;
            break;

        case "Manager":
            // Manager -> their Agents
            const agents = await User.find({ assignedTo: user._id, role: "Agent" });
            scope.agents = agents.map(a => a._id.toString());

            // Manager -> Clients of their Agents
            const clients = await User.find({ assignedTo: { $in: scope.agents }, role: "User" });
            scope.clients = clients.map(c => c._id.toString());
            break;

        case "Agent":
            // Agent -> their Clients only
            const myClients = await User.find({ assignedTo: user._id, role: "User" });
            scope.clients = myClients.map(c => c._id.toString());
            scope.agents = [user._id.toString()];
            break;

        case "User":
            // Client -> only self
            scope.clients = [user._id.toString()];
            break;
    }

    return scope;
};
