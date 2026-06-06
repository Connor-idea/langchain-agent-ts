/**
 * Prompt A/B 测试脚本
 *
 * 测试 4 个 Prompt 版本，用评估器打分对比
 *
 * 使用方法：
 * npx tsx src/scripts/run-prompt-ab-test.ts
 */

import {
  generateJDWithPrompt,
  runPromptABTest,
  formatPromptComparison,
  PROMPT_VERSIONS,
} from "../hr-agent/prompt-versions.js";
import { runEvaluation, formatEvalReport } from "../hr-agent/evaluators.js";
import * as fs from "fs";

// 测试场景
const TEST_CASE = {
  role: "前端开发工程师",
  city: "上海",
  level: "中级",
  description: "招一个前端开发，做我们的公寓管理系统后台",
  context: "A轮 PropTech 公司，研发部，3名后端 + 1名前端",
  marketContext: "上海前端开发薪资中位数 25K，人才紧缺，React/Vue 热门",
};

async function main() {
  console.log("🚀 Prompt A/B 测试");
  console.log("=".repeat(60));
  console.log(`📋 测试场景: ${TEST_CASE.description}`);
  console.log(`🏙️ 城市: ${TEST_CASE.city} | 级别: ${TEST_CASE.level}`);
  console.log("");

  // 运行 A/B 测试
  console.log("⏳ 生成 JD (4个版本并行)...");
  const results = await runPromptABTest(TEST_CASE, ["v1", "v2", "v3", "v4"]);

  console.log("✅ 生成完成\n");

  // 对每个版本运行评估
  const evalResults: {
    version: string;
    description: string;
    jdText: string;
    charCount: number;
    duration: number;
    evalScore: number;
    evalPassed: boolean;
    evalDetails: any;
  }[] = [];

  for (const result of results) {
    const promptConfig = PROMPT_VERSIONS[result.version];

    console.log(`\n${"─".repeat(60)}`);
    console.log(`📊 评估 ${result.version}: ${promptConfig?.description}`);
    console.log(`   字数: ${result.jdText.length} | 耗时: ${result.duration}ms`);

    // 运行评估
    const evalReport = await runEvaluation(
      result.jdText,
      {
        must_contain: ["前端", "职责", "要求"],
        must_not_contain: ["996"],
        structure_required: ["title", "responsibilities", "requirements"],
      },
      {
        market: {
          salary: { p25: 16, p50: 25, p75: 35, p90: 50 },
        },
      }
    );

    console.log(`   评估结果: ${evalReport.overallScore}/100 ${evalReport.passed ? "✅" : "❌"}`);

    evalResults.push({
      version: result.version,
      description: promptConfig?.description || "",
      jdText: result.jdText,
      charCount: result.jdText.length,
      duration: result.duration,
      evalScore: evalReport.overallScore,
      evalPassed: evalReport.passed,
      evalDetails: evalReport.evaluators,
    });
  }

  // ========== 汇总报告 ==========
  console.log("\n\n" + "=".repeat(60));
  console.log("📊 Prompt A/B 测试汇总");
  console.log("=".repeat(60));

  // 排序
  const sorted = [...evalResults].sort((a, b) => b.evalScore - a.evalScore);

  console.log("\n🏆 排名:");
  console.log("");
  console.log("| 排名 | 版本 | 描述 | 得分 | 字数 | 耗时 | 状态 |");
  console.log("| --- | --- | --- | --- | --- | --- | --- |");

  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "  ";
    console.log(
      `| ${medal} ${i + 1} | ${r.version} | ${r.description.substring(0, 15)}... | ${r.evalScore} | ${r.charCount}字 | ${r.duration}ms | ${r.evalPassed ? "✅" : "❌"} |`
    );
  }

  // 各维度对比
  console.log("\n📊 各维度得分:");
  console.log("");
  console.log("| 版本 | structure | keyword | quality | length | salary |");
  console.log("| --- | --- | --- | --- | --- | --- |");

  for (const r of sorted) {
    const scores: Record<string, number> = {};
    for (const e of r.evalDetails) {
      scores[e.name] = Math.round(e.score * 100);
    }
    console.log(
      `| ${r.version} | ${scores["structure-check"] || 0}% | ${scores["keyword-check"] || 0}% | ${scores["quality-llm"] || 0}% | ${scores["length-check"] || 0}% | ${scores["salary-reasonableness"] || 0}% |`
    );
  }

  // 最优版本详情
  const winner = sorted[0];
  console.log(`\n🏆 最优版本: ${winner.version} (${winner.description})`);
  console.log(`   得分: ${winner.evalScore}/100`);
  console.log(`   字数: ${winner.charCount}字`);
  console.log(`\n📝 JD 预览 (前500字):`);
  console.log(winner.jdText.substring(0, 500) + "...");

  // 保存结果
  const reportPath = `results/prompt-ab-test-${new Date().toISOString().split("T")[0]}.json`;
  const report = {
    timestamp: new Date().toISOString(),
    testCase: TEST_CASE,
    results: sorted.map((r) => ({
      version: r.version,
      description: r.description,
      score: r.evalScore,
      passed: r.evalPassed,
      charCount: r.charCount,
      duration: r.duration,
    })),
    winner: winner.version,
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n💾 报告已保存: ${reportPath}`);
}

main().catch(console.error);
