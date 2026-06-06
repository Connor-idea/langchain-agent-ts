/**
 * 候选人画像生成器
 *
 * 目标：根据岗位需求 + 市场数据，生成目标候选人的完整画像
 *
 * 画像维度：
 * 1. 基本背景：当前职位、公司类型、工作年限、教育背景
 * 2. 技能图谱：核心技能、技能深度、技术栈偏好
 * 3. 职业动机：为什么想换工作、最看重什么
 * 4. 决策因素：薪酬/成长/文化/远程...的权重排序
 * 5. 信息渠道：在哪看机会、怎么被触达
 * 6. 面试关注：面试时最在意什么、会问什么问题
 *
 * 设计原则：
 * - 不是模板，是基于岗位+市场推导出的具体画像
 * - 支持多画像（同一岗位可能有多种候选人类型）
 * - 与市场数据联动（紧缺岗位的候选人画像更强调留人策略）
 */

import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { z } from "zod";
import { config } from "../config.js";
import type { MarketIntelligence } from "./market-intelligence.js";

// ========== 类型定义 ==========

/** 候选人画像 */
export interface CandidatePersona {
  /** 画像名称（如"技术深耕型"、"管理转型型"） */
  name: string;
  /** 画像类型 */
  type: "理想型" | "现实型" | "潜力型";

  /** 基本背景 */
  background: {
    currentRole: string; // 当前职位
    currentCompany: string; // 当前公司类型
    experience: string; // 工作年限
    education: string; // 教育背景
    currentSalary: string; // 当前薪资范围
    location: string; // 当前所在城市
  };

  /** 技能图谱 */
  skills: {
    core: string[]; // 核心技能
    depth: string; // 技能深度描述
    techStack: string[]; // 技术栈偏好
    gaps: string[]; // 可能的技能短板
  };

  /** 职业动机 */
  motivation: {
    primary: string; // 主要求职原因
    secondary: string[]; // 次要因素
    dealbreakers: string[]; // 绝对不能接受的
    mustHaves: string[]; // 必须有的
  };

  /** 决策因素（权重 1-10） */
  decisionFactors: {
    compensation: number; // 薪酬
    growth: number; // 成长空间
    culture: number; // 文化氛围
    workLifeBalance: number; // 工作生活平衡
    remote: number; // 远程灵活性
    stability: number; // 稳定性
    technology: number; // 技术挑战
    impact: number; // 影响力/成就感
  };

  /** 信息渠道 */
  channels: {
    primary: string[]; // 主要求职渠道
    secondary: string[]; // 次要渠道
    passive: string[]; // 被动触达方式
  };

  /** 面试关注 */
  interviewConcerns: {
    questions: string[]; // 候选人会问的问题
    redFlags: string[]; // 候选人会警惕的信号
    greenFlags: string[]; // 候选人会加分的信号
  };

  /** 招聘策略建议 */
  hiringStrategy: {
    pitch: string; // 一句话吸引点
    approach: string; // 接触方式建议
    timeline: string; // 建议的招聘节奏
    negotiation: string; // 谈薪策略
  };

  /** 置信度（基于数据充分程度） */
  confidence: "高" | "中" | "低";
}

/** 画像生成输入 */
export interface PersonaInput {
  role: string;
  city: string;
  level: string;
  industry?: string;
  department?: {
    name: string;
    mission?: string;
    team?: string;
    culture?: string[];
  };
  business?: {
    stage?: string;
    industry?: string;
    product?: string;
  };
  market?: MarketIntelligence;
}

// ========== LLM 画像生成 ==========

const PERSONA_PROMPT = ChatPromptTemplate.fromMessages([
  [
    "system",
    `你是一位资深招聘专家和人才分析师。根据岗位信息和市场数据，生成目标候选人的详细画像。

要求：
1. 画像要具体、真实，不要泛泛而谈
2. 基于市场数据推导，不是凭空想象
3. 考虑行业特性和公司阶段
4. 生成 2-3 种不同类型的候选人画像
5. 每种画像的决策因素要有明显差异

输出 JSON 数组格式。`,
  ],
  [
    "human",
    `请为以下岗位生成候选人画像：

岗位：{role}
城市：{city}
级别：{level}
{industry_text}
{department_text}
{business_text}
{market_text}

请生成 2-3 种不同类型的候选人画像，每种包含：
1. name: 画像名称（如"技术深耕型"、"管理转型型"）
2. type: "理想型" | "现实型" | "潜力型"
3. background: 当前职位、公司类型、工作年限、教育背景、当前薪资、所在城市
4. skills: 核心技能(3-5个)、技能深度、技术栈偏好、可能短板
5. motivation: 主要求职原因、次要因素、绝对不能接受的、必须有的
6. decisionFactors: 薪酬/成长/文化/工作生活平衡/远程/稳定性/技术挑战/影响力 各1-10分
7. channels: 主要求职渠道、次要渠道、被动触达方式
8. interviewConcerns: 候选人会问的问题、会警惕的信号、会加分的信号
9. hiringStrategy: 一句话吸引点、接触方式建议、招聘节奏、谈薪策略
10. confidence: 置信度

以 JSON 数组格式输出。`,
  ],
]);

// ========== 规则引擎画像生成（备用） ==========

function generateRuleBasedPersonas(input: PersonaInput): CandidatePersona[] {
  const personas: CandidatePersona[] = [];

  // 画像 1: 理想型（最匹配的候选人）
  personas.push({
    name: "理想匹配型",
    type: "理想型",
    background: {
      currentRole: `${input.level}${input.role}`,
      currentCompany: input.business?.stage === "A轮"
        ? "同阶段创业公司"
        : input.business?.stage === "B轮" || input.business?.stage === "C轮"
          ? "成长期互联网公司"
          : "成熟互联网/SaaS公司",
      experience: input.level === "初级" ? "1-3年" : input.level === "中级" ? "3-5年" : "5-10年",
      education: "本科及以上，计算机相关专业",
      currentSalary: input.market?.salary
        ? `${input.market.salary.p50}-${input.market.salary.p75}K`
        : "面议",
      location: input.city,
    },
    skills: {
      core: input.market?.skills?.topSkills.slice(0, 3).map(s => s.skill) || ["相关技术栈"],
      depth: input.level === "高级" ? "深入原理，能做技术选型" : "熟练使用，能独立开发",
      techStack: input.market?.skills?.topSkills.slice(0, 5).map(s => s.skill) || [],
      gaps: input.market?.skills?.overratedSkills || [],
    },
    motivation: {
      primary: "寻求更大的技术挑战和成长空间",
      secondary: ["更好的薪酬待遇", "更优秀的团队", "更有前景的产品"],
      dealbreakers: ["996加班文化", "技术栈过时", "管理混乱"],
      mustHaves: ["技术成长空间", "合理的薪酬", "良好的团队氛围"],
    },
    decisionFactors: {
      compensation: 7,
      growth: 9,
      culture: 7,
      workLifeBalance: 6,
      remote: 5,
      stability: 6,
      technology: 9,
      impact: 8,
    },
    channels: {
      primary: ["BOSS直聘", "脉脉", "朋友内推"],
      secondary: ["猎聘", "拉勾", "LinkedIn"],
      passive: ["技术社区", "GitHub", "掘金/思否"],
    },
    interviewConcerns: {
      questions: [
        "团队的技术栈和架构是怎样的？",
        "这个岗位的成长路径是什么？",
        "公司未来1-3年的发展规划？",
        "团队的工作节奏和加班情况？",
      ],
      redFlags: [
        "JD写的很虚，没有具体技术要求",
        "面试官说不清团队情况",
        "薪资范围明显低于市场",
        "要求过多的硬性条件",
      ],
      greenFlags: [
        "面试流程专业高效",
        "能清晰描述团队和技术挑战",
        "薪资透明且有竞争力",
        "有明确的成长路径",
      ],
    },
    hiringStrategy: {
      pitch: input.business?.product
        ? `参与${input.business.product}从0到1的技术建设，与优秀团队共同成长`
        : "加入技术驱动的团队，参与核心产品建设",
      approach: "技术主管亲自面试，展示技术挑战和成长空间",
      timeline: "2-3周内完成面试流程，快速出offer",
      negotiation: "以P50-P75为基准，突出成长空间和期权价值",
    },
    confidence: input.market ? "高" : "中",
  });

  // 画像 2: 现实型（市场上最容易找到的候选人）
  personas.push({
    name: "务实发展型",
    type: "现实型",
    background: {
      currentRole: `${input.level === "高级" ? "中级" : input.level}${input.role}`,
      currentCompany: "传统行业IT部门或外包公司",
      experience: input.level === "初级" ? "1-2年" : input.level === "中级" ? "2-4年" : "4-7年",
      education: "本科，非985/211",
      currentSalary: input.market?.salary
        ? `${input.market.salary.p25}-${input.market.salary.p50}K`
        : "面议",
      location: input.city,
    },
    skills: {
      core: input.market?.skills?.topSkills.slice(0, 2).map(s => s.skill) || ["基础技能"],
      depth: "能完成分配的任务，需要一定指导",
      techStack: input.market?.skills?.topSkills.filter(s => s.trend !== "hot").slice(0, 3).map(s => s.skill) || [],
      gaps: ["系统设计能力", "性能优化经验", "新技术学习速度"],
    },
    motivation: {
      primary: "当前公司成长空间有限，想进入更好的平台",
      secondary: ["提升技术能力", "获得更好的薪酬", "改善工作环境"],
      dealbreakers: ["薪资低于当前水平", "通勤时间过长"],
      mustHaves: ["薪资有涨幅", "能学到东西", "不要太卷"],
    },
    decisionFactors: {
      compensation: 9,
      growth: 7,
      culture: 5,
      workLifeBalance: 7,
      remote: 6,
      stability: 8,
      technology: 6,
      impact: 5,
    },
    channels: {
      primary: ["BOSS直聘", "智联招聘", "前程无忧"],
      secondary: ["拉勾", "猎聘"],
      passive: ["朋友圈", "同事介绍"],
    },
    interviewConcerns: {
      questions: [
        "薪资能给到多少？",
        "加班多吗？",
        "试用期多久？",
        "五险一金怎么交？",
      ],
      redFlags: [
        "面试问太多刁钻问题",
        "薪资不透明",
        "要求加班但不给加班费",
        "试用期太长",
      ],
      greenFlags: [
        "薪资明确且有涨幅",
        "面试流程简单高效",
        "公司环境好",
        "有培训和成长机会",
      ],
    },
    hiringStrategy: {
      pitch: "薪资有竞争力，平台好，能学到东西",
      approach: "HR主导，快速推进，减少面试轮次",
      timeline: "1-2周内完成，趁热打铁",
      negotiation: "以P50为基准，强调稳定性和福利",
    },
    confidence: input.market ? "中" : "低",
  });

  return personas;
}

// ========== 主函数 ==========

/**
 * 生成候选人画像
 *
 * @param input 岗位+市场+组织信息
 * @param useLLM 是否使用 LLM（默认 true，false 用规则引擎）
 * @returns 候选人画像数组
 */
export async function generateCandidatePersonas(
  input: PersonaInput,
  useLLM: boolean = true
): Promise<CandidatePersona[]> {
  // 规则引擎始终生成基础画像
  const rulePersonas = generateRuleBasedPersonas(input);

  if (!useLLM) {
    return rulePersonas;
  }

  try {
    const model = new ChatOpenAI({
      modelName: config.deepseek.models.pro,
      apiKey: config.deepseek.apiKey,
      baseURL: config.deepseek.baseUrl,
      temperature: 0.8,
      maxTokens: 3000,
    });

    const industryText = input.industry
      ? `行业：${input.industry}`
      : input.business?.industry
        ? `行业：${input.business.industry}`
        : "";

    const departmentText = input.department
      ? `部门：${input.department.name}${input.department.mission ? " - " + input.department.mission : ""}${input.department.team ? "，" + input.department.team : ""}`
      : "";

    const businessText = input.business
      ? `公司阶段：${input.business.stage || "未知"}${input.business.product ? "，产品：" + input.business.product : ""}`
      : "";

    const marketText = input.market
      ? `市场数据：薪资中位数 ${input.market.salary?.p50 || "未知"}K，人才${input.market.supply?.supplyLevel || "未知"}，热门技能：${input.market.skills?.topSkills.slice(0, 3).map(s => s.skill).join("、") || "未知"}`
      : "市场数据：暂无";

    const chain = PERSONA_PROMPT.pipe(model).pipe(new StringOutputParser());

    const result = await chain.invoke({
      role: input.role,
      city: input.city,
      level: input.level,
      industry_text: industryText,
      department_text: departmentText,
      business_text: businessText,
      market_text: marketText,
    });

    // 解析 JSON
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const llmPersonas = JSON.parse(jsonMatch[0]) as CandidatePersona[];
      // 合并：LLM 画像 + 规则引擎画像（去重）
      const merged = [...llmPersonas];
      for (const rp of rulePersonas) {
        if (!merged.find((lp) => lp.type === rp.type)) {
          merged.push(rp);
        }
      }
      return merged;
    }

    return rulePersonas;
  } catch (err) {
    console.log("⚠️ LLM 画像生成失败，使用规则引擎:", (err as Error).message);
    return rulePersonas;
  }
}

/**
 * 将候选人画像格式化为可读文本
 */
export function formatPersona(persona: CandidatePersona): string {
  const lines: string[] = [];

  lines.push(`### ${persona.name} (${persona.type}) [置信度: ${persona.confidence}]`);
  lines.push("");

  lines.push("**背景**");
  lines.push(`- 当前职位：${persona.background.currentRole} @ ${persona.background.currentCompany}`);
  lines.push(`- 经验：${persona.background.experience} | 教育：${persona.background.education}`);
  lines.push(`- 当前薪资：${persona.background.currentSalary} | 所在地：${persona.background.location}`);
  lines.push("");

  lines.push("**技能**");
  lines.push(`- 核心：${persona.skills.core.join("、")}`);
  lines.push(`- 深度：${persona.skills.depth}`);
  if (persona.skills.gaps.length > 0) {
    lines.push(`- 可能短板：${persona.skills.gaps.join("、")}`);
  }
  lines.push("");

  lines.push("**动机**");
  lines.push(`- 主要原因：${persona.motivation.primary}`);
  lines.push(`- 必须有：${persona.motivation.mustHaves.join("、")}`);
  lines.push(`- 不能接受：${persona.motivation.dealbreakers.join("、")}`);
  lines.push("");

  lines.push("**决策因素**");
  const factors = Object.entries(persona.decisionFactors)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4);
  const factorNames: Record<string, string> = {
    compensation: "薪酬",
    growth: "成长",
    culture: "文化",
    workLifeBalance: "工作生活平衡",
    remote: "远程",
    stability: "稳定性",
    technology: "技术挑战",
    impact: "影响力",
  };
  for (const [key, value] of factors) {
    lines.push(`- ${factorNames[key] || key}: ${"█".repeat(value)}${"░".repeat(10 - value)} ${value}/10`);
  }
  lines.push("");

  lines.push("**触达渠道**");
  lines.push(`- 主要：${persona.channels.primary.join("、")}`);
  lines.push(`- 被动触达：${persona.channels.passive.join("、")}`);
  lines.push("");

  lines.push("**招聘策略**");
  lines.push(`- 吸引点：${persona.hiringStrategy.pitch}`);
  lines.push(`- 方式：${persona.hiringStrategy.approach}`);
  lines.push(`- 节奏：${persona.hiringStrategy.timeline}`);

  return lines.join("\n");
}

/**
 * 格式化所有画像为 Prompt 注入文本
 */
export function formatPersonasForPrompt(personas: CandidatePersona[]): string {
  const lines: string[] = [];

  lines.push("## 目标候选人画像\n");
  lines.push(`共 ${personas.length} 种候选人类型：\n`);

  for (const persona of personas) {
    lines.push(formatPersona(persona));
    lines.push("\n---\n");
  }

  // 总结对比
  lines.push("### 画像对比");
  lines.push("");
  lines.push("| 维度 | " + personas.map((p) => p.name).join(" | ") + " |");
  lines.push("| --- | " + personas.map(() => "---").join(" | ") + " |");

  const factorNames: Record<string, string> = {
    compensation: "薪酬权重",
    growth: "成长权重",
    stability: "稳定权重",
    technology: "技术权重",
  };

  for (const [key, label] of Object.entries(factorNames)) {
    const values = personas.map(
      (p) => (p.decisionFactors as any)[key] || 0
    );
    lines.push(`| ${label} | ${values.join(" | ")} |`);
  }

  return lines.join("\n");
}

/**
 * 从画像中提取招聘建议（用于 JD 生成）
 */
export function extractHiringInsights(personas: CandidatePersona[]): {
  targetPersona: string;
  salaryStrategy: string;
  channelStrategy: string;
  pitchPoints: string[];
  avoidPoints: string[];
} {
  // 找到最可能招到的画像（现实型优先）
  const target =
    personas.find((p) => p.type === "现实型") || personas[0];

  // 薪资策略：取所有画像的薪资权重中位数
  const salaryWeights = personas.map((p) => p.decisionFactors.compensation);
  const avgSalaryWeight =
    salaryWeights.reduce((a, b) => a + b, 0) / salaryWeights.length;

  const salaryStrategy =
    avgSalaryWeight >= 8
      ? "薪资是核心竞争力，建议定位 P75 以上"
      : avgSalaryWeight >= 6
        ? "薪资重要但不是唯一，建议 P50-P75 + 成长空间"
        : "薪资敏感度较低，可适当降低预算，突出其他优势";

  // 渠道策略：合并所有画像的主要渠道
  const allChannels = new Set<string>();
  for (const p of personas) {
    for (const c of p.channels.primary) allChannels.add(c);
  }

  return {
    targetPersona: `${target.name}：${target.background.currentRole}，${target.background.experience}`,
    salaryStrategy,
    channelStrategy: Array.from(allChannels).join("、"),
    pitchPoints: personas.flatMap((p) => p.hiringStrategy.pitch).slice(0, 3),
    avoidPoints: personas
      .flatMap((p) => p.interviewConcerns.redFlags)
      .slice(0, 5),
  };
}
