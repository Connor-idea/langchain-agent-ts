/**
 * 评估器集成模块
 *
 * 核心能力：
 * 1. 市场数据自动填充上下文评估器的市场维度
 * 2. 候选人画像自动填充候选人维度
 * 3. LangSmith 评估框架：JD 质量打分、A/B 对比
 * 4. 评估结果可视化
 */

import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { z } from "zod";
import { config } from "../config.js";
import {
  evaluateContext,
  formatEvaluation,
  type ContextEvaluation,
} from "./context-evaluator.js";
import type { MarketIntelligence } from "./market-intelligence.js";
import type { CandidatePersona } from "./candidate-persona.js";

// ========== 评估器增强 ==========

/**
 * 增强版上下文评估（自动填充市场+候选人维度）
 */
export function evaluateEnhancedContext(input: {
  requirement?: Record<string, any>;
  department?: Record<string, any>;
  business?: Record<string, any>;
  market?: MarketIntelligence;
  personas?: CandidatePersona[];
}): {
  evaluation: ContextEvaluation;
  marketFilled: boolean;
  personaFilled: boolean;
  improvement: number; // 完整度提升百分比
} {
  // 1. 基础评估
  const baseEval = evaluateContext({
    requirement: input.requirement,
    department: input.department,
    business: input.business,
  });

  // 2. 如果有市场数据，重新评估（注入市场维度数据）
  let enhancedRequirement = { ...input.requirement };
  let marketFilled = false;

  if (input.market) {
    enhancedRequirement = {
      ...enhancedRequirement,
      // 注入市场数据到评估器能识别的字段
      salaryRange: input.market.salary
        ? `${input.market.salary.p25}-${input.market.salary.p75}K`
        : undefined,
      marketBenchmark: input.market.salary ? true : false,
      talentSupply: input.market.supply?.supplyLevel,
      competitorAnalysis: input.market.competitors
        ? input.market.competitors.length > 0
        : false,
      recruitmentCycle: input.market.supply?.avgTimeToFill,
      hotSkills: input.market.skills?.topSkills.map((s) => s.skill),
      marketData: input.market, // 完整市场数据
    };
    marketFilled = true;
  }

  // 3. 如果有候选人画像，注入候选人维度数据
  let personaFilled = false;

  if (input.personas && input.personas.length > 0) {
    const targetPersona =
      input.personas.find((p) => p.type === "现实型") || input.personas[0];

    enhancedRequirement = {
      ...enhancedRequirement,
      candidatePersona: targetPersona,
      targetCandidateBackground: targetPersona.background.currentRole,
      candidateMotivation: targetPersona.motivation.primary,
      candidateDecisionFactors: targetPersona.decisionFactors,
      candidateChannels: targetPersona.channels.primary,
    };
    personaFilled = true;
  }

  // 4. 重新评估
  const enhancedEval = evaluateContext({
    requirement: enhancedRequirement,
    department: input.department,
    business: input.business,
  });

  // 5. 计算提升
  const improvement = enhancedEval.completeness - baseEval.completeness;

  return {
    evaluation: enhancedEval,
    marketFilled,
    personaFilled,
    improvement,
  };
}

// ========== JD 质量评估 ==========

/** JD 质量评估结果 */
export interface JDQualityScore {
  overall: number; // 0-100
  dimensions: {
    clarity: number; // 清晰度
    completeness: number; // 完整性
    competitiveness: number; // 竞争力
    realism: number; // 现实性
    attractiveness: number; // 吸引力
  };
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
}

const JD_QUALITY_PROMPT = ChatPromptTemplate.fromMessages([
  [
    "system",
    `你是一位资深 HR 专家，负责评估 JD（职位描述）的质量。

评估维度：
1. 清晰度（30分）：职责和要求是否清晰、具体、无歧义
2. 完整性（20分）：是否包含所有必要信息（职责、要求、薪酬、福利、成长）
3. 竞争力（20分）：薪酬和条件在市场上是否有竞争力
4. 现实性（15分）：要求是否合理，不夸大不过度
5. 吸引力（15分）：是否能吸引目标候选人投递

总分 100 分。评分要客观、有区分度。`,
  ],
  [
    "human",
    `请评估以下 JD 的质量：

{jd_text}

{market_context}

请以 JSON 格式输出：
{{
  "overall": 总分(0-100),
  "dimensions": {{
    "clarity": 分数(0-30),
    "completeness": 分数(0-20),
    "competitiveness": 分数(0-20),
    "realism": 分数(0-15),
    "attractiveness": 分数(0-15)
  }},
  "strengths": ["优势1", "优势2"],
  "weaknesses": ["不足1", "不足2"],
  "suggestions": ["建议1", "建议2"]
}}`,
  ],
]);

/**
 * 评估 JD 质量
 */
export async function evaluateJDQuality(
  jdText: string,
  market?: MarketIntelligence
): Promise<JDQualityScore> {
  const model = new ChatOpenAI({
    model: config.deepseek.models.flash,
    apiKey: config.deepseek.apiKey,
    configuration: { baseURL: config.deepseek.baseUrl },
    temperature: 0.3,
    maxTokens: 1000,
  });

  const marketContext = market
    ? `市场参考：薪资中位数 ${market.salary?.p50 || "未知"}K，人才${market.supply?.supplyLevel || "未知"}`
    : "暂无市场数据";

  const chain = JD_QUALITY_PROMPT.pipe(model).pipe(new StringOutputParser());

  const result = await chain.invoke({
    jd_text: jdText,
    market_context: marketContext,
  });

  // 解析 JSON
  const jsonMatch = result.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]) as JDQualityScore;
  }

  // 默认返回
  return {
    overall: 50,
    dimensions: {
      clarity: 15,
      completeness: 10,
      competitiveness: 10,
      realism: 7,
      attractiveness: 8,
    },
    strengths: ["无法解析评估结果"],
    weaknesses: [],
    suggestions: ["请重新评估"],
  };
}

// ========== A/B 对比评估 ==========

/** A/B 对比结果 */
export interface JDComparison {
  winner: "A" | "B" | "tie";
  scoreA: JDQualityScore;
  scoreB: JDQualityScore;
  differences: {
    dimension: string;
    scoreA: number;
    scoreB: number;
    winner: "A" | "B" | "tie";
    reason: string;
  }[];
  recommendation: string;
}

/**
 * 对比两个 JD 的质量
 */
export async function compareJDs(
  jdA: string,
  jdB: string,
  market?: MarketIntelligence
): Promise<JDComparison> {
  const [scoreA, scoreB] = await Promise.all([
    evaluateJDQuality(jdA, market),
    evaluateJDQuality(jdB, market),
  ]);

  const dimensionNames: Record<string, string> = {
    clarity: "清晰度",
    completeness: "完整性",
    competitiveness: "竞争力",
    realism: "现实性",
    attractiveness: "吸引力",
  };

  const differences = Object.entries(scoreA.dimensions).map(
    ([key, valueA]) => {
      const valueB = (scoreB.dimensions as any)[key];
      const winner: "A" | "B" | "tie" =
        valueA > valueB ? "A" : valueA < valueB ? "B" : "tie";
      return {
        dimension: dimensionNames[key] || key,
        scoreA: valueA,
        scoreB: valueB as number,
        winner,
        reason:
          winner === "A"
            ? "A 更优"
            : winner === "B"
              ? "B 更优"
              : "持平",
      };
    }
  );

  const winner =
    scoreA.overall > scoreB.overall
      ? "A"
      : scoreA.overall < scoreB.overall
        ? "B"
        : "tie";

  const recommendation =
    winner === "A"
      ? `JD A 更优 (差 ${scoreA.overall - scoreB.overall} 分)。${scoreA.strengths[0] || ""}`
      : winner === "B"
        ? `JD B 更优 (差 ${scoreB.overall - scoreA.overall} 分)。${scoreB.strengths[0] || ""}`
        : "两者质量相当，可结合具体场景选择。";

  return {
    winner,
    scoreA,
    scoreB,
    differences,
    recommendation,
  };
}

// ========== 评估报告 ==========

/**
 * 格式化 JD 质量评估报告
 */
export function formatQualityReport(
  score: JDQualityScore,
  jdTitle?: string
): string {
  const lines: string[] = [];

  lines.push(`## JD 质量评估${jdTitle ? `: ${jdTitle}` : ""}`);
  lines.push("");

  // 总分
  const grade =
    score.overall >= 85
      ? "A"
      : score.overall >= 70
        ? "B"
        : score.overall >= 55
          ? "C"
          : "D";
  const emoji =
    grade === "A" ? "🟢" : grade === "B" ? "🔵" : grade === "C" ? "🟡" : "🔴";

  lines.push(`${emoji} **总分: ${score.overall}/100 (${grade}级)**`);
  lines.push("");

  // 维度得分
  lines.push("### 维度得分");
  lines.push("");
  const dimNames: Record<string, string> = {
    clarity: "清晰度 (30分)",
    completeness: "完整性 (20分)",
    competitiveness: "竞争力 (20分)",
    realism: "现实性 (15分)",
    attractiveness: "吸引力 (15分)",
  };
  const dimMax: Record<string, number> = {
    clarity: 30,
    completeness: 20,
    competitiveness: 20,
    realism: 15,
    attractiveness: 15,
  };

  for (const [key, value] of Object.entries(score.dimensions)) {
    const max = dimMax[key] || 15;
    const pct = Math.round((value / max) * 100);
    const bar = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
    lines.push(`- ${dimNames[key] || key}: ${bar} ${value}/${max} (${pct}%)`);
  }
  lines.push("");

  // 优势
  if (score.strengths.length > 0) {
    lines.push("### ✅ 优势");
    for (const s of score.strengths) {
      lines.push(`- ${s}`);
    }
    lines.push("");
  }

  // 不足
  if (score.weaknesses.length > 0) {
    lines.push("### ⚠️ 不足");
    for (const w of score.weaknesses) {
      lines.push(`- ${w}`);
    }
    lines.push("");
  }

  // 建议
  if (score.suggestions.length > 0) {
    lines.push("### 💡 改进建议");
    for (const s of score.suggestions) {
      lines.push(`- ${s}`);
    }
  }

  return lines.join("\n");
}

/**
 * 格式化 A/B 对比报告
 */
export function formatComparisonReport(comparison: JDComparison): string {
  const lines: string[] = [];

  lines.push("## JD A/B 对比报告");
  lines.push("");

  const winnerEmoji = comparison.winner === "A" ? "🅰️" : comparison.winner === "B" ? "🅱️" : "🤝";
  lines.push(
    `${winnerEmoji} **结论: ${comparison.winner === "tie" ? "两者相当" : "JD " + comparison.winner + " 胜出"}**`
  );
  lines.push(`- JD A: ${comparison.scoreA.overall}分`);
  lines.push(`- JD B: ${comparison.scoreB.overall}分`);
  lines.push("");

  lines.push("### 维度对比");
  lines.push("");
  lines.push("| 维度 | JD A | JD B | 胜出 |");
  lines.push("| --- | --- | --- | --- |");

  for (const diff of comparison.differences) {
    const winEmoji = diff.winner === "A" ? "🅰️" : diff.winner === "B" ? "🅱️" : "🟰";
    lines.push(
      `| ${diff.dimension} | ${diff.scoreA} | ${diff.scoreB} | ${winEmoji} |`
    );
  }

  lines.push("");
  lines.push(`### 💡 ${comparison.recommendation}`);

  return lines.join("\n");
}

// ========== LangSmith 评估数据集 ==========

/**
 * 生成 LangSmith 评估数据集
 * 用于系统性测试 JD 生成质量
 */
export function generateEvaluationDataset(): {
  inputs: Record<string, any>;
  expected: string;
  metadata: { scenario: string; difficulty: string };
}[] {
  return [
    {
      inputs: {
        description: "招一个前端开发，做公寓管理系统后台",
        city: "上海",
        level: "中级",
      },
      expected: "包含 React/Vue 技术要求、SaaS 经验优先、薪资 15-25K",
      metadata: { scenario: "基础场景", difficulty: "easy" },
    },
    {
      inputs: {
        description: "需要一个能带团队的技术负责人，5年以上经验",
        city: "上海",
        level: "高级",
      },
      expected: "包含团队管理职责、架构设计能力、技术选型经验",
      metadata: { scenario: "管理岗位", difficulty: "medium" },
    },
    {
      inputs: {
        description: "招一个产品经理，要有B端SaaS经验",
        city: "北京",
        level: "中级",
      },
      expected: "包含 B端产品经验、需求分析能力、数据驱动",
      metadata: { scenario: "非技术岗位", difficulty: "medium" },
    },
    {
      inputs: {
        description: "急招一个测试，下周到岗",
        city: "深圳",
        level: "初级",
      },
      expected: "包含紧急标识、自动化测试基础、快速上手要求",
      metadata: { scenario: "紧急招聘", difficulty: "easy" },
    },
    {
      inputs: {
        description: "招一个AI工程师，做大模型应用",
        city: "杭州",
        level: "高级",
      },
      expected: "包含 LLM/RAG 经验、Python 技术栈、AI 应用落地经验",
      metadata: { scenario: "前沿技术", difficulty: "hard" },
    },
  ];
}
