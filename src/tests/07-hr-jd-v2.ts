/**
 * 测试：HR Agent V2 - 多维评估 JD 生成
 */
import { config } from "dotenv";
config();

import { generateJDV2, type JDDraftInput } from "../hr-agent/jd-generator-v2.js";

const input: JDDraftInput = {
  requirement: {
    title: "前端开发工程师",
    rawNeed:
      "我们需要一个前端，主要做客户管理后台和数据大屏。现在后端用 Java，前端打算用 React。最好 3 年以上经验，能独立负责模块。薪资 15-25K。急招，现在前端活都是后端兼着做的。",
    budget: { min: 15, max: 25 },
    urgency: "紧急",
    extras: "公司做餐饮数字化的",
  },
  department: {
    name: "技术部",
    mission: "负责公司餐饮 SaaS 产品的技术研发和迭代",
    team: [
      { role: "后端开发", level: "中级", yearsOfExp: 3, keySkills: ["Java", "Spring Boot", "MySQL"], replaceable: false },
      { role: "后端开发", level: "高级", yearsOfExp: 5, keySkills: ["Java", "架构设计", "微服务"], replaceable: false },
      { role: "后端开发", level: "中级", yearsOfExp: 2, keySkills: ["Java", "MyBatis"], replaceable: true },
      { role: "后端开发", level: "初级", yearsOfExp: 1, keySkills: ["Java"], replaceable: true },
      { role: "后端开发", level: "中级", yearsOfExp: 3, keySkills: ["Java", "Redis", "Kafka"], replaceable: false },
      { role: "测试", level: "中级", yearsOfExp: 2, keySkills: ["功能测试", "接口测试"], replaceable: true },
    ],
    managementStyle: "扁平",
    culture: ["务实", "结果导向", "快速迭代", "技术驱动"],
    collaboration: "小团队，沟通直接，需求和技术直接对接，没有中间层",
    topChallenge: "没有前端，后端兼做前端质量差，进度慢，用户体验不行",
  },
  business: {
    companyName: "星宝科技",
    industry: "餐饮数字化",
    stage: "成长",
    bossExpectation:
      "这个前端来了之后，要能把管理后台和数据大屏做出来，让客户看到我们的产品是专业的。不能只是写页面的人，要能理解业务。",
    strategy: "餐饮 SaaS 产品化，从项目制转向产品制，标准化交付",
    businessGoals: [
      "Q3 完成管理后台 V1.0 上线",
      "Q4 完成数据大屏模块",
      "年底前获得 10 个付费客户",
    ],
    budgetConstraint: "紧张",
    implicitRequirements:
      "最好能带一下团队的前端水平，以后如果做得好可以带人。不要那种只会切图的，要有产品思维。",
  },
};

async function main() {
  console.log("🚀 HR Agent V2 - 多维评估 JD 生成\n");
  console.log("=".repeat(60));

  const result = await generateJDV2(input, {
    maxIterations: 2,
    onProgress: (msg) => console.log(msg),
  });

  console.log("=".repeat(60));
  console.log("📋 组织诊断结论：\n");
  console.log(result.diagnosis);

  console.log("\n" + "=".repeat(60));
  console.log("📄 最终 JD：\n");
  console.log(result.jd);

  console.log("\n" + "=".repeat(60));
  console.log("📊 审查汇总：\n");

  for (let i = 0; i < result.iterations; i++) {
    const start = i * 5;
    const reviews = result.reviews.slice(start, start + 5);
    console.log(`--- 迭代 ${i + 1} ---`);
    reviews.forEach((r) => {
      const icon = r.verdict === "通过" ? "✅" : r.verdict === "需修订" ? "⚠️" : "❌";
      console.log(`  ${icon} ${r.role}: ${r.score}/10 - ${r.issues.length}个问题, ${r.suggestions.length}条建议`);
    });
  }

  console.log(`\n统计: ${result.iterations} 次迭代, JD ${result.jd.length} 字`);
}

main().catch(console.error);
