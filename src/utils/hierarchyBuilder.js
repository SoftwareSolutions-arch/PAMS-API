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

export function buildCompanyHierarchy(company, users, { includeEmail = false } = {}) {
  const admins = users.filter((u) => u.role === "Admin");

  if (admins.length === 0) {
    return {
      company: company.companyName,
      hierarchy: null,
    };
  }

  // If single admin, return under `admin`, else `admins`
  if (admins.length === 1) {
    const adminTree = buildUserSubtree(admins[0], users, { includeEmail });
    return {
      company: company.companyName,
      hierarchy: {
        admin: adminTree,
      },
    };
  }

  const adminTrees = admins.map((a) => buildUserSubtree(a, users, { includeEmail }));
  return {
    company: company.companyName,
    hierarchy: {
      admins: adminTrees,
    },
  };
}
