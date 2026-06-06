import { ChatOpenAI } from "@langchain/openai";
import { config } from "../config.js";

/**
 * 创建 LLM 实例
 * @param tier "flash" = 快速模型, "pro" = 推理模型
 * @param temperature 温度参数
 * @param reasoningEffort 推理深度（仅 pro 有效）
 */
export function createLLM(
  tier: "flash" | "pro" = "flash",
  temperature = 0.7,
  reasoningEffort?: "low" | "medium" | "high"
) {
  const model = config.deepseek.models[tier];

  const llm = new ChatOpenAI({
    apiKey: config.deepseek.apiKey,
    model,
    temperature,
    maxTokens: tier === "pro" ? 4000 : 2000,
    configuration: { baseURL: config.deepseek.baseUrl },
  });

  // Pro 模型支持 reasoning_effort
  if (tier === "pro" && reasoningEffort) {
    return llm.bind({ reasoning_effort: reasoningEffort } as any);
  }

  return llm;
}

/**
 * 估算 token 成本（DeepSeek 定价）
 * Flash: 输入 ¥0.5/百万, 输出 ¥1/百万
 * Pro: 输入 ¥2/百万, 输出 ¥8/百万
 */
export function estimateCost(
  tier: "flash" | "pro",
  inputTokens: number,
  outputTokens: number,
  reasoningTokens: number = 0
): number {
  if (tier === "flash") {
    return (inputTokens * 0.5 + outputTokens * 1) / 1_000_000;
  }
  // Pro: 推理 token 按输出价格计
  return (inputTokens * 2 + (outputTokens + reasoningTokens) * 8) / 1_000_000;
}
