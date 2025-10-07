// src/utils/hierarchyBuilder.js
// Pure helpers to assemble hierarchical org structures from flat user lists

function toIdString(id) {
  return id && id.toString ? id.toString() : String(id);
}

function shapeUser(user, { includeEmail = false } = {}) {
  const shaped = {
    _id: user._id,
    name: user.name,
    role: user.role,
  };
  if (includeEmail && user.email) shaped.email = user.email;
  return shaped;
}

export function buildUserSubtree(rootUser, users, { includeEmail = false } = {}) {
  const idToUser = new Map(users.map((u) => [toIdString(u._id), u]));
  const childrenByParent = new Map();
  for (const u of users) {
    const parentId = u.assignedTo ? toIdString(u.assignedTo) : null;
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
    childrenByParent.get(parentId).push(u);
  }

  const buildFor = (user) => {
    const shaped = shapeUser(user, { includeEmail });

    if (user.role === "Admin") {
      const managers = (childrenByParent.get(toIdString(user._id)) || [])
        .filter((u) => u.role === "Manager");

      // Also include managers without assignedTo (common pattern) belonging to same company
      const unassignedManagers = (childrenByParent.get(null) || []).filter(
        (u) => u.role === "Manager" && toIdString(u.companyId) === toIdString(user.companyId)
      );

      const uniqueManagers = new Map();
      for (const m of [...managers, ...unassignedManagers]) {
        uniqueManagers.set(toIdString(m._id), m);
      }

      shaped.managers = Array.from(uniqueManagers.values()).map((m) => buildFor(m));
      return shaped;
    }

    if (user.role === "Manager") {
      const agents = (childrenByParent.get(toIdString(user._id)) || []).filter(
        (u) => u.role === "Agent"
      );
      shaped.agents = agents.map((a) => buildFor(a));
      return shaped;
    }

    if (user.role === "Agent") {
      const clients = (childrenByParent.get(toIdString(user._id)) || []).filter(
        (u) => u.role === "User"
      );
      shaped.clients = clients.map((c) => buildFor(c));
      return shaped;
    }

    // User/Client: leaf
    return shaped;
  };

  return buildFor(rootUser);
}

function buildManagersStructure(users, { includeEmail = false } = {}) {
  const byParent = new Map();
  const idStr = (x) => (x && x.toString ? x.toString() : String(x));
  for (const u of users) {
    const parent = u.assignedTo ? idStr(u.assignedTo) : null;
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent).push(u);
  }

  const managers = users.filter((u) => u.role === "Manager");

  const mapAgent = (agent) => {
    const shapedAgent = shapeUser(agent, { includeEmail });
    const clients = (byParent.get(idStr(agent._id)) || []).filter((u) => u.role === "User");
    shapedAgent.clients = clients.map((c) => shapeUser(c, { includeEmail }));
    return shapedAgent;
  };

  const mapManager = (manager) => {
    const shapedManager = shapeUser(manager, { includeEmail });
    const agents = (byParent.get(idStr(manager._id)) || []).filter((u) => u.role === "Agent");
    shapedManager.agents = agents.map(mapAgent);
    return shapedManager;
  };

  return { managers: managers.map(mapManager) };
}

export function buildCompanyHierarchy(company, users, { includeEmail = false } = {}) {
  // Admins listed at top level (no duplication of structure under each admin)
  const admins = users
    .filter((u) => u.role === "Admin")
    .map((a) => shapeUser(a, { includeEmail }));

  const structure = buildManagersStructure(users, { includeEmail });

  return {
    company: company.companyName,
    hierarchy: {
      admins,
      structure,
    },
  };
}
