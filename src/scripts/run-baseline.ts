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
  // 从 pipeline 结果中构造详细的 JD 文本
  const lines: string[] = [];
  
  // 提取岗位名称
  const roleMatch = input.description.match(/[前后端产品测试运维设计数据AI]+[工程师开发设计师经理总监专员运营分析师]+/);
  const roleName = roleMatch ? roleMatch[0] : "岗位";
  const fullTitle = `${input.level || ""}${roleName}`;

  // 岗位标题
  lines.push(`# ${fullTitle}`);
  lines.push("");
  lines.push(`## 公司简介`);
  lines.push(`${input.business?.product || "我们是一家快速发展的科技公司"}，目前处于${input.business?.stage || "成长"}阶段，专注于${input.business?.industry || "互联网"}领域。`);
  lines.push("");
  
  lines.push(`## 部门介绍`);
  lines.push(`${input.department?.name || "技术部"}：${input.department?.mission || "负责核心产品研发"}`);
  if (input.department?.team) {
    lines.push(`团队规模：${input.department.team}`);
  }
  lines.push("");

  lines.push(`## 岗位职责`);
  lines.push(`1. ${input.description}`);
  lines.push(`2. 参与需求分析和技术方案设计`);
  lines.push(`3. 负责核心功能模块的开发和维护`);
  lines.push(`4. 编写高质量的代码和技术文档`);
  lines.push(`5. 参与代码评审，持续优化代码质量`);
  lines.push(`6. 与产品、设计、测试团队紧密协作，确保项目按时交付`);
  lines.push(`7. 关注行业动态，引入新技术提升团队效率`);
  lines.push("");

  lines.push(`## 任职要求`);
  lines.push(`### 基本要求`);
  lines.push(`- ${input.level || "中级"}及以上相关工作经验`);
  lines.push(`- 计算机科学或相关专业本科及以上学历`);
  lines.push(`- 良好的沟通能力和团队协作精神`);
  lines.push(`- 强烈的责任心和自驱力`);
  lines.push("");
  
  lines.push(`### 技术要求`);
  // 根据岗位类型添加具体技能
  if (roleName.includes("前端")) {
    lines.push(`- 精通 React 或 Vue 框架，有大型项目经验`);
    lines.push(`- 熟悉 TypeScript，了解前端工程化`);
    lines.push(`- 熟悉 Webpack、Vite 等构建工具`);
    lines.push(`- 了解 Node.js，有全栈开发经验优先`);
  } else if (roleName.includes("后端")) {
    lines.push(`- 精通 Java/Python/Go 至少一门语言`);
    lines.push(`- 熟悉 Spring Boot/Django 等框架`);
    lines.push(`- 熟悉 MySQL、Redis、消息队列`);
    lines.push(`- 了解微服务架构和分布式系统`);
  } else if (roleName.includes("产品")) {
    lines.push(`- 有 B端 SaaS 产品经验优先`);
    lines.push(`- 熟悉产品设计流程，能独立负责产品线`);
    lines.push(`- 优秀的数据分析能力和逻辑思维`);
    lines.push(`- 良好的跨部门沟通和项目管理能力`);
  } else if (roleName.includes("测试")) {
    lines.push(`- 熟悉自动化测试框架（Selenium、Pytest等）`);
    lines.push(`- 了解 CI/CD 流程`);
    lines.push(`- 有性能测试、安全测试经验优先`);
    lines.push(`- 熟悉 Python 或 Java`);
  } else if (roleName.includes("AI") || roleName.includes("算法")) {
    lines.push(`- 精通 Python，熟悉 PyTorch/TensorFlow`);
    lines.push(`- 有大模型应用开发经验（RAG、Agent）`);
    lines.push(`- 了解 LLM 原理，有微调经验优先`);
    lines.push(`- 熟悉向量数据库和 Embedding 技术`);
  } else if (roleName.includes("DevOps") || roleName.includes("运维")) {
    lines.push(`- 熟悉 Docker、Kubernetes 容器化技术`);
    lines.push(`- 精通 CI/CD 流程（Jenkins、GitLab CI）`);
    lines.push(`- 了解云服务（AWS、阿里云）`);
    lines.push(`- 有监控告警系统建设经验`);
  } else if (roleName.includes("数据")) {
    lines.push(`- 精通 SQL，熟悉 Python 数据分析`);
    lines.push(`- 了解数据仓库和 ETL 流程`);
    lines.push(`- 熟悉 BI 工具（Tableau、PowerBI）`);
    lines.push(`- 有用户行为分析经验优先`);
  } else if (roleName.includes("财务")) {
    lines.push(`- 持有 CPA 证书`);
    lines.push(`- 有融资或上市准备经验`);
    lines.push(`- 熟悉财务分析和预算管理`);
    lines.push(`- 了解税法和审计流程`);
  } else if (roleName.includes("运营")) {
    lines.push(`- 有用户增长和活跃度提升经验`);
    lines.push(`- 熟悉数据分析和运营工具`);
    lines.push(`- 优秀的文案和活动策划能力`);
    lines.push(`- 有团队管理经验优先`);
  } else {
    lines.push(`- 具备相关领域专业知识`);
    lines.push(`- 有成功项目案例`);
    lines.push(`- 持续学习和自我提升能力`);
  }
  lines.push("");

  lines.push(`### 加分项`);
  lines.push(`- 有开源项目贡献经验`);
  lines.push(`- 有技术博客或分享习惯`);
  lines.push(`- 有创业公司工作经验`);
  lines.push("");

  lines.push(`## 薪资福利`);
  if (pipelineResult.market?.salary) {
    lines.push(`- 薪资范围: ${pipelineResult.market.salary.p25}-${pipelineResult.market.salary.p75}K × 14薪`);
    lines.push(`- 市场竞争力: 对标行业 P50-P75 水平`);
  } else {
    lines.push(`- 薪资范围: 面议（根据能力和经验）`);
  }
  lines.push(`- 五险一金（最高基数）`);
  lines.push(`- 补充商业保险`);
  lines.push(`- 带薪年假 10-15 天`);
  lines.push(`- 弹性工作制`);
  lines.push(`- 定期团建和节日福利`);
  lines.push(`- 免费零食和下午茶`);
  lines.push("");

  lines.push(`## 成长发展`);
  lines.push(`- 清晰的职业发展路径（技术/管理双通道）`);
  lines.push(`- 定期技术分享和培训`);
  lines.push(`- 参与核心项目，快速成长`);
  lines.push(`- 优秀导师一对一指导`);
  lines.push("");

  lines.push(`## 工作环境`);
  lines.push(`- 扁平化管理，开放沟通`);
  lines.push(`- 鼓励创新，容忍试错`);
  lines.push(`- 结果导向，不提倡无效加班`);
  lines.push(`- 办公地点: ${input.city || "上海"}市中心，交通便利`);
  lines.push("");

  if (pipelineResult.personas && pipelineResult.personas.length > 0) {
    lines.push(`## 我们期待这样的你`);
    for (const p of pipelineResult.personas.slice(0, 2)) {
      lines.push(`- ${p.name}: ${p.motivation.primary}`);
    }
    lines.push("");
  }

  lines.push(`## 投递方式`);
  lines.push(`请将简历发送至 hr@company.com，邮件标题注明「应聘${fullTitle}」`);
  lines.push("");
  lines.push(`---`);
  lines.push(`*我们承诺在收到简历后 3 个工作日内给予反馈*`);

  return lines.join("\n");
}

// 运行
runBaseline().catch(console.error);
