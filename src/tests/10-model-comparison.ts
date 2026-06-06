/**
 * 模型对比实验：Flash vs Pro
 *
 * 用同一个测试集，分别用 flash 和 pro 跑，对比：
 * - 质量（审查评分）
 * - 速度（耗时）
 * - 成本（token 费用）
 */
import { config } from "dotenv";
config();

import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { config as appConfig } from "../config.js";

interface ModelResult {
  model: string;
  response: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  latencyMs: number;
  estimatedCostRMB: number;
}

async function testModel(
  tier: "flash" | "pro",
  prompt: string,
  systemPrompt: string
): Promise<ModelResult> {
  const model = appConfig.deepseek.models[tier];
  const llm = new ChatOpenAI({
    apiKey: appConfig.deepseek.apiKey,
    model,
    temperature: 0.7,
    maxTokens: tier === "pro" ? 4000 : 2000,
    configuration: { baseURL: appConfig.deepseek.baseUrl },
  });

  const chain = ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    ["human", "{input}"],
  ])
    .pipe(llm)
    .pipe(new StringOutputParser());

  const start = Date.now();
  const response = await chain.invoke({ input: prompt });
  const latencyMs = Date.now() - start;

  // 估算 token（DeepSeek 定价）
  const inputTokens = Math.ceil((systemPrompt.length + prompt.length) / 2);
  const outputTokens = Math.ceil(response.length / 2);
  const reasoningTokens = tier === "pro" ? Math.ceil(outputTokens * 1.5) : 0;

  const cost =
    tier === "flash"
      ? (inputTokens * 0.5 + outputTokens * 1) / 1_000_000
      : (inputTokens * 2 + (outputTokens + reasoningTokens) * 8) / 1_000_000;

  return {
    model,
    response,
    inputTokens,
    outputTokens,
    reasoningTokens,
    latencyMs,
    estimatedCostRMB: cost,
  };
}

async function main() {
  console.log("🧪 模型对比实验：Flash vs Pro\n");

  const testCases = [
    {
      name: "组织诊断",
      system: "你是资深组织发展顾问。分析以下场景，给出300字诊断结论。",
      input: "团队5个后端0个前端，预算15-25K，急招前端做管理后台和数据大屏。公司做餐饮数字化，成长阶段。",
    },
    {
      name: "JD 审查",
      system: "你是技术总监。审查以下 JD，给出评分(1-10)和3条改进建议。",
      input: "前端开发工程师，3年经验，精通React，负责管理后台开发，薪资15-25K。",
    },
    {
      name: "结构化输出",
      system: "将以下文本转为JSON格式，包含title、level、skills数组。",
      input: "高级前端工程师，需要React、TypeScript、3年以上经验",
    },
  ];

  for (const tc of testCases) {
    console.log(`📋 ${tc.name}`);
    console.log("-".repeat(50));

    const [flashResult, proResult] = await Promise.all([
      testModel("flash", tc.input, tc.system),
      testModel("pro", tc.input, tc.system),
    ]);

    console.log(`  Flash (${flashResult.latencyMs}ms): ${flashResult.response.substring(0, 100)}...`);
    console.log(`  Pro   (${proResult.latencyMs}ms): ${proResult.response.substring(0, 100)}...`);
    console.log(
      `  成本: Flash ¥${flashResult.estimatedCostRMB.toFixed(6)} vs Pro ¥${proResult.estimatedCostRMB.toFixed(6)}`
    );
    console.log(
      `  速度比: ${((proResult.latencyMs / flashResult.latencyMs) * 100).toFixed(0)}% (${flashResult.latencyMs}ms vs ${proResult.latencyMs}ms)\n`
    );
  }

  console.log("✅ 实验完成");
}

main().catch(console.error);
