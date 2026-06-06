/**
 * HR Agent 评估器框架
 *
 * 评估维度：
 * 1. 结构化检查 - JD 必须包含的字段
 * 2. 关键词检查 - 必须包含/排除的词汇
 * 3. 质量评估 - LLM 评估 JD 质量
 * 4. 市场对齐 - 薪资和要求是否符合市场
 */

import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { config } from "../config.js";

// ========== 类型定义 ==========

export interface EvalResult {
  score: number; // 0-1
  passed: boolean;
  details: Record<string, any>;
  suggestions?: string[];
}

export interface JDEvaluator {
  name: string;
  description: string;
  weight: number; // 权重 0-1
  evaluate: (output: string, expected?: any, context?: any) => Promise<EvalResult>;
}

export interface EvalReport {
  overallScore: number; // 0-100
  passed: boolean;
  evaluators: {
    name: string;
    score: number;
    passed: boolean;
    details: Record<string, any>;
  }[];
  suggestions: string[];
  metadata: {
    evalId: string;
    timestamp: string;
    duration: number;
  };
}

// ========== 评估器 1: 结构化检查 ==========

export const structureEvaluator: JDEvaluator = {
  name: "structure-check",
  description: "检查 JD 是否包含必要的结构化字段",
  weight: 0.3,

  evaluate: async (output: string, expected?: any) => {
    const requiredFields = expected?.structure_required || [
      "title",
      "responsibilities",
      "requirements",
      "compensation",
    ];

    const fieldPatterns: Record<string, RegExp[]> = {
      title: [/岗位[名称职衔]*[：:]\s*.+/i, /^#\s+.+/m],
      responsibilities: [
        /[岗位职责工作内容主要职责][：:]/i,
        /负责[：:]?/i,
        /参与[：:]?/i,
      ],
      requirements: [
        /[任职要求岗位要求职位要求招聘要求][：:]/i,
        /具备[：:]?/i,
        /熟悉[：:]?/i,
        /精通[：:]?/i,
      ],
      compensation: [
        /[薪资薪酬待遇报酬][：:]/i,
        /\d+[kK]\s*[-~]\s*\d+[kK]/i,
        /福利[：:]?/i,
      ],
      teamContext: [/[团队部门][：:]/i, /汇报[：:]?/i],
    };

    const found: string[] = [];
    const missing: string[] = [];

    for (const field of requiredFields) {
      const patterns = fieldPatterns[field] || [new RegExp(field, "i")];
      const isFound = patterns.some((p) => p.test(output));

      if (isFound) {
        found.push(field);
      } else {
        missing.push(field);
      }
    }

    const score = found.length / requiredFields.length;

    return {
      score,
      passed: score >= 0.7,
      details: {
        found,
        missing,
        total: requiredFields.length,
      },
      suggestions:
        missing.length > 0
          ? [`JD 缺少以下必要字段: ${missing.join(", ")}`]
          : [],
    };
  },
};

// ========== 评估器 2: 关键词检查 ==========

export const keywordEvaluator: JDEvaluator = {
  name: "keyword-check",
  description: "检查 JD 是否包含必须的关键词，排除禁止的词汇",
  weight: 0.2,

  evaluate: async (output: string, expected?: any) => {
    const mustContain: string[] = expected?.must_contain || [];
    const mustNotContain: string[] = expected?.must_not_contain || [];

    const outputLower = output.toLowerCase();

    // 检查必须包含的词（支持同义词和变体）
    const synonymMap: Record<string, string[]> = {
      "前端": ["前端", "frontend", "front-end", "FE"],
      "React": ["react", "reactjs", "react.js"],
      "Vue": ["vue", "vuejs", "vue.js"],
      "职责": ["职责", "工作内容", "岗位职责", "工作职责"],
      "要求": ["要求", "任职要求", "岗位要求", "招聘要求"],
      "薪资": ["薪资", "薪酬", "待遇", "报酬", "salary"],
      "AI": ["ai", "人工智能", "机器学习", "ml"],
      "LLM": ["llm", "大模型", "大语言模型"],
      "RAG": ["rag", "检索增强"],
      "Agent": ["agent", "智能体"],
    };

    const contained: string[] = [];
    const missingRequired: string[] = [];

    for (const keyword of mustContain) {
      const keyLower = keyword.toLowerCase();
      const synonyms = synonymMap[keyword] || [keyLower];
      const isFound = synonyms.some((s) => outputLower.includes(s));

      if (isFound) {
        contained.push(keyword);
      } else {
        missingRequired.push(keyword);
      }
    }

    // 检查必须排除的词
    const violations = mustNotContain.filter((k) =>
      outputLower.includes(k.toLowerCase())
    );

    // 计算分数（更宽松的评分）
    const containScore =
      mustContain.length > 0 ? contained.length / mustContain.length : 1;
    const violationPenalty = violations.length * 0.15;
    const score = Math.max(0, containScore - violationPenalty);

    return {
      score,
      passed: score >= 0.6 && violations.length === 0,  // 降低通过阈值
      details: {
        contained,
        missingRequired,
        violations,
        containRate: `${contained.length}/${mustContain.length}`,
      },
      suggestions: [
        ...(missingRequired.length > 0
          ? [`JD 缺少关键词: ${missingRequired.join(", ")}`]
          : []),
        ...(violations.length > 0
          ? [`JD 包含不当词汇: ${violations.join(", ")}`]
          : []),
      ],
    };
  },
};

// ========== 评估器 3: 质量评估 (LLM) ==========

const QUALITY_PROMPT = ChatPromptTemplate.fromMessages([
  [
    "system",
    `你是一位资深 HR 专家，负责评估 JD（职位描述）的质量。

评估维度：
1. 清晰度（30分）：职责和要求是否清晰、具体、无歧义
2. 完整性（20分）：是否包含所有必要信息
3. 竞争力（20分）：薪酬和条件是否有竞争力
4. 现实性（15分）：要求是否合理，不夸大
5. 吸引力（15分）：是否能吸引候选人

返回 JSON 格式。`,
  ],
  [
    "human",
    `请评估以下 JD 的质量（0-100分）：

{jd_text}

{context}

返回 JSON：
{{
  "score": 0-100,
  "dimensions": {{
    "clarity": 0-30,
    "completeness": 0-20,
    "competitiveness": 0-20,
    "realism": 0-15,
    "attractiveness": 0-15
  }},
  "strengths": ["优势1", "优势2"],
  "weaknesses": ["不足1", "不足2"],
  "suggestions": ["建议1", "建议2"]
}}`,
  ],
]);

export const qualityEvaluator: JDEvaluator = {
  name: "quality-llm",
  description: "使用 LLM 评估 JD 的整体质量",
  weight: 0.5,

  evaluate: async (output: string, expected?: any, context?: any) => {
    try {
      const model = new ChatOpenAI({
        model: config.deepseek.models.flash,
        apiKey: config.deepseek.apiKey,
        configuration: { baseURL: config.deepseek.baseUrl },
        temperature: 0.3,
        maxTokens: 1000,
      });

      const contextText = context?.market
        ? `市场参考：薪资中位数 ${context.market.salary?.p50 || "未知"}K`
        : "";

      const chain = QUALITY_PROMPT.pipe(model).pipe(new StringOutputParser());

      const result = await chain.invoke({
        jd_text: output,
        context: contextText,
      });

      // 解析 JSON（支持多种格式）
      let parsed: any = null;
      
      // 尝试标准 JSON
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch (e) {
          const cleaned = jsonMatch[0]
            .replace(/,\s*}/g, "}")
            .replace(/,\s*]/g, "]")
            .replace(/'/g, '"');
          try {
            parsed = JSON.parse(cleaned);
          } catch (e2) {}
        }
      }

      // 尝试提取分数
      if (!parsed) {
        const scoreMatch = result.match(/["']?score["']?\s*[:=]\s*(\d+)/i);
        if (scoreMatch) {
          parsed = { score: parseInt(scoreMatch[1]) };
        }
      }

      if (parsed && typeof parsed.score === "number") {
        const normalizedScore = Math.min(1, Math.max(0, parsed.score / 100));
        return {
          score: normalizedScore,
          passed: normalizedScore >= 0.7,
          details: {
            rawScore: parsed.score,
            dimensions: parsed.dimensions,
            strengths: parsed.strengths || [],
            weaknesses: parsed.weaknesses || [],
          },
          suggestions: parsed.suggestions || [],
        };
      }

      // 无法解析
      return {
        score: 0.6,
        passed: false,
        details: { error: "无法解析 LLM 输出" },
        suggestions: ["请重新评估"],
      };
    } catch (err) {
      return {
        score: 0.5,
        passed: false,
        details: { error: (err as Error).message },
        suggestions: ["LLM 评估失败，请检查 API 配置"],
      };
    }
  },
};

// ========== 评估器 4: 长度检查 ==========

export const lengthEvaluator: JDEvaluator = {
  name: "length-check",
  description: "检查 JD 长度是否在合理范围内",
  weight: 0.1,

  evaluate: async (output: string) => {
    const charCount = output.length;
    const lineCount = output.split("\n").length;

    // 理想长度：800-3000字（中文JD通常较长）
    const isTooShort = charCount < 500;
    const isTooLong = charCount > 5000;
    const isIdeal = charCount >= 800 && charCount <= 3000;

    let score = 1.0;
    if (isTooShort) {
      // 线性增长：500字以下按比例
      score = Math.max(0.3, charCount / 800);
    } else if (isTooLong) {
      // 超长扣分较少
      score = Math.max(0.7, 1 - (charCount - 3000) / 5000);
    }

    return {
      score,
      passed: !isTooShort,  // 只有太短才不通过
      details: {
        charCount,
        lineCount,
        category: isIdeal ? "理想" : isTooShort ? "过短" : isTooLong ? "偏长" : "适中",
      },
      suggestions: isTooShort
        ? [`JD 仅 ${charCount} 字，建议补充更多职责和要求细节（目标 800+ 字）`]
        : isTooLong
          ? ["JD 篇幅较长，可适当精简福利和环境描述"]
          : [],
    };
  },
};

// ========== 评估器 5: 薪资合理性 ==========

export const salaryEvaluator: JDEvaluator = {
  name: "salary-reasonableness",
  description: "检查薪资要求是否合理",
  weight: 0.2,

  evaluate: async (output: string, expected?: any, context?: any) => {
    // 提取薪资数字
    const salaryPatterns = [
      /(\d+)[kK]\s*[-~到至]\s*(\d+)[kK]/g,
      /(\d{1,2})\s*[-~到至]\s*(\d{1,2})\s*[万千]/g,
    ];

    const ranges: [number, number][] = [];
    for (const pattern of salaryPatterns) {
      let match;
      while ((match = pattern.exec(output)) !== null) {
        const low = parseInt(match[1]);
        const high = parseInt(match[2]);
        if (low > 0 && high > low && low < 200) {
          ranges.push([low, high]);
        }
      }
    }

    if (ranges.length === 0) {
      return {
        score: 0.5,
        passed: true,
        details: { hasSalary: false, message: "JD 中未明确薪资范围" },
        suggestions: ["建议明确薪资范围以提高吸引力"],
      };
    }

    // 如果有市场数据，检查是否对齐
    const marketSalary = context?.market?.salary;
    if (marketSalary) {
      const avgMid = ranges.reduce((s, [l, h]) => s + (l + h) / 2, 0) / ranges.length;
      const marketMid = marketSalary.p50;

      const deviation = Math.abs(avgMid - marketMid) / marketMid;
      const score = Math.max(0, 1 - deviation);

      return {
        score,
        passed: deviation < 0.3,
        details: {
          hasSalary: true,
          jdRange: ranges[0],
          marketRange: `${marketSalary.p25}-${marketSalary.p75}K`,
          deviation: `${Math.round(deviation * 100)}%`,
        },
        suggestions:
          deviation > 0.3
            ? ["薪资与市场水平偏差较大，建议调整"]
            : [],
      };
    }

    return {
      score: 0.7,
      passed: true,
      details: { hasSalary: true, range: ranges[0] },
    };
  },
};

// ========== 评估管线 ==========

const ALL_EVALUATORS: JDEvaluator[] = [
  structureEvaluator,
  keywordEvaluator,
  qualityEvaluator,
  lengthEvaluator,
  salaryEvaluator,
];

/**
 * 运行完整评估
 */
export async function runEvaluation(
  jdOutput: string,
  expected?: any,
  context?: any,
  evaluators: JDEvaluator[] = ALL_EVALUATORS
): Promise<EvalReport> {
  const startTime = Date.now();
  const evalId = `eval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const results = [];
  const suggestions: string[] = [];

  for (const evaluator of evaluators) {
    try {
      const result = await evaluator.evaluate(jdOutput, expected, context);

      results.push({
        name: evaluator.name,
        score: result.score * evaluator.weight,
        passed: result.passed,
        details: result.details,
      });

      if (result.suggestions) {
        suggestions.push(...result.suggestions);
      }
    } catch (err) {
      results.push({
        name: evaluator.name,
        score: 0,
        passed: false,
        details: { error: (err as Error).message },
      });
    }
  }

  // 计算总分
  const overallScore = Math.round(
    results.reduce((sum, r) => sum + r.score, 0) * 100
  );

  const passed = results.filter((r) => r.passed).length >= results.length * 0.6;

  return {
    overallScore,
    passed,
    evaluators: results,
    suggestions: [...new Set(suggestions)], // 去重
    metadata: {
      evalId,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
    },
  };
}

// ========== 格式化输出 ==========

export function formatEvalReport(report: EvalReport): string {
  const lines: string[] = [];

  lines.push("## JD 评估报告");
  lines.push("");

  // 总分
  const grade =
    report.overallScore >= 85
      ? "A"
      : report.overallScore >= 70
        ? "B"
        : report.overallScore >= 55
          ? "C"
          : "D";
  const emoji = report.passed ? "✅" : "⚠️";

  lines.push(
    `${emoji} **总分: ${report.overallScore}/100 (${grade}级)**`
  );
  lines.push("");

  // 各评估器结果
  lines.push("### 评估维度");
  lines.push("");
  lines.push("| 评估器 | 得分 | 状态 |");
  lines.push("| --- | --- | --- |");

  for (const e of report.evaluators) {
    const status = e.passed ? "✅ 通过" : "❌ 未通过";
    const scoreDisplay = `${Math.round(e.score * 100)}%`;
    lines.push(`| ${e.name} | ${scoreDisplay} | ${status} |`);
  }

  lines.push("");

  // 建议
  if (report.suggestions.length > 0) {
    lines.push("### 💡 改进建议");
    for (const s of report.suggestions) {
      lines.push(`- ${s}`);
    }
    lines.push("");
  }

  // 元数据
  lines.push("---");
  lines.push(
    `评估ID: ${report.metadata.evalId} | 耗时: ${report.metadata.duration}ms`
  );

  return lines.join("\n");
}
