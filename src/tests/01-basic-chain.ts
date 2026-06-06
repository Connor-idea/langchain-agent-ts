/**
 * 测试 1：基础 Chain（链式调用）
 *
 * LangSmith 测试方向：验证 LLM 基础调用是否正常
 * - 模型能否正常响应
 * - 输出格式是否符合预期
 * - Token 消耗是否合理
 */
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { createLLM } from "../agents/llm.js";

async function testBasicChain() {
  console.log("=== 测试 1：基础 Chain ===\n");

  const llm = createLLM(0.7);

  // 1. 简单调用
  console.log("1️⃣ 简单调用");
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "你是一个专业的技术助手，回答简洁准确。"],
    ["human", "{input}"],
  ]);

  const chain = prompt.pipe(llm).pipe(new StringOutputParser());

  const result = await chain.invoke({
    input: "用一句话解释什么是 LangChain",
  });
  console.log(`   回复: ${result}`);
  console.log(`   长度: ${result.length} 字符\n`);

  // 2. 多轮对话
  console.log("2️⃣ 多轮对话 Chain");
  const multiTurnPrompt = ChatPromptTemplate.fromMessages([
    ["system", "你是一个产品经理顾问。"],
    ["placeholder", "{history}"],
    ["human", "{input}"],
  ]);

  const multiChain = multiTurnPrompt.pipe(llm).pipe(new StringOutputParser());

  const result2 = await multiChain.invoke({
    history: [
      ["human", "我在做一个 AI 培训产品"],
      ["ai", "好的，请告诉我更多细节。"],
    ],
    input: "目标用户是中小企业 HR，怎么定价？",
  });
  console.log(`   回复: ${result2.substring(0, 150)}...\n`);

  // 3. 结构化输出（用 withStructuredOutput）
  console.log("3️⃣ 结构化输出（JSON）");
  const { z } = await import("zod");

  const schema = z.object({
    summary: z.string().describe("一句话总结"),
    category: z.enum(["技术", "产品", "运营", "其他"]),
    confidence: z.number().min(0).max(1),
  });

  const structuredLlm = llm.withStructuredOutput(schema);
  const result3 = await structuredLlm.invoke(
    "LangSmith 可以追踪 LLM 调用链路，方便调试和优化"
  );
  console.log(`   结果: ${JSON.stringify(result3, null, 2)}\n`);

  console.log("✅ 测试 1 完成\n");
  return true;
}

testBasicChain().catch(console.error);
