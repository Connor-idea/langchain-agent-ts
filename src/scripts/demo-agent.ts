/**
 * HR Agent 快速演示
 *
 * 使用方法：
 * npx tsx src/scripts/demo-agent.ts
 *
 * 3 个场景自动运行，展示 Agent 能力
 */

import { HRPipeline, formatPipelineResult } from "../hr-agent/pipeline.js";

const DEMO_CASES = [
  {
    name: "🏢 场景1：互联网创业公司招前端",
    input: {
      rawDescription: "招一个前端开发，做我们的公寓管理系统后台，要会React",
      city: "上海",
      level: "中级",
      department: { name: "研发部", mission: "支撑公寓管理SaaS系统", team: "3后端+1前端" },
      business: { stage: "A轮", industry: "PropTech", product: "公寓管理SaaS" },
    },
  },
  {
    name: "🏭 场景2：传统企业数字化转型招技术负责人",
    input: {
      rawDescription: "需要一个能带团队的技术负责人，5年以上经验，要有架构设计能力",
      city: "北京",
      level: "高级",
      department: { name: "技术部", mission: "数字化转型", team: "8人团队" },
      business: { stage: "B轮", industry: "企业服务", product: "智能客服系统" },
    },
  },
  {
    name: "🤖 场景3：AI公司招算法工程师",
    input: {
      rawDescription: "招一个AI工程师，做大模型应用，要有RAG和Agent经验",
      city: "杭州",
      level: "高级",
      department: { name: "AI Lab", mission: "AI技术落地", team: "3算法+2工程" },
      business: { stage: "B轮", industry: "AI", product: "智能助手" },
    },
  },
];

async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("🤖 HR Agent 快速演示");
  console.log("=".repeat(60));
  console.log(`\n📊 共 ${DEMO_CASES.length} 个场景，逐个运行...\n`);

  const pipeline = new HRPipeline();

  for (let i = 0; i < DEMO_CASES.length; i++) {
    const demo = DEMO_CASES[i];
    console.log("\n" + "─".repeat(60));
    console.log(`${demo.name}`);
    console.log("─".repeat(60));

    try {
      const result = await pipeline.run({
        ...demo.input,
        skipInterview: true, // 演示模式跳过访谈
      });

      console.log(formatPipelineResult(result));
    } catch (err) {
      console.error(`❌ 执行失败: ${(err as Error).message}`);
    }

    if (i < DEMO_CASES.length - 1) {
      console.log("\n⏳ 下一个场景...\n");
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ 演示完成！");
  console.log("=".repeat(60));
  console.log("\n💡 想亲自体验？运行：npx tsx src/scripts/preview-agent.ts");
}

main().catch(console.error);
