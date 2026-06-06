/**
 * HR Agent Pipeline — 端到端流程编排
 *
 * 流程：
 * 1. 上下文评估 → 识别缺失维度
 * 2. 市场数据采集 → 填充市场维度
 * 3. 需求访谈 → 引导补全信息（带市场参考）
 * 4. JD 生成 → 注入市场情报
 * 5. 五维审查 → 含市场现实性校验
 *
 * 设计原则：
 * - 每一步可独立运行，也可串联
 * - 市场数据自动注入，不阻断流程
 * - 成本追踪贯穿全流程
 */

import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { config } from "../config.js";
import {
  evaluateContext,
  formatEvaluation,
  type ContextEvaluation,
} from "./context-evaluator.js";
import {
  generateMarketIntelligence,
  formatMarketForPrompt,
  buildSalaryQuery,
  buildSupplyQuery,
  buildSkillsQuery,
  buildCompetitorQuery,
  type MarketIntelligence,
} from "./market-intelligence.js";
import {
  generateInterviewQuestions,
  conductInterviewTurn,
  structureInterviewResults,
  type InterviewInput,
  type InterviewQuestion,
  type InterviewSession,
} from "./needs-interview.js";

// ========== 类型 ==========

export interface PipelineInput {
  /** 用人部门的原始需求描述 */
  rawDescription: string;
  /** 城市 */
  city?: string;
  /** 岗位级别 */
  level?: string;
  /** 已知的部门信息 */
  department?: Record<string, any>;
  /** 已知的业务信息 */
  business?: Record<string, any>;
  /** 是否跳过访谈（直接生成） */
  skipInterview?: boolean;
  /** 模拟的搜索结果（测试用） */
  mockSearchResults?: {
    salary?: string;
    supply?: string;
    skills?: string;
    competitors?: string;
  };
}

export interface PipelineResult {
  /** 上下文评估 */
  evaluation: ContextEvaluation;
  /** 市场情报 */
  market?: MarketIntelligence;
  /** 访谈问题（如果需要访谈） */
  interviewQuestions?: InterviewQuestion[];
  /** 结构化需求（如果有访谈结果） */
  structuredNeed?: Record<string, any>;
  /** 最终建议 */
  recommendations: string[];
  /** 流程耗时 */
  duration: number;
  /** 成本估算 */
  estimatedCost: number;
}

// ========== Pipeline ==========

export class HRPipeline {
  private model: ChatOpenAI;
  private totalTokens = 0;
  private startTime = 0;

  constructor() {
    this.model = new ChatOpenAI({
      modelName: config.deepseek.models.pro,
      apiKey: config.deepseek.apiKey,
      baseURL: config.deepseek.baseUrl,
      temperature: 0.7,
      maxTokens: 2000,
    });
  }

  /**
   * 运行完整 Pipeline
   */
  async run(input: PipelineInput): Promise<PipelineResult> {
    this.startTime = Date.now();
    const recommendations: string[] = [];

    // ========== Step 1: 上下文评估 ==========
    console.log("\n📋 Step 1: 上下文评估...");
    const evaluation = evaluateContext({
      requirement: { description: input.rawDescription },
      department: input.department,
      business: input.business,
    });

    console.log(formatEvaluation(evaluation));

    // 识别岗位和城市
    const role = this.extractRole(input.rawDescription);
    const city = input.city || this.extractCity(input.rawDescription) || "上海";
    const level =
      input.level || this.extractLevel(input.rawDescription) || "中级";

    console.log(`\n🎯 识别: ${role} @ ${city} (${level})`);

    // ========== Step 2: 市场数据采集 ==========
    console.log("\n📊 Step 2: 市场数据采集...");
    let market: MarketIntelligence | undefined;

    try {
      market = await this.fetchMarketData(role, city, level, input.mockSearchResults);
      console.log(`✅ 市场情报: ${market.summary}`);
      console.log(`   建议: ${market.recommendations.join("; ")}`);

      // 填充市场维度
      if (market.salary) {
        recommendations.push(
          `💰 薪资参考: ${market.salary.p25}-${market.salary.p75}K (中位数 ${market.salary.p50}K)`
        );
      }
      if (market.supply) {
        recommendations.push(
          `👥 人才供给: ${market.supply.supplyLevel}，平均招聘周期 ${market.supply.avgTimeToFill}`
        );
      }
    } catch (err) {
      console.log("⚠️ 市场数据获取失败，继续流程...");
    }

    // ========== Step 3: 需求访谈 ==========
    let interviewQuestions: InterviewQuestion[] | undefined;
    let structuredNeed: Record<string, any> | undefined;

    if (!input.skipInterview && evaluation.completeness < 0.7) {
      console.log("\n🎤 Step 3: 需求访谈...");

      const interviewInput: InterviewInput = {
        rawDescription: input.rawDescription,
        department: input.department,
        business: input.business,
      };

      // 生成问题（注入市场参考）
      interviewQuestions = await generateInterviewQuestions(
        this.model,
        interviewInput,
        evaluation
      );

      // 注入市场参考到薪资问题
      if (market) {
        interviewQuestions = this.injectMarketIntoQuestions(
          interviewQuestions,
          market
        );
      }

      console.log(`✅ 生成 ${interviewQuestions.length} 个访谈问题`);
      for (const q of interviewQuestions.slice(0, 3)) {
        console.log(`   [${q.priority}] ${q.question}`);
      }

      recommendations.push(
        `🎤 需要访谈 ${interviewQuestions.length} 个问题来补全需求`
      );
    } else if (input.skipInterview) {
      console.log("\n⏭️ Step 3: 跳过访谈（用户指定）");
    } else {
      console.log(
        `\n✅ Step 3: 上下文完整度 ${Math.round(evaluation.completeness * 100)}%，无需访谈`
      );
    }

    // ========== 汇总建议 ==========
    // 评估建议
    for (const r of evaluation.recommendations) {
      recommendations.push(`📋 ${r}`);
    }

    // 市场建议
    if (market) {
      for (const r of market.recommendations) {
        recommendations.push(`📊 ${r}`);
      }
    }

    const duration = Date.now() - this.startTime;
    const estimatedCost = this.totalTokens * 0.000002; // 粗略估算

    return {
      evaluation,
      market,
      interviewQuestions,
      structuredNeed,
      recommendations,
      duration,
      estimatedCost,
    };
  }

  /**
   * 获取市场数据（优先缓存，其次搜索）
   */
  private async fetchMarketData(
    role: string,
    city: string,
    level: string,
    mockResults?: PipelineInput["mockSearchResults"]
  ): Promise<MarketIntelligence> {
    // 如果有模拟结果（测试用），直接使用
    if (mockResults) {
      return generateMarketIntelligence(
        role,
        city,
        level,
        mockResults
      );
    }

    // TODO: 接入真实的 Web Search API
    // 当前返回基础框架，后续集成搜索后自动填充
    return generateMarketIntelligence(role, city, level);
  }

  /**
   * 将市场参考注入访谈问题
   */
  private injectMarketIntoQuestions(
    questions: InterviewQuestion[],
    market: MarketIntelligence
  ): InterviewQuestion[] {
    return questions.map((q) => {
      // 找到薪资相关问题
      if (
        q.dimension === "约束" &&
        (q.question.includes("薪资") || q.question.includes("预算"))
      ) {
        const salaryHint = market.salary
          ? `市场参考：${market.city}${market.role}${market.level}的薪资中位数约 ${market.salary.p50}K/月，常见区间 ${market.salary.p25}-${market.salary.p75}K。`
          : "";

        return {
          ...q,
          question: `${q.question}\n\n💡 ${salaryHint}`,
          options: market.salary
            ? [
                `对齐市场中位数 (${market.salary.p50}K左右)`,
                `低于市场 (成本优先)`,
                `高于市场 (吸引顶尖人才)`,
                "不确定，需要讨论",
              ]
            : q.options,
        };
      }

      // 找到人才供给相关问题
      if (
        q.dimension === "市场" ||
        q.question.includes("招聘难度") ||
        q.question.includes("市场")
      ) {
        const supplyHint = market.supply
          ? `市场参考：该岗位人才${market.supply.supplyLevel}，需求趋势${market.supply.demandTrend}，平均招聘周期约${market.supply.avgTimeToFill}。`
          : "";

        return {
          ...q,
          question: `${q.question}\n\n💡 ${supplyHint}`,
        };
      }

      return q;
    });
  }

  /**
   * 从需求描述中提取岗位名称
   */
  private extractRole(description: string): string {
    const rolePatterns = [
      /招[个一名]?\s*([^，,。.、\s]+)/,
      /需要[个一名]?\s*([^，,。.、\s]+)/,
      /缺[个一名]?\s*([^，,。.、\s]+)/,
      /([^，,。.、\s]*(?:工程师|开发|设计师|经理|主管|总监|专员|运营|产品|前端|后端|全栈|测试|运维|数据分析))/,
    ];

    for (const pattern of rolePatterns) {
      const match = description.match(pattern);
      if (match) {
        // 去掉开头的量词
        return match[1].replace(/^[个一名]+/, "").trim();
      }
    }

    return "技术岗位";
  }

  /**
   * 从需求描述中提取城市
   */
  private extractCity(description: string): string | undefined {
    const cities = [
      "上海",
      "北京",
      "深圳",
      "广州",
      "杭州",
      "成都",
      "南京",
      "武汉",
      "西安",
      "苏州",
    ];
    for (const city of cities) {
      if (description.includes(city)) return city;
    }
    return undefined;
  }

  /**
   * 从需求描述中提取级别
   */
  private extractLevel(description: string): string | undefined {
    if (
      description.includes("高级") ||
      description.includes("资深") ||
      description.includes("专家")
    )
      return "高级";
    if (description.includes("初级") || description.includes("应届"))
      return "初级";
    if (description.includes("中级") || description.includes("3-5年"))
      return "中级";
    return undefined;
  }
}

// ========== 格式化输出 ==========

export function formatPipelineResult(result: PipelineResult): string {
  const lines: string[] = [];

  lines.push("# HR Agent Pipeline 执行结果\n");

  // 上下文评估
  lines.push("## 1. 上下文评估");
  lines.push(
    `- 完整度: ${Math.round(result.evaluation.completeness * 100)}% (${result.evaluation.grade})`
  );
  lines.push(
    `- 得分: ${result.evaluation.totalScore}/${result.evaluation.maxScore}`
  );
  if (result.evaluation.criticalGaps.length > 0) {
    lines.push(`- 关键缺口: ${result.evaluation.criticalGaps.join("; ")}`);
  }
  lines.push("");

  // 市场情报
  if (result.market) {
    lines.push("## 2. 市场情报");
    lines.push(`- ${result.market.summary}`);
    if (result.market.salary) {
      lines.push(
        `- 薪资: P25=${result.market.salary.p25}K | P50=${result.market.salary.p50}K | P75=${result.market.salary.p75}K`
      );
    }
    if (result.market.supply) {
      lines.push(
        `- 供给: ${result.market.supply.supplyLevel} | 趋势: ${result.market.supply.demandTrend}`
      );
    }
    lines.push("");
  }

  // 访谈问题
  if (result.interviewQuestions && result.interviewQuestions.length > 0) {
    lines.push("## 3. 访谈问题");
    for (const q of result.interviewQuestions.slice(0, 5)) {
      lines.push(`- [${q.priority}] ${q.question.substring(0, 60)}...`);
    }
    if (result.interviewQuestions.length > 5) {
      lines.push(
        `- ... 还有 ${result.interviewQuestions.length - 5} 个问题`
      );
    }
    lines.push("");
  }

  // 建议
  lines.push("## 建议");
  for (const r of result.recommendations) {
    lines.push(`- ${r}`);
  }
  lines.push("");

  // 元数据
  lines.push("---");
  lines.push(
    `⏱️ 耗时: ${(result.duration / 1000).toFixed(1)}s | 💰 估算成本: ¥${result.estimatedCost.toFixed(4)}`
  );

  return lines.join("\n");
}
