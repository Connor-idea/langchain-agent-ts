/**
 * HR Agent V3 - 基于 Deep Agents
 *
 * Deep Agents 提供:
 * - 规划能力 (write_todos)
 * - 文件系统访问 (read_file, write_file)
 * - 子Agent支持 (task)
 * - 内置提示词和中间件
 */

import { ChatOpenAI } from "@langchain/openai";
import { createDeepAgent } from "deepagents";
import { config } from "../config.js";

// ========== 自定义工具 ==========

import { tool } from "@langchain/core/tools";
import { z } from "zod";

// 市场数据查询工具
const searchMarketData = tool(
  async ({ role, city, level }) => {
    // 模拟市场数据查询
    const marketData: Record<string, any> = {
      "厨师": {
        salary: { min: 4000, max: 8000, median: 6000 },
        supply: "充裕",
        channels: ["58同城", "店员推荐", "本地微信群"],
      },
      "前端开发": {
        salary: { min: 15000, max: 35000, median: 25000 },
        supply: "平衡",
        channels: ["BOSS直聘", "拉勾", "掘金"],
      },
      "财务经理": {
        salary: { min: 15000, max: 40000, median: 25000 },
        supply: "紧缺",
        channels: ["猎聘", "脉脉", "内推"],
      },
    };
    
    const data = marketData[role] || {
      salary: { min: 5000, max: 15000, median: 10000 },
      supply: "未知",
      channels: ["BOSS直聘", "智联招聘"],
    };
    
    return JSON.stringify({
      role,
      city,
      level,
      ...data,
      source: "模拟数据",
      timestamp: new Date().toISOString(),
    });
  },
  {
    name: "search_market_data",
    description: "查询岗位的市场薪资、人才供给和招聘渠道数据",
    schema: z.object({
      role: z.string().describe("岗位名称"),
      city: z.string().describe("城市"),
      level: z.string().describe("级别"),
    }),
  }
);

// JD 生成工具
const generateJobDescription = tool(
  async ({ jobTitle, company, requirements, responsibilities, salary, benefits }) => {
    const jd = `# ${jobTitle}

## 公司简介
${company || "待补充"}

## 岗位职责
${(responsibilities || []).map((r: string, i: number) => `${i + 1}. ${r}`).join("\n")}

## 任职要求
${(requirements || []).map((r: string, i: number) => `${i + 1}. ${r}`).join("\n")}

## 薪资福利
薪资: ${salary || "面议"}
福利:
${(benefits || []).map((b: string) => `- ${b}`).join("\n")}

## 投递方式
请将简历发送至 hr@company.com`;
    
    return jd;
  },
  {
    name: "generate_jd",
    description: "生成职位描述(JD)",
    schema: z.object({
      jobTitle: z.string().describe("岗位名称"),
      company: z.string().optional().describe("公司简介"),
      requirements: z.array(z.string()).optional().describe("任职要求"),
      responsibilities: z.array(z.string()).optional().describe("岗位职责"),
      salary: z.string().optional().describe("薪资范围"),
      benefits: z.array(z.string()).optional().describe("福利待遇"),
    }),
  }
);

// ========== 创建 Agent ==========

export function createHRAgent() {
  const model = new ChatOpenAI({
    model: config.deepseek.models.pro,
    apiKey: config.deepseek.apiKey,
    configuration: { baseURL: config.deepseek.baseUrl },
    temperature: 0.7,
    maxTokens: 4000,
  });

  const agent = createDeepAgent({
    model,
    tools: [searchMarketData, generateJobDescription],
    systemPrompt: `你是一个专业的HR招聘助手。你的任务是帮助用户完成招聘流程。

你的能力：
1. 理解用户的招聘需求（即使是口语化的描述）
2. 查询市场薪资和人才供给数据
3. 生成专业的职位描述(JD)
4. 提供招聘建议（渠道、候选人画像、面试问题）

工作流程：
1. 首先理解用户的需求，提取关键信息（岗位、级别、行业、要求等）
2. 使用 search_market_data 查询市场数据
3. 使用 generate_jd 生成JD
4. 提供完整的招聘建议

注意事项：
- 岗位识别要准确（"招一个厨师"的岗位是"厨师"，不是"招聘"）
- 根据行业调整建议（餐饮、技术、财务等风格不同）
- 输出要实用、具体、可操作
- 如果信息不足，主动询问补充`,
  });

  return agent;
}

// ========== 测试函数 ==========

export async function testDeepAgent() {
  console.log("🚀 Deep Agents HR Agent 测试\n");
  
  const agent = createHRAgent();
  
  const testCases = [
    {
      name: "🍳 厨师场景",
      input: "招一个厨师，做扬州炒饭，会翻锅会切配就行，个体经营户，餐饮行业",
    },
    {
      name: "💻 前端开发场景",
      input: "招一个前端开发，做公寓管理系统后台，要会React，A轮创业公司",
    },
  ];
  
  for (const testCase of testCases) {
    console.log("\n" + "═".repeat(60));
    console.log(testCase.name);
    console.log("═".repeat(60));
    
    try {
      const result = await agent.invoke({
        messages: [
          {
            role: "user",
            content: testCase.input,
          },
        ],
      });
      
      // 输出结果
      const lastMessage = result.messages[result.messages.length - 1];
      console.log("\n📝 Agent 回复:");
      console.log(lastMessage.content);
      
    } catch (err) {
      console.error(`❌ 测试失败: ${(err as Error).message}`);
    }
  }
  
  console.log("\n" + "═".repeat(60));
  console.log("✅ 测试完成");
}

// 直接运行测试
testDeepAgent().catch(console.error);
