/**
 * HR Agent V2 测试
 */

import {
  parseRequirement,
  generateJD,
  generateHiringAdvice,
  formatParsedRequirement,
  formatJD,
  formatHiringAdvice,
} from "./hr-agent-v2/core.js";

const TEST_CASES = [
  {
    name: "🍳 厨师场景",
    input: "我现在要招聘员工炒蛋炒饭的厨师，会翻锅会切配知道调味就行，有SOP，个体经营户，餐饮行业，扬州炒饭、炸串、双皮奶、卤味",
  },
  {
    name: "💻 前端开发场景",
    input: "招一个前端开发，做公寓管理系统后台，要会React，A轮创业公司，PropTech行业",
  },
  {
    name: "📊 财务经理场景",
    input: "需要一个财务经理，要有CPA证书，做过融资和上市准备，C轮消费品公司",
  },
];

async function main() {
  console.log("🚀 HR Agent V2 测试\n");
  
  for (const testCase of TEST_CASES) {
    console.log("\n" + "═".repeat(60));
    console.log(testCase.name);
    console.log("═".repeat(60));
    
    try {
      // 1. 解析需求
      console.log("\n⏳ 解析需求...");
      const requirement = await parseRequirement(testCase.input);
      console.log(formatParsedRequirement(requirement));
      
      // 2. 生成 JD
      console.log("\n⏳ 生成 JD...");
      const jd = await generateJD(requirement);
      console.log(formatJD(jd));
      
      // 3. 生成招聘建议
      console.log("\n⏳ 生成招聘建议...");
      const advice = await generateHiringAdvice(requirement);
      console.log(formatHiringAdvice(advice));
      
    } catch (err) {
      console.error(`❌ 测试失败: ${(err as Error).message}`);
    }
  }
  
  console.log("\n" + "═".repeat(60));
  console.log("✅ 测试完成");
}

main().catch(console.error);
