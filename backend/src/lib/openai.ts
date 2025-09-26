import OpenAI from "openai";

export const model = process.env.LLM_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";

const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
export const openai = apiKey ? new OpenAI({ apiKey }) : null;
