import mongoose from "mongoose";

// Uses its own counter document for atomic increments
// {_id: 'ticketNumber', seq: Number}
const COUNTER_ID = "ticketNumber";

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 1000 },
});

export const TicketCounter = mongoose.models.TicketCounter || mongoose.model("TicketCounter", counterSchema, "counters");

export async function getNextTicketNumber(session = null) {
  const opts = { new: true, upsert: true, setDefaultsOnInsert: true };
  if (session) opts.session = session;
  const doc = await TicketCounter.findOneAndUpdate({ _id: COUNTER_ID }, { $inc: { seq: 1 } }, opts).lean();
  return doc.seq;
}
