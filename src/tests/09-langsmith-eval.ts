/**
 * 测试：LangSmith 评估框架
 *
 * 演示如何用 LangSmith 做：
 * 1. 批量评估 JD 生成质量
 * 2. A/B 实验对比不同配置
 */
import { config } from "dotenv";
config();

import {
  runEvaluation,
  runExperiment,
  HR_JD_TEST_CASES,
  traced,
} from "../hr-agent/langsmith-integration.js";
import { generateJDV3, type JDDraftInput } from "../hr-agent/jd-generator-v3.js";

// 简化的 Agent 包装器（用于评估）
function createJDAgent() {
  return async (input: Record<string, any>) => {
    const fullInput: JDDraftInput = {
      requirement: {
        title: input.title,
        rawNeed: input.rawNeed,
        budget: input.budget,
        urgency: input.urgency || "常规",
      },
      department: {
        name: "技术部",
        mission: "产品研发",
        team: [
          { role: "后端", level: "中级", yearsOfExp: 3, keySkills: ["Java"], replaceable: false },
        ],
        managementStyle: "扁平",
        culture: ["务实", "结果导向"],
        collaboration: "小团队直接沟通",
        topChallenge: "缺前端",
      },
      business: {
        companyName: "星宝科技",
        industry: "餐饮数字化",
        stage: "成长",
        bossExpectation: "做出专业产品",
        strategy: "产品化",
        businessGoals: ["Q3上线"],
        budgetConstraint: "适中",
      },
    };

    const result = await generateJDV3(fullInput, {
      maxIterations: 1,
      onProgress: () => {},
    });

    return {
      output: result.jdText,
      metrics: { totalTokens: result.cost.totalTokens },
    };
  };
}

async function main() {
  console.log("📊 LangSmith 评估框架演示\n");
  console.log("=".repeat(50));

  // 1. 批量评估
  console.log("\n--- 批量评估 ---\n");
  const agent = createJDAgent();

  const evalResult = await runEvaluation(agent, HR_JD_TEST_CASES, {
    concurrency: 1, // 串行避免 API 限流
    onProgress: (msg) => process.stdout.write(msg),
  });

  console.log("\n评估结果：");
  evalResult.results.forEach((r) => {
    console.log(`  ${r.passed ? "✅" : "❌"} ${r.testName}: ${r.score.toFixed(2)} (${r.latencyMs}ms)`);
  });

  console.log(`\n汇总: ${evalResult.summary.passed}/${evalResult.summary.total} 通过`);
  console.log(`平均分: ${evalResult.summary.avgScore.toFixed(2)}`);
  console.log(`平均耗时: ${(evalResult.summary.avgLatencyMs / 1000).toFixed(1)}s`);

  // 2. 实验对比（如果要跑，取消注释）
  // console.log("\n\n--- A/B 实验 ---\n");
  // const experimentResults = await runExperiment(
  //   (cfg) => createJDAgent(),
  //   [
  //     { name: "DeepSeek-默认", model: "deepseek-chat", temperature: 0.7, maxIterations: 1 },
  //     { name: "DeepSeek-低温", model: "deepseek-chat", temperature: 0.3, maxIterations: 1 },
  //   ],
  //   HR_JD_TEST_CASES.slice(0, 2),
  //   (msg) => process.stdout.write(msg)
  // );

  console.log("\n✅ 评估完成");
  console.log("💡 打开 https://smith.langchain.com 查看详细 Trace");
}

main().catch(console.error);
