// Utility to generate date filters
export const getDateFilter = (from, to, field = "createdAt") => {
  const filter = {};
  if (from || to) {
    filter[field] = {};
    if (from) filter[field]["$gte"] = new Date(from);
    if (to) filter[field]["$lte"] = new Date(to);
  }
  return filter;
};
