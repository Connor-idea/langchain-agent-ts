/**
 * 测试：JD 生成器 V3 — 深度优化版
 */
import { config } from "dotenv";
config();

import { generateJDV3, type JDDraftInput } from "../hr-agent/jd-generator-v3.js";

const input: JDDraftInput = {
  requirement: {
    title: "前端开发工程师",
    rawNeed:
      "我们需要一个前端，主要做客户管理后台和数据大屏。后端用 Java，前端打算用 React。最好 3 年以上经验，能独立负责模块。薪资 15-25K。急招，现在前端活都是后端兼着做的，质量不行。",
    budget: { min: 15, max: 25 },
    urgency: "紧急",
  },
  department: {
    name: "技术部",
    mission: "负责餐饮 SaaS 产品的技术研发",
    team: [
      { role: "后端开发", level: "高级", yearsOfExp: 5, keySkills: ["Java", "微服务"], replaceable: false },
      { role: "后端开发", level: "中级", yearsOfExp: 3, keySkills: ["Java", "Spring Boot"], replaceable: false },
      { role: "后端开发", level: "中级", yearsOfExp: 2, keySkills: ["Java", "MySQL"], replaceable: true },
      { role: "后端开发", level: "初级", yearsOfExp: 1, keySkills: ["Java"], replaceable: true },
      { role: "测试", level: "中级", yearsOfExp: 2, keySkills: ["接口测试"], replaceable: true },
    ],
    managementStyle: "扁平",
    culture: ["务实", "结果导向", "快速迭代"],
    collaboration: "小团队，需求和技术直接对接，没有中间层",
    topChallenge: "没有前端，后端兼做前端，进度慢质量差",
  },
  business: {
    companyName: "星宝科技",
    industry: "餐饮数字化",
    stage: "成长",
    bossExpectation: "前端来了要把管理后台和数据大屏做出来，让客户看到产品是专业的。不能只写页面，要理解业务。",
    strategy: "从项目制转向产品制，标准化交付",
    businessGoals: ["Q3 管理后台 V1.0 上线", "Q4 数据大屏模块", "年底前 10 个付费客户"],
    budgetConstraint: "紧张",
    implicitRequirements: "最好能带团队前端水平，以后可以带人。不要只会切图的，要有产品思维。",
  },
};

async function main() {
  console.log("🚀 JD 生成器 V3 — 深度优化版\n");
  console.log("优化点：并行审查 | 结构化输出 | 成本追踪 | 审查校准\n");
  console.log("=".repeat(60));

  const result = await generateJDV3(input, {
    maxIterations: 2,
    onProgress: (msg) => console.log(msg),
  });

  console.log("=".repeat(60));
  console.log("📋 组织诊断：\n");
  console.log(result.diagnosis.substring(0, 500) + "...\n");

  console.log("=".repeat(60));
  console.log("📄 结构化 JD（JSON Schema）：\n");
  console.log(JSON.stringify(result.jd, null, 2).substring(0, 2000) + "...\n");

  console.log("=".repeat(60));
  console.log("📄 文本版 JD：\n");
  console.log(result.jdText.substring(0, 2000) + "...\n");

  console.log("=".repeat(60));
  console.log("📊 审查汇总：\n");
  for (let i = 0; i < result.iterations; i++) {
    const reviews = result.reviews.slice(i * 5, i * 5 + 5);
    console.log(`--- 迭代 ${i + 1} ---`);
    reviews.forEach((r) => {
      const icon = r.verdict === "通过" ? "✅" : r.verdict === "需修订" ? "⚠️" : "❌";
      console.log(`  ${icon} ${r.role}: ${r.score}/10 - ${r.issues.length}个问题`);
    });
  }

  console.log("\n=".repeat(60));
  console.log("💰 成本统计：\n");
  console.log(`  LLM 调用次数: ${result.cost.llmCalls}`);
  console.log(`  总耗时: ${(result.cost.totalDurationMs / 1000).toFixed(1)}s`);
  console.log(`  Token 消耗: ${result.cost.totalTokens}`);
  console.log(`  预估费用: ¥${result.cost.estimatedCostRMB.toFixed(4)}`);
}

main().catch(console.error);
