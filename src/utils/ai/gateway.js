import axios from "axios";
import { log } from "../logger.js";

/**
 * Generic AI gateway wrapper. Returns raw text; caller performs parsing.
 * Retries transient failures once.
 */
export async function askAI(messages, { model = "gpt-4o-mini", maxTokens = 2048 } = {}) {
  const apiKey = (process.env.AI_GATEWAY_KEY || process.env.AI_GATEWAY_API_KEY || process.env.OPEN_AI_API_KEY || "").trim();
  if (!apiKey) {
    log("AI key missing: set AI_GATEWAY_KEY or AI_GATEWAY_API_KEY or OPEN_AI_API_KEY in .env");
    return ""; // Fail soft; caller should handle empty
  }
  const payload = { 
    model, 
    messages,
    max_tokens: maxTokens,
    temperature: 0.7
  };
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await axios.post(process.env.AI_GATEWAY_URL, payload, { headers });
      return res.data.choices?.[0]?.message?.content || "";
    } catch (err) {
      log(`AI request failed (attempt ${attempt}): ${err.message}`);
      if (attempt === 2) throw err;
    }
  }
}

