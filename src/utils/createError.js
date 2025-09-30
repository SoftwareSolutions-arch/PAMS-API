// utils/createError.js
export const createError = (status, message) => {
  const err = new Error(message || "Unexpected Error");
  err.status = status || 500;
  return err;
};
