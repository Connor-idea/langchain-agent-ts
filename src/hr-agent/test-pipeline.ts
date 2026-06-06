/**
 * HR Agent Pipeline 测试
 *
 * 测试完整流程：评估 → 市场 → 访谈 → 生成
 * 使用模拟搜索结果避免真实 API 调用
 */

import { HRPipeline, formatPipelineResult } from "./pipeline.js";

console.log("=".repeat(60));
console.log("🚀 HR Agent Pipeline 测试");
console.log("=".repeat(60));

const pipeline = new HRPipeline();

// ========== 场景 1: 完整流程（带市场数据） ==========
console.log("\n📋 场景 1: 完整流程（带市场数据）");
console.log("=".repeat(60));

const result1 = await pipeline.run({
  rawDescription: "招一个前端开发，做我们的公寓管理系统后台",
  city: "上海",
  level: "中级",
  department: {
    name: "研发部",
    mission: "支撑公寓管理SaaS系统的研发迭代",
    team: "现有 3 名后端 + 1 名前端",
  },
  business: {
    stage: "A轮",
    industry: "PropTech",
    product: "公寓管理SaaS",
  },
  mockSearchResults: {
    salary: `
      上海前端开发薪资 2025
      BOSS直聘: 中级前端 15K-25K，高级 25K-40K
      猎聘: 3-5年经验 18K-30K
      拉勾: React前端 16K-28K
    `,
    supply: `
      上海前端开发人才市场
      需求增长15%，供给增长8%，供不应求
      平均招聘周期21天
      React和Vue开发者最受欢迎
    `,
    skills: `
      前端技能要求 2025
      React 85% JD提及，Vue 72%，TypeScript 68%
      Node.js 45%，Next.js 38%
      Tailwind CSS 28%
    `,
  },
});

console.log("\n" + formatPipelineResult(result1));

// ========== 场景 2: 跳过访谈 ==========
console.log("\n\n📋 场景 2: 跳过访谈（已有完整信息）");
console.log("=".repeat(60));

const result2 = await pipeline.run({
  rawDescription:
    "招一个高级前端，5年以上React经验，做过大型SaaS系统，能独立负责前端架构",
  city: "上海",
  level: "高级",
  skipInterview: true,
  mockSearchResults: {
    salary: "上海高级前端 30K-50K，资深 40K-60K",
  },
});

console.log("\n" + formatPipelineResult(result2));

// ========== 场景 3: 无市场数据（降级） ==========
console.log("\n\n📋 场景 3: 无市场数据（降级处理）");
console.log("=".repeat(60));

const result3 = await pipeline.run({
  rawDescription: "招一个GIS开发工程师",
  city: "成都",
});

console.log("\n" + formatPipelineResult(result3));

console.log("\n" + "=".repeat(60));
console.log("✅ Pipeline 测试完成");
console.log("=".repeat(60));
