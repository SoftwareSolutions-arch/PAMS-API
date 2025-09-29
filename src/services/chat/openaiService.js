// services/chat/openaiService.js
import { getOpenAIClient } from "../../utils/openaiClient.js";

/**
 * Ask GPT for a reply using account context.
 * @param {string} dbSummary - short formatted summary of DB fields
 * @param {string} userMessage
 * @returns {Promise<string>}
 */
export async function askGPT(dbSummary, userMessage) {
    const openai = getOpenAIClient();

    const systemPrompt = `You are a financial assistant.
Use ONLY the account data provided to you when answering questions about that account.
If the requested information is not present in the account data, say "I don't have that info" instead of guessing.
Be concise and user-facing.`;

    const messages = [
        { role: "system", content: systemPrompt },
        { role: "assistant", content: `Account data:\n${dbSummary}` },
        { role: "user", content: userMessage },
    ];

    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
    });

    const reply = completion?.choices?.[0]?.message?.content;
    return (reply || "").trim();
}
