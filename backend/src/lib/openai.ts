import OpenAI from "openai";

export const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
