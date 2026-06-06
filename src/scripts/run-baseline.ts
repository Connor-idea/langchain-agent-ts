/**
 * 基线测试脚本
 *
 * 运行所有评估用例，记录当前 Pipeline 的质量分数
 * 这是优化的起点
 *
 * 使用方法：
 * npx tsx src/scripts/run-baseline.ts
 */

import * as fs from "fs";
import * as path from "path";
import { HRPipeline, formatPipelineResult } from "../hr-agent/pipeline.js";
import {
  runEvaluation,
  formatEvalReport,
  type EvalReport,
} from "../hr-agent/evaluators.js";

// ========== 配置 ==========

const DATASET_PATH = path.join(
  process.cwd(),
  "datasets",
  "hr-agent-eval-v1.json"
);

const OUTPUT_DIR = path.join(process.cwd(), "results");

// ========== 主函数 ==========

async function runBaseline() {
  console.log("🚀 HR Agent 基线测试");
  console.log("=".repeat(60));

  // 加载数据集
  if (!fs.existsSync(DATASET_PATH)) {
    console.error(`❌ 数据集不存在: ${DATASET_PATH}`);
    process.exit(1);
  }

  const dataset = JSON.parse(fs.readFileSync(DATASET_PATH, "utf-8"));
  console.log(`📂 数据集: ${dataset.dataset_name}`);
  console.log(`📊 用例数: ${dataset.examples.length}`);

  // 确保输出目录存在
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 运行测试
  const pipeline = new HRPipeline();
  const results: {
    scenario: string;
    difficulty: string;
    pipelineResult: any;
    evalReport: EvalReport;
  }[] = [];

  let passCount = 0;
  let totalScore = 0;

  for (let i = 0; i < dataset.examples.length; i++) {
    const example = dataset.examples[i];
    console.log(`\n${"─".repeat(60)}`);
    console.log(
      `📋 [${i + 1}/${dataset.examples.length}] ${example.metadata?.scenario || example.id}`
    );
    console.log(`   难度: ${example.metadata?.difficulty}`);
    console.log(`   描述: ${example.input.description}`);

    try {
      // 运行 Pipeline
      const pipelineResult = await pipeline.run({
        rawDescription: example.input.description,
        city: example.input.city,
        level: example.input.level,
        department: example.input.department,
        business: example.input.business,
        skipInterview: true, // 跳过访谈，直接评估生成能力
      });

      // 构造 JD 文本（从 pipeline 结果中提取）
      const jdText = constructJDText(pipelineResult, example.input);

      // 运行评估
      const evalReport = await runEvaluation(jdText, example.expected_output, {
        market: pipelineResult.market,
      });

      // 记录结果
      results.push({
        scenario: example.metadata?.scenario || example.id,
        difficulty: example.metadata?.difficulty || "unknown",
        pipelineResult: {
          completeness: Math.round(pipelineResult.evaluation.completeness * 100),
          enhancedCompleteness: pipelineResult.enhancedEvaluation
            ? Math.round(pipelineResult.enhancedEvaluation.completeness * 100)
            : null,
          marketData: !!pipelineResult.market,
          personas: pipelineResult.personas?.length || 0,
        },
        evalReport,
      });

      // 输出结果
      const passed = evalReport.passed;
      const score = evalReport.overallScore;

      if (passed) passCount++;
      totalScore += score;

      console.log(
        `\n  ${passed ? "✅" : "❌"} 评估结果: ${score}/100 ${passed ? "通过" : "未通过"}`
      );
      for (const e of evalReport.evaluators) {
        const icon = e.passed ? "✓" : "✗";
        console.log(
          `    ${icon} ${e.name}: ${Math.round(e.score * 100)}%`
        );
      }
    } catch (err) {
      console.error(`  ❌ 执行失败: ${(err as Error).message}`);
      results.push({
        scenario: example.metadata?.scenario || example.id,
        difficulty: example.metadata?.difficulty || "unknown",
        pipelineResult: null,
        evalReport: {
          overallScore: 0,
          passed: false,
          evaluators: [],
          suggestions: [`执行失败: ${(err as Error).message}`],
          metadata: {
            evalId: "error",
            timestamp: new Date().toISOString(),
            duration: 0,
          },
        },
      });
    }
  }

  // ========== 汇总报告 ==========
  console.log("\n\n" + "=".repeat(60));
  console.log("📊 基线测试汇总报告");
  console.log("=".repeat(60));

  const avgScore = Math.round(totalScore / dataset.examples.length);
  const passRate = Math.round(
    (passCount / dataset.examples.length) * 100
  );

  console.log(`\n📈 整体指标:`);
  console.log(`  - 平均分: ${avgScore}/100`);
  console.log(`  - 通过率: ${passRate}% (${passCount}/${dataset.examples.length})`);

  // 按难度统计
  const byDifficulty: Record<string, { count: number; totalScore: number }> =
    {};
  for (const r of results) {
    if (!byDifficulty[r.difficulty]) {
      byDifficulty[r.difficulty] = { count: 0, totalScore: 0 };
    }
    byDifficulty[r.difficulty].count++;
    byDifficulty[r.difficulty].totalScore += r.evalReport.overallScore;
  }

  console.log(`\n📊 按难度统计:`);
  for (const [diff, stats] of Object.entries(byDifficulty)) {
    console.log(
      `  - ${diff}: ${Math.round(stats.totalScore / stats.count)}分 (共${stats.count}个)`
    );
  }

  // 各评估器统计
  const evaluatorStats: Record<
    string,
    { pass: number; fail: number; totalScore: number }
  > = {};
  for (const r of results) {
    for (const e of r.evalReport.evaluators) {
      if (!evaluatorStats[e.name]) {
        evaluatorStats[e.name] = { pass: 0, fail: 0, totalScore: 0 };
      }
      if (e.passed) evaluatorStats[e.name].pass++;
      else evaluatorStats[e.name].fail++;
      evaluatorStats[e.name].totalScore += e.score;
    }
  }

  console.log(`\n📊 各评估器统计:`);
  for (const [name, stats] of Object.entries(evaluatorStats)) {
    const total = stats.pass + stats.fail;
    const passRate = Math.round((stats.pass / total) * 100);
    const avgScore = Math.round((stats.totalScore / total) * 100);
    console.log(`  - ${name}: ${passRate}% 通过, 平均 ${avgScore}%`);
  }

  // 保存结果
  const reportPath = path.join(
    OUTPUT_DIR,
    `baseline-${new Date().toISOString().split("T")[0]}.json`
  );

  const report = {
    timestamp: new Date().toISOString(),
    dataset: dataset.dataset_name,
    summary: {
      avgScore,
      passRate,
      passCount,
      total: dataset.examples.length,
    },
    results: results.map((r) => ({
      scenario: r.scenario,
      difficulty: r.difficulty,
      score: r.evalReport.overallScore,
      passed: r.evalReport.passed,
      suggestions: r.evalReport.suggestions,
      pipeline: r.pipelineResult,
    })),
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n💾 报告已保存: ${reportPath}`);

  // 优化建议
  console.log("\n💡 优化建议:");
  console.log("  1. 关注通过率最低的评估器，针对性优化");
  console.log("  2. 对比不同难度的得分，找出薄弱场景");
  console.log("  3. 使用 LangSmith 查看详细追踪: https://smith.langchain.com");
  console.log("  4. 定期运行此脚本，对比优化效果");
}

// ========== 辅助函数 ==========

function constructJDText(
  pipelineResult: any,
  input: any
): string {
  // 从 pipeline 结果中构造 JD 文本
  // 当前 pipeline 没有直接生成 JD，所以我们构造一个基础版本
  const lines: string[] = [];

  lines.push(`# ${input.level || ""}${input.description.match(/[前后端产品测试运维设计]+[工程师开发设计师经理总监专员运营]+/)?.[0] || "岗位"}`);
  lines.push("");
  lines.push(`## 岗位职责`);
  lines.push(`- ${input.description}`);
  lines.push("- 参与团队协作，完成项目目标");
  lines.push("");

  lines.push(`## 任职要求`);
  lines.push(`- ${input.level || "中级"}及以上经验`);
  lines.push("- 具备相关技术栈能力");
  lines.push("- 良好的沟通和团队协作能力");
  lines.push("");

  if (pipelineResult.market?.salary) {
    lines.push(`## 薪资待遇`);
    lines.push(
      `- 薪资范围: ${pipelineResult.market.salary.p25}-${pipelineResult.market.salary.p75}K`
    );
    lines.push("- 五险一金");
    lines.push("");
  }

  if (pipelineResult.personas && pipelineResult.personas.length > 0) {
    lines.push(`## 目标候选人`);
    for (const p of pipelineResult.personas) {
      lines.push(`- ${p.name}: ${p.background.currentRole}`);
    }
  }

  return lines.join("\n");
}

// 运行
runBaseline().catch(console.error);
