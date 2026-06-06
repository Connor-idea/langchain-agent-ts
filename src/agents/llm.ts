import { ChatOpenAI } from "@langchain/openai";
import { config } from "../config.js";

export function createLLM(temperature = 0.7) {
  return new ChatOpenAI({
    apiKey: config.deepseek.apiKey,
    model: config.deepseek.model,
    temperature,
    configuration: {
      baseURL: config.deepseek.baseUrl,
    },
  });
}
