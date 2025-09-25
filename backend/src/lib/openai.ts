import OpenAI from "openai";

export const model = process.env.LLM_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
export const openai = new OpenAI({ apiKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY });
