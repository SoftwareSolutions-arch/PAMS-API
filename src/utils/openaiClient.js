// utils/openaiClient.js
import OpenAI from "openai";

let openaiInstance = null;

/**
 * Lazy initializer for OpenAI client
 * Ensures only one instance is created and reused
 */
export function getOpenAIClient() {
  if (!openaiInstance) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("Missing OPENAI_API_KEY in environment");
    }
    openaiInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiInstance;
}
