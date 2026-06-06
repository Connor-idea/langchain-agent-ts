/**
 * 测试 4：评估（Evaluation）
 *
 * LangSmith 测试方向：用自动化方式评估 Agent 输出质量
 * - 正确性：回答是否准确
 * - 相关性：回答是否切题
 * - 完整性：是否遗漏关键信息
 */
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { createLLM } from "../agents/llm.js";

interface TestCase {
  input: string;
  expected: string;
  description: string;
}

const testCases: TestCase[] = [
  {
    input: "LangChain 是什么？",
    expected: "LLM 应用开发框架",
    description: "基础知识问答",
  },
  {
    input: "DeepSeek 和 GPT-4 的区别？",
    expected: "国产/价格/中文",
    description: "竞品对比",
  },
  {
    input: "如何用 LangSmith 调试 Agent？",
    expected: "trace/追踪/调试",
    description: "技术指导",
  },
];

// 评估器 LLM（用另一个 LLM 来评估输出质量）
function createEvaluator() {
  return createLLM(0); // 温度 0，评估要稳定
}

async function evaluateCorrectness(
  input: string,
  output: string,
  expected: string
): Promise<{ score: number; reason: string }> {
  const evaluator = createEvaluator();

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `你是一个严格的质量评估员。评估 AI 回答的正确性。

评分标准：
- 1.0: 完全正确，包含所有关键信息
- 0.7: 基本正确，有小的遗漏
- 0.4: 部分正确，有重要遗漏
- 0.0: 完全错误或不相关

返回格式：分数|原因
示例：0.8|回答基本准确但缺少具体例子`,
    ],
    [
      "human",
      `问题: {input}
期望关键点: {expected}
实际回答: {output}

请评分（返回 格式: 分数|原因）:`,
    ],
  ]);

  const chain = prompt.pipe(evaluator).pipe(new StringOutputParser());
  const result = await chain.invoke({ input, expected, output });

  const [scoreStr, ...reasonParts] = result.split("|");
  const score = parseFloat(scoreStr.trim()) || 0;
  const reason = reasonParts.join("|").trim() || "无法解析评估结果";

  return { score, reason };
}

async function testEvaluation() {
  console.log("=== 测试 4：评估（Evaluation）===\n");

  const llm = createLLM(0.7);
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "你是一个技术助手，回答简洁准确。"],
    ["human", "{input}"],
  ]);
  const chain = prompt.pipe(llm).pipe(new StringOutputParser());

  const results: Array<{
    description: string;
    score: number;
    reason: string;
    passed: boolean;
  }> = [];

  for (const tc of testCases) {
    console.log(`📋 测试: ${tc.description}`);
    console.log(`   输入: ${tc.input}`);

    // 生成回答
    const output = await chain.invoke({ input: tc.input });
    console.log(`   回答: ${output.substring(0, 100)}...`);

    // 评估
    const evalResult = await evaluateCorrectness(tc.input, output, tc.expected);
    const passed = evalResult.score >= 0.6;

    console.log(
      `   评分: ${evalResult.score.toFixed(1)} ${passed ? "✅" : "❌"}`
    );
    console.log(`   原因: ${evalResult.reason}\n`);

    results.push({
      description: tc.description,
      score: evalResult.score,
      reason: evalResult.reason,
      passed,
    });
  }

  // 汇总
  console.log("📊 评估汇总:");
  console.log(`   总测试: ${results.length}`);
  console.log(`   通过: ${results.filter((r) => r.passed).length}`);
  console.log(
    `   平均分: ${(results.reduce((s, r) => s + r.score, 0) / results.length).toFixed(2)}`
  );
  console.log(
    `   结果: ${results.every((r) => r.passed) ? "✅ 全部通过" : "⚠️ 有失败项"}\n`
  );

  console.log("✅ 测试 4 完成\n");
  return results;
}

testEvaluation().catch(console.error);
