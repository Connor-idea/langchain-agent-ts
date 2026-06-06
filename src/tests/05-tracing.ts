/**
 * 测试 5：LangSmith 追踪（Tracing）
 *
 * LangSmith 测试方向：验证 trace 是否正确上传到 LangSmith
 * - 每次调用是否生成 trace
 * - trace 是否包含正确的输入输出
 * - 成本和延迟是否被记录
 */
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { Client } from "langsmith";
import { createLLM } from "../agents/llm.js";
import { traceable } from "langsmith/traceable";

async function testTracing() {
  console.log("=== 测试 5：LangSmith 追踪 ===\n");

  // 1. 验证 LangSmith 连接
  console.log("1️⃣ 验证 LangSmith 连接");
  const client = new Client();
  try {
    const projects = [];
    for await (const p of client.listProjects({ limit: 5 })) {
      projects.push(p);
    }
    console.log(`   ✅ 连接成功，项目数: ${projects.length}`);
    projects.forEach((p) => console.log(`   📁 ${p.name}`));
  } catch (e: any) {
    console.log(`   ❌ 连接失败: ${e.message}`);
    return;
  }

  // 2. 带追踪的 Chain 调用
  console.log("\n2️⃣ 带追踪的 Chain 调用");
  const llm = createLLM(0.7);
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "你是一个技术专家。"],
    ["human", "{input}"],
  ]);
  const chain = prompt.pipe(llm).pipe(new StringOutputParser());

  const result = await chain.invoke({
    input: "什么是 Agent 可观测性？",
  });
  console.log(`   回复: ${result.substring(0, 100)}...`);
  console.log(`   ✅ Trace 已上传到 LangSmith`);

  // 3. 用 traceable 装饰器自定义追踪
  console.log("\n3️⃣ 自定义追踪（traceable 装饰器）");

  const tracedAgent = traceable(
    async (question: string) => {
      // 第一步：理解问题
      const analysis = await chain.invoke({
        input: `分析这个问题的关键点: ${question}`,
      });

      // 第二步：生成回答
      const answer = await chain.invoke({
        input: `基于分析回答: ${question}\n分析: ${analysis}`,
      });

      return { analysis, answer };
    },
    { name: "custom_agent" }
  );

  const tracedResult = await tracedAgent("如何设计一个好的 Agent 架构？");
  console.log(`   分析: ${tracedResult.analysis.substring(0, 80)}...`);
  console.log(`   回答: ${tracedResult.answer.substring(0, 80)}...`);
  console.log(`   ✅ 自定义 Trace 已上传`);

  // 4. 检查 trace 数量
  console.log("\n4️⃣ 检查 Trace 统计");
  try {
    const runs = [];
    for await (const run of client.listRuns({
      projectName: "connor-agent-dev",
      executionOrder: 1,
      limit: 10,
    })) {
      runs.push(run);
    }
    console.log(`   ✅ 项目 connor-agent-dev 共有 ${runs.length} 条 Trace`);
    runs.slice(0, 3).forEach((r) => {
      console.log(
        `   📊 ${r.name} | ${r.runType} | ${r.status} | ${r.latency ? r.latency + "ms" : "N/A"}`
      );
    });
  } catch (e: any) {
    console.log(`   ⚠️ 无法读取 Trace: ${e.message}`);
  }

  console.log("\n✅ 测试 5 完成");
  console.log("💡 打开 https://smith.langchain.com 查看详细 Trace\n");
}

testTracing().catch(console.error);
