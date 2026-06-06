/**
 * HR Agent 交互式体验
 *
 * 使用方法：
 * npx tsx src/scripts/preview-agent.ts
 *
 * 体验流程：
 * 1. 输入你的招聘需求（口语化）
 * 2. 自动评估上下文完整度
 * 3. 生成市场情报
 * 4. 生成候选人画像
 * 5. 生成访谈问题
 * 6. 输出完整建议
 */

import * as readline from "readline";
import { HRPipeline, formatPipelineResult } from "../hr-agent/pipeline.js";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("🤖 HR Agent 智能招聘助手");
  console.log("=".repeat(60));
  console.log("");
  console.log("我会帮你分析招聘需求，生成专业的招聘方案。");
  console.log("只需用口语描述你的需求，我来完成剩下的工作。");
  console.log("");

  // 收集基本信息
  const description = await ask("📝 请描述你的招聘需求（口语化即可）：\n> ");
  if (!description) {
    console.log("❌ 需求描述不能为空");
    rl.close();
    return;
  }

  const city = await ask("\n🏙️ 城市（默认上海）：> ") || "上海";
  const level = await ask("📊 级别（初级/中级/高级，默认中级）：> ") || "中级";
  const deptName = await ask("🏢 部门名称（默认研发部）：> ") || "研发部";
  const stage = await ask("🚀 公司阶段（天使轮/A轮/B轮/C轮/成长期，默认A轮）：> ") || "A轮";
  const industry = await ask("🏭 行业（默认互联网）：> ") || "互联网";
  const product = await ask("📦 产品（可选）：> ") || "";

  console.log("\n⏳ 正在分析，请稍候...\n");

  // 运行 Pipeline
  const pipeline = new HRPipeline();

  try {
    const result = await pipeline.run({
      rawDescription: description,
      city,
      level,
      department: {
        name: deptName,
        mission: `负责${product || "核心产品"}的研发`,
        team: "待补充",
      },
      business: {
        stage,
        industry,
        product: product || "核心产品",
      },
    });

    // 输出结果
    console.log(formatPipelineResult(result));

    // 询问是否继续访谈
    if (result.interviewQuestions && result.interviewQuestions.length > 0) {
      const doInterview = await ask("\n🎤 是否开始访谈补全信息？(y/n): ");

      if (doInterview.toLowerCase() === "y") {
        console.log("\n📋 访谈问题（按优先级排序）：\n");

        const answers: Record<string, string> = {};
        for (let i = 0; i < Math.min(5, result.interviewQuestions.length); i++) {
          const q = result.interviewQuestions[i];
          console.log(`\n[问题 ${i + 1}/${Math.min(5, result.interviewQuestions.length)}] ${q.priority}优先级`);
          console.log(`❓ ${q.question}`);
          if (q.hint) console.log(`💡 提示：${q.hint}`);
          if (q.options) {
            console.log("选项：");
            q.options.forEach((opt, idx) => console.log(`  ${idx + 1}. ${opt}`));
          }

          const answer = await ask("\n你的回答（输入数字选择或直接输入）：> ");
          answers[q.id] = answer;
        }

        console.log("\n✅ 访谈完成！");
        console.log("📊 基于你的回答，我将进一步优化招聘方案。");
      }
    }

    // 输出下一步建议
    console.log("\n" + "=".repeat(60));
    console.log("📋 下一步建议：");
    console.log("=".repeat(60));
    console.log("1. 基于以上分析，撰写正式 JD");
    console.log("2. 在 BOSS 直聘/猎聘发布岗位");
    console.log("3. 准备面试问题（基于候选人画像）");
    console.log("4. 设置薪资谈判策略（基于市场数据）");
    console.log("");

  } catch (err) {
    console.error("❌ 执行出错：", (err as Error).message);
  }

  rl.close();
}

main().catch(console.error);
