// models/Counter.js
import mongoose from "mongoose";

const counterSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true }, // e.g. "Yearly", "Monthly"
  seq: { type: Number, default: 100000 }, // starting number
});

export const Counter = mongoose.model("Counter", counterSchema);
