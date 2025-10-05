import mongoose from "mongoose";

/**
 * Executes a MongoDB operation inside a transaction if USE_TRANSACTIONS=true.
 * Falls back to normal mode for local setups without replica sets.
 */
export async function withTransaction(callback) {
  const useTransaction = process.env.USE_TRANSACTIONS === "true";
  const session = useTransaction ? await mongoose.startSession() : null;

  if (useTransaction) session.startTransaction();

  try {
    const result = await callback(session);
    if (useTransaction) await session.commitTransaction();
    return result;
  } catch (err) {
    if (useTransaction) await session.abortTransaction().catch(() => {});
    throw err;
  } finally {
    if (useTransaction) session?.endSession();
  }
}
