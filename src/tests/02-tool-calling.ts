/**
 * 测试 2：工具调用（Tool Calling）
 *
 * LangSmith 测试方向：验证 Agent 能否正确调用工具
 * - 工具是否被正确识别
 * - 参数是否正确传递
 * - 工具结果是否正确解析
 */
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createLLM } from "../agents/llm.js";
import { HumanMessage } from "@langchain/core/messages";

// 定义工具
const searchTool = tool(
  async ({ query }) => {
    // 模拟搜索
    const results: Record<string, string> = {
      langchain: "LangChain 是一个用于构建 LLM 应用的框架，支持链式调用、工具使用、Agent 等。",
      langsmith: "LangSmith 是 LangChain 的可观测性平台，用于追踪、调试和评估 LLM 应用。",
      deepseek: "DeepSeek 是深度求索公司的大语言模型，支持长文本和代码生成。",
    };
    const key = query.toLowerCase();
    return results[key] || `未找到关于 "${query}" 的结果`;
  },
  {
    name: "search",
    description: "搜索技术文档，输入搜索关键词",
    schema: z.object({
      query: z.string().describe("搜索关键词"),
    }),
  }
);

const calculatorTool = tool(
  async ({ expression }) => {
    try {
      // 简单的安全计算
      const result = Function(`"use strict"; return (${expression})`)();
      return `${expression} = ${result}`;
    } catch {
      return `计算错误: 无法计算 "${expression}"`;
    }
  },
  {
    name: "calculator",
    description: "数学计算器，输入数学表达式",
    schema: z.object({
      expression: z.string().describe("数学表达式，如 2+3*4"),
    }),
  }
);

async function testToolCalling() {
  console.log("=== 测试 2：工具调用 ===\n");

  const llm = createLLM(0);
  const tools = [searchTool, calculatorTool];
  const llmWithTools = llm.bindTools(tools);

  // 1. 测试搜索工具
  console.log("1️⃣ 搜索工具调用");
  const resp1 = await llmWithTools.invoke([
    new HumanMessage("帮我搜索一下 LangSmith 是什么"),
  ]);
  console.log(`   工具调用: ${resp1.tool_calls?.length ? "✅ 触发" : "❌ 未触发"}`);
  if (resp1.tool_calls?.length) {
    const call = resp1.tool_calls[0];
    console.log(`   工具名: ${call.name}`);
    console.log(`   参数: ${JSON.stringify(call.args)}`);

    // 执行工具并获取结果
    const toolResult = await searchTool.invoke(call.args);
    console.log(`   结果: ${toolResult}\n`);
  }

  // 2. 测试计算器工具
  console.log("2️⃣ 计算器工具调用");
  const resp2 = await llmWithTools.invoke([
    new HumanMessage("帮我算一下 (15 * 24) + 100"),
  ]);
  console.log(`   工具调用: ${resp2.tool_calls?.length ? "✅ 触发" : "❌ 未触发"}`);
  if (resp2.tool_calls?.length) {
    const call = resp2.tool_calls[0];
    console.log(`   工具名: ${call.name}`);
    console.log(`   参数: ${JSON.stringify(call.args)}`);
    const toolResult = await calculatorTool.invoke(call.args);
    console.log(`   结果: ${toolResult}\n`);
  }

  // 3. 测试不需要工具的情况
  console.log("3️⃣ 不需要工具的普通问题");
  const resp3 = await llmWithTools.invoke([
    new HumanMessage("你好，今天天气不错"),
  ]);
  console.log(`   工具调用: ${resp3.tool_calls?.length ? "触发了（不应该）" : "✅ 未触发（正确）"}`);
  console.log(`   回复: ${resp3.content.toString().substring(0, 100)}\n`);

  console.log("✅ 测试 2 完成\n");
  return true;
}

testToolCalling().catch(console.error);
