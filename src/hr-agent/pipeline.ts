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
import {
  generateCandidatePersonas,
  formatPersonasForPrompt,
  extractHiringInsights,
  type CandidatePersona,
  type PersonaInput,
} from "./candidate-persona.js";
import {
  evaluateEnhancedContext,
  evaluateJDQuality,
  formatQualityReport,
  type JDQualityScore,
} from "./evaluator-integration.js";
import {
  identifyJobType,
  getMarketBenchmark,
  formatJobInfo,
  type JobInfo,
  type JobCategory,
} from "./job-categories.js";

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
  /** 岗位信息（可选，自动识别） */
  jobInfo?: JobInfo;
}

export interface PipelineResult {
  /** 岗位信息 */
  jobInfo: JobInfo;
  /** 市场基准 */
  marketBenchmark?: any;
  /** 上下文评估 */
  evaluation: ContextEvaluation;
  /** 增强评估（含市场+候选人维度） */
  enhancedEvaluation?: ContextEvaluation;
  /** 市场情报 */
  market?: MarketIntelligence;
  /** 候选人画像 */
  personas?: CandidatePersona[];
  /** 招聘洞察 */
  hiringInsights?: {
    targetPersona: string;
    salaryStrategy: string;
    channelStrategy: string;
    pitchPoints: string[];
    avoidPoints: string[];
  };
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
      model: config.deepseek.models.pro,
      apiKey: config.deepseek.apiKey,
      configuration: { baseURL: config.deepseek.baseUrl },
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

    // 识别岗位类型（通用）
    const jobInfo = input.jobInfo || identifyJobType(input.rawDescription);
    const role = jobInfo.roleName;
    const city = input.city || "上海";
    const level = input.level || jobInfo.level || "中级";

    console.log(`\n🎯 ${formatJobInfo(jobInfo)}`);
    console.log(`📍 ${city} | ${level}`);

    // 获取市场基准
    const marketBenchmark = getMarketBenchmark(jobInfo.category, level, city);
    console.log(`💰 市场薪资参考: ${marketBenchmark.salaryRange.min}-${marketBenchmark.salaryRange.max}K (中位数 ${marketBenchmark.salaryRange.median}K)`);
    console.log(`👥 人才供给: ${marketBenchmark.supplyLevel}`);

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
        knownInfo: {
          title: role,
          department: input.department?.name,
          industry: input.business?.industry,
        },
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

    // ========== Step 4: 候选人画像 ==========
    console.log("\n👤 Step 4: 候选人画像生成...");
    let personas: CandidatePersona[] | undefined;
    let hiringInsights: PipelineResult["hiringInsights"];

    try {
      const personaInput: PersonaInput = {
        role,
        city,
        level,
        industry: input.business?.industry || input.department?.industry,
        department: input.department,
        business: input.business,
        market,
      };

      personas = await generateCandidatePersonas(personaInput, true);
      console.log(`✅ 生成 ${personas.length} 种候选人画像`);
      for (const p of personas) {
        console.log(`   - ${p.name} (${p.type}): ${p.background.currentRole}`);
      }

      // 提取招聘洞察
      hiringInsights = extractHiringInsights(personas);
      recommendations.push(`👤 目标候选人: ${hiringInsights.targetPersona}`);
      recommendations.push(`💰 薪资策略: ${hiringInsights.salaryStrategy}`);
      recommendations.push(`📢 触达渠道: ${hiringInsights.channelStrategy}`);
    } catch (err) {
      console.log("⚠️ 画像生成失败:", (err as Error).message);
    }

    // ========== Step 5: 增强评估 ==========
    console.log("\n📊 Step 5: 增强评估（市场+候选人维度）...");
    let enhancedEvaluation: ContextEvaluation | undefined;

    try {
      const enhanced = evaluateEnhancedContext({
        requirement: { description: input.rawDescription },
        department: input.department,
        business: input.business,
        market,
        personas,
      });

      enhancedEvaluation = enhanced.evaluation;
      const basePct = Math.round(evaluation.completeness * 100);
      const enhancedPct = Math.round(enhancedEvaluation.completeness * 100);
      console.log(`✅ 完整度提升: ${basePct}% → ${enhancedPct}% (+${Math.round(enhanced.improvement * 100)}%)`);
      console.log(`   市场维度: ${enhanced.marketFilled ? "已填充" : "未填充"}`);
      console.log(`   候选人维度: ${enhanced.personaFilled ? "已填充" : "未填充"}`);
    } catch (err) {
      console.log("⚠️ 增强评估失败:", (err as Error).message);
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
      jobInfo,
      marketBenchmark,
      evaluation,
      enhancedEvaluation,
      market,
      personas,
      hiringInsights,
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

  // 岗位信息
  if (result.jobInfo) {
    const categoryNames: Record<string, string> = {
      tech: "技术研发", product: "产品", design: "设计", operation: "运营",
      marketing: "市场/营销", sales: "销售", finance: "财务", hr: "人力资源",
      admin: "行政", service: "服务/客服", food: "餐饮", retail: "零售",
      education: "教育", medical: "医疗", manufacturing: "制造", logistics: "物流",
      legal: "法务", other: "其他",
    };
    lines.push("## 0. 岗位识别");
    lines.push(`- 岗位: ${result.jobInfo.roleName}`);
    lines.push(`- 类别: ${categoryNames[result.jobInfo.category] || result.jobInfo.category}`);
    if (result.jobInfo.industry) lines.push(`- 行业: ${result.jobInfo.industry}`);
    if (result.jobInfo.isManagement) lines.push(`- 管理岗: 是`);
    lines.push("");
  }

  // 市场基准
  if (result.marketBenchmark) {
    lines.push("## 1. 市场基准");
    lines.push(`- 薪资范围: ${result.marketBenchmark.salaryRange.min}-${result.marketBenchmark.salaryRange.max}K (中位数 ${result.marketBenchmark.salaryRange.median}K)`);
    lines.push(`- 人才供给: ${result.marketBenchmark.supplyLevel}`);
    lines.push(`- 常见福利: ${result.marketBenchmark.commonBenefits.join("、")}`);
    lines.push("");
  }

  // 上下文评估
  lines.push("## 2. 上下文评估");
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
    lines.push("## 3. 市场情报");
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

  // 候选人画像
  if (result.personas && result.personas.length > 0) {
    lines.push("## 4. 候选人画像");
    for (const p of result.personas) {
      lines.push(`- **${p.name}** (${p.type}): ${p.background?.currentRole || "未知"}，${p.background?.experience || "未知"}`);
      lines.push(`  核心技能: ${p.skills?.core?.join("、") || "待补充"}`);
      lines.push(`  主要动机: ${p.motivation?.primary || "待补充"}`);
    }
    lines.push("");
  }

  // 招聘洞察
  if (result.hiringInsights) {
    lines.push("## 5. 招聘洞察");
    lines.push(`- 目标画像: ${result.hiringInsights.targetPersona}`);
    lines.push(`- 薪资策略: ${result.hiringInsights.salaryStrategy}`);
    lines.push(`- 触达渠道: ${result.hiringInsights.channelStrategy}`);
    lines.push("");
  }

  // 增强评估
  if (result.enhancedEvaluation) {
    const basePct = Math.round(result.evaluation.completeness * 100);
    const enhancedPct = Math.round(result.enhancedEvaluation.completeness * 100);
    lines.push("## 6. 增强评估");
    lines.push(`- 完整度提升: ${basePct}% → ${enhancedPct}%`);
    lines.push("");
  }

  // 访谈问题
  if (result.interviewQuestions && result.interviewQuestions.length > 0) {
    lines.push("## 7. 访谈问题");
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
