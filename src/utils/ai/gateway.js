import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { log } from "../logger.js";

/**
 * Generic AI gateway wrapper using Vercel AI SDK via Vercel AI Gateway.
 * Returns raw text; caller performs parsing.
 */
export async function askAI(messages, { model = "gpt-4o-mini", maxTokens = 2048 } = {}) {
  const apiKey = (process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY || "").trim();
  if (!apiKey) {
    log("AI key missing: set OPENAI_API_KEY in .env");
    return "";
  }

  // Vercel AI Gateway keys (vck_...) use gateway base URL + provider-prefixed model names.
  // Standard OpenAI keys (sk-...) hit api.openai.com directly.
  const isVercelGateway = apiKey.startsWith("vck_");
  const baseURL = isVercelGateway ? "https://ai-gateway.vercel.sh/v1" : undefined;
  // Vercel gateway expects model as "openai/gpt-4o-mini"; direct OpenAI expects "gpt-4o-mini"
  const resolvedModel = isVercelGateway && !model.includes("/") ? `openai/${model}` : model;

  const client = createOpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });

  // Split system message from the rest
  const system = messages.find(m => m.role === "system")?.content;
  const prompt = messages.filter(m => m.role !== "system").map(m => m.content).join("\n");

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { text } = await generateText({
        model: client(resolvedModel),
        ...(system ? { system } : {}),
        prompt,
        maxTokens,
        temperature: 0.7,
      });
      return text;
    } catch (err) {
      log(`AI request failed (attempt ${attempt}): ${err.message}`);
      if (attempt === 2) throw err;
    }
  }
}
