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
            // Admin has full access but still within their company
            scope.isAll = true;
            break;

        case "Manager":
            // Manager -> their Agents
            const agents = await User.find({
                assignedTo: user._id,
                role: "Agent",
                companyId: user.companyId
            });
            scope.agents = agents.map(a => a._id.toString());

            // Manager -> Clients of their Agents
            const clients = await User.find({
                assignedTo: { $in: scope.agents },
                role: "User",
                companyId: user.companyId
            });
            scope.clients = clients.map(c => c._id.toString());
            break;

        case "Agent":
            // Agent -> their Clients only
            const myClients = await User.find({
                assignedTo: user.id.toString(),
                role: "User",
                companyId: user.companyId
            });
            scope.clients = myClients.map(c => c._id.toString()); ''
            scope.agents = [user.id.toString()];
            break;

        case "User":
            // Client -> only self
            scope.clients = [user.id.toString()];
            break;
    }

    return scope;
};
