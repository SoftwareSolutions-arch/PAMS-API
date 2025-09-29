// controllers/chatController.js
import { handleQuestion } from "../services/chat/questionHandlers.js";

export const chatWithAI = async (req, res, next) => {
  try {
    const { message, selectedAccountNumber } = req.body;
    if (!message) return res.status(400).json({ error: "Message is required" });

    const result = await handleQuestion(req, message, { selectedAccountNumber });

    if (result.handledBy === "forbidden") {
      return res.status(403).json({ error: result.reply });
    }

    // if choose-account, include accounts list payload
    if (result.handledBy === "choose-account") {
      return res.json({ reply: result.reply, handledBy: result.handledBy, accounts: result.accounts });
    }

    return res.json({ reply: result.reply, handledBy: result.handledBy });
  } catch (err) {
    console.error("ChatController Error:", err);
    next(err);
  }
};
