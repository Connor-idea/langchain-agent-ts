/**
 * 测试 3：完整 Agent（LangGraph）
 *
 * LangSmith 测试方向：验证 Agent 的推理-行动循环
 * - Agent 能否正确规划步骤
 * - 工具调用链是否正确
 * - 最终回答是否基于工具结果
 */
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { createLLM } from "../agents/llm.js";

// 模拟知识库查询
const knowledgeBase = tool(
  async ({ topic }) => {
    const kb: Record<string, string> = {
      pricing:
        "星宝科技定价策略：基础版 ¥299/月（个人），专业版 ¥599/月（团队），企业版面议。年付8折。",
      features:
        "核心功能：AI 培训课程生成、智能体工作流、数据分析仪表盘、API 集成。",
      competitor:
        "竞品：A公司定价 ¥199-999/月，B公司定价 ¥399-1299/月。我们定位中端。",
      market:
        "目标市场：中小企业 HR 部门，预计市场规模 ¥50 亿，年增长率 30%。",
    };
    return kb[topic] || `未找到 "${topic}" 相关信息`;
  },
  {
    name: "knowledge_base",
    description: "查询公司知识库，获取产品、定价、竞品、市场等信息",
    schema: z.object({
      topic: z
        .enum(["pricing", "features", "competitor", "market"])
        .describe("查询主题"),
    }),
  }
);

// 分析工具
const analyzeTool = tool(
  async ({ data, method }) => {
    // 模拟分析
    return `使用 ${method} 分析数据：${data}。结论：整体趋势向好，建议加大市场投入。`;
  },
  {
    name: "analyze",
    description: "数据分析工具，支持 SWOT、PESTLE、波特五力等分析方法",
    schema: z.object({
      data: z.string().describe("要分析的数据或描述"),
      method: z
        .enum(["SWOT", "PESTLE", "波特五力", "竞品分析"])
        .describe("分析方法"),
    }),
  }
);

async function testAgent() {
  console.log("=== 测试 3：完整 Agent ===\n");

  const llm = createLLM(0.7);
  const tools = [knowledgeBase, analyzeTool];
  const llmWithTools = llm.bindTools(tools);

  // 测试场景：多步推理
  console.log("📋 场景：帮我分析星宝科技的定价策略是否合理\n");

  const messages: any[] = [
    new HumanMessage(
      "帮我分析星宝科技的定价策略是否合理。需要：1）先查定价 2）查竞品 3）做竞品分析"
    ),
  ];

  // 模拟 Agent 循环（简化版 ReAct）
  let step = 0;
  const maxSteps = 5;

  while (step < maxSteps) {
    step++;
    console.log(`--- Step ${step} ---`);

    const response = await llmWithTools.invoke(messages);
    messages.push(response);

    if (response.tool_calls?.length) {
      for (const call of response.tool_calls) {
        console.log(`🔧 调用工具: ${call.name}`);
        console.log(`   参数: ${JSON.stringify(call.args)}`);

        const toolMap: Record<string, any> = {
          knowledge_base: knowledgeBase,
          analyze: analyzeTool,
        };

        const toolFn = toolMap[call.name];
        if (toolFn) {
          const result = await toolFn.invoke(call.args);
          console.log(`   结果: ${result.substring(0, 100)}...`);

          // 将工具结果加入消息
          messages.push({
            role: "tool",
            content: result,
            tool_call_id: call.id!,
          });
        }
      }
    } else {
      // 没有工具调用，Agent 给出最终回答
      console.log(`\n📝 最终回答:\n${response.content}`);
      break;
    }
  }

  if (step >= maxSteps) {
    console.log("⚠️ 达到最大步数限制");
  }

  console.log("\n✅ 测试 3 完成\n");
  return true;
}

testAgent().catch(console.error);
