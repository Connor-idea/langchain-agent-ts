/**
 * 市场数据智能模块测试
 *
 * 测试内容：
 * 1. 薪资数据解析
 * 2. 人才供给分析
 * 3. 技能热度提取
 * 4. 完整情报生成
 * 5. Prompt 注入格式
 * 6. 薪资验证
 * 7. 缓存机制
 */

import {
  parseSalaryFromSearchResults,
  parseSupplyFromSearchResults,
  parseSkillsFromSearchResults,
  generateMarketIntelligence,
  formatMarketForPrompt,
  validateSalaryExpectation,
  getSalarySuggestion,
  buildSalaryQuery,
  buildSupplyQuery,
  buildSkillsQuery,
  buildCompetitorQuery,
  MarketIntelligence,
} from "./market-intelligence.js";

console.log("=".repeat(60));
console.log("📊 市场数据智能模块测试");
console.log("=".repeat(60));

// ========== 测试 1: 搜索查询构建 ==========
console.log("\n🔍 测试 1: 搜索查询构建");
console.log("-".repeat(40));

const salaryQuery = buildSalaryQuery("前端开发", "上海", "中级");
const supplyQuery = buildSupplyQuery("前端开发", "上海");
const skillsQuery = buildSkillsQuery("前端开发");
const competitorQuery = buildCompetitorQuery("前端开发", "上海", "SaaS");

console.log(`薪资查询: ${salaryQuery}`);
console.log(`供给查询: ${supplyQuery}`);
console.log(`技能查询: ${skillsQuery}`);
console.log(`竞品查询: ${competitorQuery}`);

// ========== 测试 2: 薪资数据解析 ==========
console.log("\n💰 测试 2: 薪资数据解析");
console.log("-".repeat(40));

const mockSalaryResults = `
上海前端开发薪资范围 2025

BOSS直聘数据：
- 初级前端：8K-15K
- 中级前端：15K-25K
- 高级前端：25K-40K
- 资深前端：35K-60K

猎聘数据：
- 3-5年经验：18K-30K
- 5年以上：30K-50K

拉勾网：
- React前端：16K-28K
- Vue前端：14K-25K
- 全栈：20K-35K
`;

const salaryData = parseSalaryFromSearchResults(
  mockSalaryResults,
  "前端开发",
  "上海",
  "中级"
);

console.log("解析结果:", salaryData);
console.log(`  中位数: ${salaryData?.p50}K`);
console.log(`  合理区间: ${salaryData?.p25}-${salaryData?.p75}K`);

// ========== 测试 3: 人才供给解析 ==========
console.log("\n👥 测试 3: 人才供给解析");
console.log("-".repeat(40));

const mockSupplyResults = `
上海前端开发人才市场供需分析

2025年前端开发岗位需求增长15%，但供给增长仅8%，
市场整体呈现供不应求状态。

React和Vue框架开发者最受欢迎，
平均招聘周期约21天。

高级前端工程师紧缺，初级相对充裕。
`;

const supplyData = parseSupplyFromSearchResults(
  mockSupplyResults,
  "前端开发",
  "上海"
);

console.log("解析结果:");
console.log(`  供给状态: ${supplyData.supplyLevel}`);
console.log(`  需求趋势: ${supplyData.demandTrend}`);
console.log(`  平均周期: ${supplyData.avgTimeToFill}`);
console.log(`  洞察: ${supplyData.insights.join("; ")}`);

// ========== 测试 4: 技能热度解析 ==========
console.log("\n🛠️ 测试 4: 技能热度解析");
console.log("-".repeat(40));

const mockSkillsResults = `
前端开发岗位技能要求分析 2025

最热门技能：
React（85% JD提及）> Vue（72%）> TypeScript（68%）
Node.js（45%）> Next.js（38%）> Webpack（35%）
Tailwind CSS（28%）> GraphQL（22%）

新兴趋势：
- TypeScript 成为标配
- Next.js 增长最快
- Tailwind CSS 逐步替代传统CSS方案

过时技能：
- jQuery 使用率持续下降
- Grunt 已基本淘汰
`;

const skillsData = parseSkillsFromSearchResults(mockSkillsResults, "前端开发");

console.log("热门技能:");
for (const s of skillsData.topSkills.slice(0, 5)) {
  console.log(`  ${s.skill}: ${Math.round(s.demandRate * 100)}% (${s.trend})`);
}
console.log(`新兴技能: ${skillsData.emergingSkills.join(", ")}`);

// ========== 测试 5: 完整情报生成 ==========
console.log("\n📊 测试 5: 完整情报生成");
console.log("-".repeat(40));

const intelligence = generateMarketIntelligence(
  "前端开发",
  "上海",
  "中级",
  {
    salary: mockSalaryResults,
    supply: mockSupplyResults,
    skills: mockSkillsResults,
  },
  "SaaS"
);

console.log(`摘要: ${intelligence.summary}`);
console.log(`建议数: ${intelligence.recommendations.length}`);
for (const r of intelligence.recommendations) {
  console.log(`  - ${r}`);
}

// ========== 测试 6: Prompt 格式化 ==========
console.log("\n📝 测试 6: Prompt 格式化");
console.log("-".repeat(40));

const promptText = formatMarketForPrompt(intelligence);
console.log(promptText);

// ========== 测试 7: 薪资验证 ==========
console.log("\n✅ 测试 7: 薪资验证");
console.log("-".repeat(40));

const testCases = [
  "15K-25K",
  "8K-12K",
  "40K-60K",
  "面议",
];

for (const tc of testCases) {
  const result = validateSalaryExpectation(tc, intelligence.salary || undefined);
  console.log(`  "${tc}" → ${result.reasonable ? "✅" : "⚠️"} ${result.feedback}`);
}

// ========== 测试 8: 薪资建议 ==========
console.log("\n💡 测试 8: 薪资建议");
console.log("-".repeat(40));

const suggestion = getSalarySuggestion(
  "前端开发",
  "上海",
  "中级",
  intelligence.salary || undefined
);
console.log(suggestion);

// ========== 测试 9: 无数据场景 ==========
console.log("\n🔄 测试 9: 无数据场景（降级处理）");
console.log("-".repeat(40));

const emptyIntel = generateMarketIntelligence(
  "稀缺岗位",
  "小城市",
  "高级"
);

console.log(`摘要: ${emptyIntel.summary}`);
console.log(`建议: ${emptyIntel.recommendations.join("; ")}`);
console.log(`薪资: ${emptyIntel.salary || "无数据"}`);

console.log("\n" + "=".repeat(60));
console.log("✅ 市场数据模块测试完成");
console.log("=".repeat(60));
