/**
 * LangSmith 集成模块
 *
 * 功能：
 * 1. 自动追踪每次 LLM 调用（延迟、token、输入输出）
 * 2. 评估框架：用测试集批量评估 Agent 质量
 * 3. 实验对比：不同配置的效果对比
 */
import { Client } from "langsmith";
import { traceable } from "langsmith/traceable";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { config } from "../config.js";

// ========== 1. 追踪装饰器 ==========

/**
 * 包装任何函数为可追踪的版本
 * 会在 LangSmith 中记录：输入、输出、耗时、token
 */
export function traced<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  name: string
): T {
  return traceable(fn, {
    name,
    run_type: "chain",
    metadata: { project: config.langsmith.project },
  }) as T;
}

// ========== 2. 评估框架 ==========

interface TestCase {
  id: string;
  name: string;
  input: Record<string, any>;
  expected?: Partial<{
    minScore: number;
    mustContain: string[];
    mustNotContain: string[];
    maxTokens: number;
  }>;
}

interface EvalResult {
  testId: string;
  testName: string;
  passed: boolean;
  score: number;
  details: string;
  latencyMs: number;
  tokens: number;
}

/**
 * 批量评估：跑一组测试用例，返回结果
 */
export async function runEvaluation(
  agent: (input: Record<string, any>) => Promise<{ output: string; metrics?: any }>,
  testCases: TestCase[],
  options: { concurrency?: number; onProgress?: (msg: string) => void } = {}
): Promise<{
  results: EvalResult[];
  summary: { total: number; passed: number; failed: number; avgScore: number; avgLatencyMs: number };
}> {
  const { concurrency = 3, onProgress } = options;
  const log = onProgress || (() => {});
  const results: EvalResult[] = [];

  log(`📊 开始评估: ${testCases.length} 个测试用例, 并发=${concurrency}\n`);

  // 分批执行
  for (let i = 0; i < testCases.length; i += concurrency) {
    const batch = testCases.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (tc) => {
        const start = Date.now();
        try {
          const { output, metrics } = await agent(tc.input);
          const latencyMs = Date.now() - start;
          const tokens = metrics?.totalTokens || 0;

          // 检查预期
          let score = 1.0;
          const details: string[] = [];

          if (tc.expected?.mustContain) {
            for (const keyword of tc.expected.mustContain) {
              if (!output.includes(keyword)) {
                score -= 0.2;
                details.push(`缺少关键词: ${keyword}`);
              }
            }
          }

          if (tc.expected?.mustNotContain) {
            for (const keyword of tc.expected.mustNotContain) {
              if (output.includes(keyword)) {
                score -= 0.2;
                details.push(`包含不应有的词: ${keyword}`);
              }
            }
          }

          if (tc.expected?.maxTokens && tokens > tc.expected.maxTokens) {
            score -= 0.1;
            details.push(`Token 超限: ${tokens} > ${tc.expected.maxTokens}`);
          }

          score = Math.max(0, score);
          const passed = score >= (tc.expected?.minScore || 0.6);

          log(`  ${passed ? "✅" : "❌"} ${tc.name}: ${score.toFixed(2)} (${latencyMs}ms)\n`);

          return {
            testId: tc.id,
            testName: tc.name,
            passed,
            score,
            details: details.join("; ") || "通过",
            latencyMs,
            tokens,
          };
        } catch (e: any) {
          log(`  ❌ ${tc.name}: 错误 - ${e.message}\n`);
          return {
            testId: tc.id,
            testName: tc.name,
            passed: false,
            score: 0,
            details: `错误: ${e.message}`,
            latencyMs: Date.now() - start,
            tokens: 0,
          };
        }
      })
    );
    results.push(...batchResults);
  }

  const summary = {
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    avgScore: results.reduce((s, r) => s + r.score, 0) / results.length,
    avgLatencyMs: results.reduce((s, r) => s + r.latencyMs, 0) / results.length,
  };

  log(`\n📊 评估完成: ${summary.passed}/${summary.total} 通过, 平均分 ${summary.avgScore.toFixed(2)}\n`);

  return { results, summary };
}

// ========== 3. HR Agent 测试集 ==========

export const HR_JD_TEST_CASES: TestCase[] = [
  {
    id: "frontend-basic",
    name: "前端开发 - 基础",
    input: {
      title: "前端开发工程师",
      rawNeed: "需要一个前端做管理后台，React，3年经验，15-25K",
      budget: { min: 15, max: 25 },
      urgency: "紧急",
    },
    expected: {
      minScore: 0.6,
      mustContain: ["React", "前端"],
      mustNotContain: ["精通所有技术栈", "全栈"],
      maxTokens: 5000,
    },
  },
  {
    id: "pm-basic",
    name: "产品经理 - 基础",
    input: {
      title: "产品经理",
      rawNeed: "需要一个B端产品经理，做餐饮SaaS，有数据分析能力",
      budget: { min: 18, max: 30 },
      urgency: "常规",
    },
    expected: {
      minScore: 0.6,
      mustContain: ["产品", "分析"],
      mustNotContain: ["全栈", "精通编程"],
    },
  },
  {
    id: "sales-urgent",
    name: "销售 - 紧急",
    input: {
      title: "销售经理",
      rawNeed: "急招销售，做餐饮SaaS，有餐饮行业资源优先",
      budget: { min: 8, max: 15 },
      urgency: "紧急",
    },
    expected: {
      minScore: 0.6,
      mustContain: ["销售"],
      mustNotContain: ["技术开发"],
    },
  },
];

// ========== 4. 实验对比 ==========

interface ExperimentConfig {
  name: string;
  model: string;
  temperature: number;
  maxIterations: number;
}

/**
 * A/B 实验：用同一测试集跑不同配置，对比结果
 */
export async function runExperiment(
  agentFactory: (config: ExperimentConfig) => (input: Record<string, any>) => Promise<{ output: string; metrics?: any }>,
  configs: ExperimentConfig[],
  testCases: TestCase[],
  onProgress?: (msg: string) => void
) {
  const log = onProgress || (() => {});
  const experimentResults: Array<{
    config: ExperimentConfig;
    summary: Awaited<ReturnType<typeof runEvaluation>>["summary"];
  }> = [];

  for (const cfg of configs) {
    log(`\n🧪 实验: ${cfg.name} (${cfg.model}, temp=${cfg.temperature})\n`);
    const agent = agentFactory(cfg);
    const { summary } = await runEvaluation(agent, testCases, { onProgress });
    experimentResults.push({ config: cfg, summary });
  }

  // 对比
  log("\n📊 实验对比：\n");
  log("配置 | 通过率 | 平均分 | 平均耗时\n");
  log("--- | --- | --- | ---\n");
  experimentResults.forEach((r) => {
    const passRate = ((r.summary.passed / r.summary.total) * 100).toFixed(0);
    log(`${r.config.name} | ${passRate}% | ${r.summary.avgScore.toFixed(2)} | ${r.summary.avgLatencyMs.toFixed(0)}ms\n`);
  });

  return experimentResults;
}
