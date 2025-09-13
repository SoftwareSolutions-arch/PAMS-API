// src/middleware/errorMiddleware.js
export const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

export const errorHandler = (err, req, res, next) => {
  console.error("🔥 Error:", err.message); // stack print na karo console pe bhi in prod

  const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;

  const errorResponse = {
    success: false,
    statusCode,
    errorCode: err.code || "INTERNAL_ERROR",
    message: err.message || "Something went wrong"
  };

  // Validation errors
  if (err.name === "ValidationError") {
    errorResponse.errorCode = "VALIDATION_ERROR";
    errorResponse.message = Object.values(err.errors).map(val => val.message).join(", ");
  }

  // Invalid ObjectId
  if (err.name === "CastError" && err.kind === "ObjectId") {
    errorResponse.errorCode = "INVALID_ID";
    errorResponse.message = "Resource not found";
  }

  // Duplicate key
  if (err.code && err.code === 11000) {
    errorResponse.errorCode = "DUPLICATE_KEY";
    errorResponse.message = `Duplicate value entered: ${JSON.stringify(err.keyValue)}`;
  }

  // 🔹 Attach stack ONLY in development
  if (process.env.NODE_ENV === "development") {
    errorResponse.stack = err.stack;
  }

  res.status(statusCode).json(errorResponse);
};
