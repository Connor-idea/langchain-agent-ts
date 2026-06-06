/**
 * LangSmith 追踪测试
 *
 * 验证 LangSmith 是否正确记录每次调用
 */

import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { config } from "./config.js";

async function main() {
  console.log("🔍 LangSmith 追踪测试\n");

  // 检查配置
  console.log("配置检查:");
  console.log("  LANGCHAIN_TRACING_V2:", process.env.LANGCHAIN_TRACING_V2);
  console.log("  LANGCHAIN_PROJECT:", process.env.LANGCHAIN_PROJECT);
  console.log("  LANGSMITH_API_KEY:", process.env.LANGSMITH_API_KEY ? "已配置" : "未配置");
  console.log("");

  // 创建模型
  const model = new ChatOpenAI({
    model: config.deepseek.models.flash,
    apiKey: config.deepseek.apiKey,
    configuration: { baseURL: config.deepseek.baseUrl },
    temperature: 0.7,
    maxTokens: 500,
  });

  // 创建 Prompt
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "你是一个测试助手。简短回答。"],
    ["human", "{input}"],
  ]);

  // 创建 Chain
  const chain = prompt.pipe(model).pipe(new StringOutputParser());

  // 运行测试
  console.log("⏳ 运行测试调用...");
  const result = await chain.invoke({
    input: "用一句话介绍你自己",
  });

  console.log("✅ 结果:", result);
  console.log("");
  console.log("📊 请在 LangSmith 控制台查看追踪:");
  console.log("   https://smith.langchain.com/");
  console.log(`   项目: ${config.langsmith.project}`);
}

main().catch(console.error);
