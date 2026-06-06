/**
 * 测试：HR Agent - JD 生成器
 *
 * 用一个真实的招聘需求测试完整的 JD 生成流程
 */
import { config } from "dotenv";
config();

import { generateJD, type JobRequirement } from "../hr-agent/jd-generator.js";

// 模拟一个真实的用人需求（来自部门经理的口头描述）
const requirement: JobRequirement = {
  title: "前端开发工程师",
  department: "技术部",
  reportsTo: "技术总监",
  rawNeed:
    "我们需要一个前端，主要做我们客户的管理后台和数据大屏。现在后端用的 Java，前端打算用 React。最好有 3 年以上经验，能独立负责模块。薪资预算大概 15-25K。急招，因为现在前端活都是后端兼着做的，质量不行。",
  budget: { min: 15, max: 25 },
  urgency: "紧急",
  extras:
    "团队目前 5 个后端，0 个前端。管理后台是 B 端 SaaS，数据大屏要好看。公司做餐饮数字化的。",
};

async function main() {
  console.log("🚀 HR Agent - JD 生成器测试\n");
  console.log("=".repeat(60));
  console.log(`📋 岗位: ${requirement.title}`);
  console.log(`🏢 部门: ${requirement.department}`);
  console.log(`💰 预算: ${requirement.budget?.min}-${requirement.budget?.max}K`);
  console.log(`⏰ 紧急程度: ${requirement.urgency}`);
  console.log(`💬 原始需求: ${requirement.rawNeed.substring(0, 80)}...`);
  console.log("=".repeat(60));
  console.log();

  const result = await generateJD(requirement, {
    maxIterations: 2,
    onProgress: (msg) => console.log(msg),
  });

  console.log("=".repeat(60));
  console.log("📄 最终 JD：\n");
  console.log(result.jd);

  console.log("\n" + "=".repeat(60));
  console.log("📊 审查汇总：\n");

  // 按迭代分组显示
  const reviewGroups: Record<string, typeof result.reviews> = {};
  result.reviews.forEach((r, i) => {
    const iter = Math.floor(i / 3) + 1;
    if (!reviewGroups[`迭代${iter}`]) reviewGroups[`迭代${iter}`] = [];
    reviewGroups[`迭代${iter}`].push(r);
  });

  for (const [iter, reviews] of Object.entries(reviewGroups)) {
    console.log(`--- ${iter} ---`);
    reviews.forEach((r) => {
      const icon =
        r.verdict === "通过" ? "✅" : r.verdict === "需修订" ? "⚠️" : "❌";
      console.log(
        `  ${icon} ${r.role}: ${r.score}/10 (${r.verdict}) - ${r.issues.length} 个问题, ${r.suggestions.length} 条建议`
      );
    });
  }

  console.log(`\n📊 统计:`);
  console.log(`   迭代次数: ${result.iterations}`);
  console.log(`   最终 JD 长度: ${result.jd.length} 字`);
}

main().catch(console.error);
