/**
 * 市场数据智能模块
 *
 * 核心能力：
 * 1. 薪资情报：岗位+城市+级别的市场薪资区间
 * 2. 人才供给：该岗位的市场供需比
 * 3. 技能热度：市场上最受欢迎的技能组合
 * 4. 竞品分析：同行在招什么、JD 怎么写的
 *
 * 设计原则：
 * - 数据来源：Web Search（实时）+ 本地缓存（7天过期）
 * - 渐进增强：没有数据不阻断流程，只提供参考
 * - 成本控制：缓存优先，避免重复搜索
 */

import * as fs from "fs";
import * as path from "path";

// ========== 类型定义 ==========

/** 市场薪资数据 */
export interface SalaryData {
  role: string;
  city: string;
  level: string;
  p25: number; // 25分位
  p50: number; // 中位数
  p75: number; // 75分位
  p90: number; // 90分位
  sampleSize: string; // 样本量描述
  source: string; // 数据来源
  updatedAt: string; // 更新时间
}

/** 人才供给数据 */
export interface TalentSupply {
  role: string;
  city: string;
  supplyLevel: "紧缺" | "偏紧" | "平衡" | "充裕" | "过剩";
  demandTrend: "上升" | "平稳" | "下降";
  avgTimeToFill: string; // 平均招聘周期
  competitorCount: number; // 同城竞品招聘数
  insights: string[]; // 关键洞察
}

/** 技能热度 */
export interface SkillDemand {
  role: string;
  topSkills: {
    skill: string;
    demandRate: number; // 0-1，出现频率
    trend: "hot" | "stable" | "declining";
  }[];
  emergingSkills: string[]; // 新兴技能
  overratedSkills: string[]; // 被高估的技能
}

/** 竞品 JD 分析 */
export interface CompetitorJD {
  company: string;
  title: string;
  salaryRange: string;
  highlights: string[]; // 亮点
  weaknesses: string[]; // 不足
  source: string; // 来源平台
}

/** 完整市场情报 */
export interface MarketIntelligence {
  role: string;
  city: string;
  level: string;
  salary?: SalaryData;
  supply?: TalentSupply;
  skills?: SkillDemand;
  competitors?: CompetitorJD[];
  summary: string; // 一句话总结
  recommendations: string[]; // 给 HR 的建议
  fetchedAt: string;
}

/** 缓存条目 */
interface CacheEntry<T> {
  data: T;
  fetchedAt: string;
  expiresAt: string;
}

// ========== 配置 ==========

const CACHE_DIR = path.join(
  process.env.HOME || "/tmp",
  ".hr-agent",
  "market-cache"
);
const CACHE_TTL_DAYS = 7; // 缓存 7 天过期

// ========== 缓存层 ==========

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function getCacheKey(role: string, city: string, level: string): string {
  return `${role}_${city}_${level}`.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, "_");
}

function getCached<T>(key: string): T | null {
  try {
    const filePath = path.join(CACHE_DIR, `${key}.json`);
    if (!fs.existsSync(filePath)) return null;

    const entry: CacheEntry<T> = JSON.parse(
      fs.readFileSync(filePath, "utf-8")
    );
    if (new Date(entry.expiresAt) < new Date()) {
      fs.unlinkSync(filePath);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

function setCache<T>(key: string, data: T): void {
  try {
    ensureCacheDir();
    const now = new Date();
    const expires = new Date(now.getTime() + CACHE_TTL_DAYS * 86400000);
    const entry: CacheEntry<T> = {
      data,
      fetchedAt: now.toISOString(),
      expiresAt: expires.toISOString(),
    };
    fs.writeFileSync(
      path.join(CACHE_DIR, `${key}.json`),
      JSON.stringify(entry, null, 2)
    );
  } catch {
    // 缓存写入失败不阻断流程
  }
}

// ========== 搜索查询构建 ==========

/** 构建薪资搜索查询 */
export function buildSalaryQuery(
  role: string,
  city: string,
  level: string
): string {
  return `${city}${role}${level}薪资范围 2025 2026 招聘市场`;
}

/** 构建人才供给搜索查询 */
export function buildSupplyQuery(role: string, city: string): string {
  return `${city}${role}人才市场供需 招聘难度 2025 2026`;
}

/** 构建技能热度搜索查询 */
export function buildSkillsQuery(role: string): string {
  return `${role}岗位技能要求 最热门技术栈 2025 2026 JD分析`;
}

/** 构建竞品搜索查询 */
export function buildCompetitorQuery(
  role: string,
  city: string,
  industry?: string
): string {
  const industryStr = industry ? `${industry}` : "";
  return `${city}${industryStr}${role}招聘 JD 最新 ${new Date().getFullYear()}`;
}

// ========== 数据解析 ==========

/** 从搜索结果中提取薪资数据 */
export function parseSalaryFromSearchResults(
  results: string,
  role: string,
  city: string,
  level: string
): SalaryData | null {
  // 尝试从文本中提取薪资数字
  const salaryPatterns = [
    /(\d+)[kK]\s*[-~到至]\s*(\d+)[kK]/g,
    /(\d{1,2})\s*[-~到至]\s*(\d{1,2})\s*[k万千]/g,
    /月薪\s*(\d+)[kK]?\s*[-~到至]\s*(\d+)[kK]?/g,
    /年薪\s*(\d+)\s*[-~到至]\s*(\d+)\s*[万千]/g,
  ];

  const ranges: [number, number][] = [];
  for (const pattern of salaryPatterns) {
    let match;
    while ((match = pattern.exec(results)) !== null) {
      const low = parseInt(match[1]);
      const high = parseInt(match[2]);
      if (low > 0 && high > low && low < 200) {
        // 合理范围
        ranges.push([low, high]);
      }
    }
  }

  if (ranges.length === 0) return null;

  // 计算分位数
  const allNumbers = ranges.flatMap(([l, h]) => [l, h]).sort((a, b) => a - b);
  const len = allNumbers.length;

  return {
    role,
    city,
    level,
    p25: allNumbers[Math.floor(len * 0.25)] || allNumbers[0],
    p50: allNumbers[Math.floor(len * 0.5)] || allNumbers[Math.floor(len / 2)],
    p75: allNumbers[Math.floor(len * 0.75)] || allNumbers[len - 2],
    p90: allNumbers[Math.min(len - 1, Math.floor(len * 0.9))],
    sampleSize: `${ranges.length} 条招聘信息`,
    source: "Web Search",
    updatedAt: new Date().toISOString().split("T")[0],
  };
}

/** 从搜索结果中提取供给数据 */
export function parseSupplyFromSearchResults(
  results: string,
  role: string,
  city: string
): TalentSupply {
  // 关键词分析
  const keywords = results.toLowerCase();
  let supplyLevel: TalentSupply["supplyLevel"] = "平衡";
  let demandTrend: TalentSupply["demandTrend"] = "平稳";
  const insights: string[] = [];

  if (
    keywords.includes("紧缺") ||
    keywords.includes("难招") ||
    keywords.includes("供不应求")
  ) {
    supplyLevel = "紧缺";
    insights.push("市场人才紧缺，招聘周期可能较长");
  } else if (
    keywords.includes("充裕") ||
    keywords.includes("过剩") ||
    keywords.includes("竞争激烈")
  ) {
    supplyLevel = "充裕";
    insights.push("市场人才充裕，有议价空间");
  }

  if (
    keywords.includes("需求增长") ||
    keywords.includes("上升") ||
    keywords.includes("扩招")
  ) {
    demandTrend = "上升";
    insights.push("岗位需求呈上升趋势，建议尽早锁定人才");
  } else if (
    keywords.includes("需求下降") ||
    keywords.includes("收缩") ||
    keywords.includes("裁员")
  ) {
    demandTrend = "下降";
    insights.push("岗位需求下降，可适当提高筛选标准");
  }

  // 提取招聘周期
  const timeMatch = keywords.match(
    /(?:招聘周期|平均|周期)\s*(\d+)\s*[天周月]/
  );
  const avgTimeToFill = timeMatch
    ? `${timeMatch[1]}天`
    : supplyLevel === "紧缺"
      ? "30-60天"
      : supplyLevel === "充裕"
        ? "7-14天"
        : "14-30天";

  if (insights.length === 0) {
    insights.push("市场数据有限，建议参考同行招聘信息");
  }

  return {
    role,
    city,
    supplyLevel,
    demandTrend,
    avgTimeToFill,
    competitorCount: 0,
    insights,
  };
}

/** 从搜索结果中提取技能热度 */
export function parseSkillsFromSearchResults(
  results: string,
  role: string
): SkillDemand {
  // 常见技术技能关键词
  const techSkills = [
    "React",
    "Vue",
    "Angular",
    "Node.js",
    "TypeScript",
    "JavaScript",
    "Python",
    "Java",
    "Go",
    "Rust",
    "SQL",
    "MongoDB",
    "Redis",
    "Docker",
    "K8s",
    "Kubernetes",
    "AWS",
    "阿里云",
    "微服务",
    "GraphQL",
    "REST",
    "CI/CD",
    "Git",
    "Webpack",
    "Vite",
    "Tailwind",
    "Next.js",
    "Nuxt",
    "Express",
    "NestJS",
    "Spring",
    "Django",
    "Flask",
    "FastAPI",
    "机器学习",
    "深度学习",
    "NLP",
    "大模型",
    "LLM",
    "RAG",
    "向量数据库",
    "Elasticsearch",
    "Flink",
    "Spark",
    "Hadoop",
    "数据分析",
    "BI",
    "Tableau",
    "PowerBI",
    "Figma",
    "Sketch",
    "UI/UX",
    "产品经理",
    "项目管理",
    "Scrum",
    "Agile",
    "PMP",
    "财务分析",
    "CPA",
    "税务",
    "审计",
    "SaaS",
    "B2B",
    "CRM",
    "ERP",
    "OA",
  ];

  const resultsLower = results.toLowerCase();
  const topSkills = techSkills
    .map((skill) => {
      const count = (
        resultsLower.match(new RegExp(skill.toLowerCase(), "g")) || []
      ).length;
      return {
        skill,
        demandRate: Math.min(count / 5, 1),
        trend: (count >= 3 ? "hot" : count >= 1 ? "stable" : "declining") as
          | "hot"
          | "stable"
          | "declining",
      };
    })
    .filter((s) => s.demandRate > 0)
    .sort((a, b) => b.demandRate - a.demandRate)
    .slice(0, 10);

  return {
    role,
    topSkills,
    emergingSkills: topSkills
      .filter((s) => s.trend === "hot")
      .map((s) => s.skill)
      .slice(0, 3),
    overratedSkills: [],
  };
}

// ========== 市场情报生成 ==========

/** 生成市场建议 */
function generateRecommendations(
  salary?: SalaryData,
  supply?: TalentSupply,
  skills?: SkillDemand
): string[] {
  const recs: string[] = [];

  if (salary) {
    if (salary.p50 > 0) {
      recs.push(
        `薪资定位：市场中位数 ${salary.p50}K，建议以 P50-P75 区间 (${salary.p50}-${salary.p75}K) 吸引优质候选人`
      );
    }
  }

  if (supply) {
    if (supply.supplyLevel === "紧缺") {
      recs.push(
        "人才紧缺：建议放宽非核心条件，突出公司吸引力，缩短面试流程"
      );
    } else if (supply.supplyLevel === "充裕") {
      recs.push(
        "人才充裕：可适当提高筛选标准，优中选优"
      );
    }

    if (supply.demandTrend === "上升") {
      recs.push("需求上升趋势：建议尽早启动招聘，避免人才被竞争对手抢走");
    }
  }

  if (skills && skills.topSkills.length > 0) {
    const hotSkills = skills.topSkills
      .filter((s) => s.trend === "hot")
      .map((s) => s.skill);
    if (hotSkills.length > 0) {
      recs.push(`热门技能：${hotSkills.join("、")}，JD 中应重点提及`);
    }
  }

  if (recs.length === 0) {
    recs.push("市场数据不足，建议参考 BOSS 直聘/猎聘等平台的同类岗位");
  }

  return recs;
}

/** 生成一句话总结 */
function generateSummary(
  role: string,
  city: string,
  salary?: SalaryData,
  supply?: TalentSupply
): string {
  const parts: string[] = [`${city}${role}`];

  if (salary && salary.p50 > 0) {
    parts.push(`薪资中位数 ${salary.p50}K`);
  }

  if (supply) {
    parts.push(`人才${supply.supplyLevel}`);
    if (supply.demandTrend !== "平稳") {
      parts.push(`需求${supply.demandTrend}`);
    }
  }

  return parts.join("，");
}

// ========== 主函数 ==========

/**
 * 生成市场情报（从缓存或搜索结果）
 *
 * @param role 岗位名称
 * @param city 城市
 * @param level 级别
 * @param searchResults Web Search 结果（可选，如果有则解析；没有则用缓存或默认值）
 * @param industry 行业（可选）
 * @returns 完整市场情报
 */
export function generateMarketIntelligence(
  role: string,
  city: string,
  level: string,
  searchResults?: {
    salary?: string;
    supply?: string;
    skills?: string;
    competitors?: string;
  },
  industry?: string
): MarketIntelligence {
  const cacheKey = getCacheKey(role, city, level);

  // 1. 检查缓存
  const cached = getCached<MarketIntelligence>(cacheKey);
  if (cached) {
    console.log(`📦 市场数据缓存命中: ${cacheKey}`);
    return cached;
  }

  console.log(`🔍 解析市场数据: ${role} @ ${city} (${level})`);

  // 2. 解析搜索结果
  const salary = searchResults?.salary
    ? parseSalaryFromSearchResults(searchResults.salary, role, city, level) || undefined
    : undefined;

  const supply = searchResults?.supply
    ? parseSupplyFromSearchResults(searchResults.supply, role, city)
    : undefined;

  const skills = searchResults?.skills
    ? parseSkillsFromSearchResults(searchResults.skills, role)
    : undefined;

  // 3. 解析竞品 JD
  const competitors: CompetitorJD[] = [];
  if (searchResults?.competitors) {
    // 简单提取：每段作为一个竞品
    const blocks = searchResults.competitors
      .split(/\n\n+/)
      .filter((b) => b.trim().length > 20);
    for (const block of blocks.slice(0, 5)) {
      const lines = block.split("\n").filter((l) => l.trim());
      competitors.push({
        company: lines[0]?.substring(0, 30) || "未知公司",
        title: role,
        salaryRange: "",
        highlights: lines.slice(1, 3).map((l) => l.substring(0, 50)),
        weaknesses: [],
        source: "Web Search",
      });
    }
  }

  // 4. 生成建议
  const recommendations = generateRecommendations(salary, supply, skills);
  const summary = generateSummary(role, city, salary, supply);

  const intelligence: MarketIntelligence = {
    role,
    city,
    level,
    salary: salary || undefined,
    supply: supply || undefined,
    skills: skills || undefined,
    competitors: competitors.length > 0 ? competitors : undefined,
    summary,
    recommendations,
    fetchedAt: new Date().toISOString(),
  };

  // 5. 缓存结果
  setCache(cacheKey, intelligence);

  return intelligence;
}

/**
 * 将市场情报格式化为可读文本（用于注入到 LLM Prompt）
 */
export function formatMarketForPrompt(intel: MarketIntelligence): string {
  const lines: string[] = [];

  lines.push(`## 市场情报: ${intel.summary}`);
  lines.push("");

  if (intel.salary) {
    lines.push("### 薪资区间");
    lines.push(`- P25: ${intel.salary.p25}K | P50: ${intel.salary.p50}K | P75: ${intel.salary.p75}K | P90: ${intel.salary.p90}K`);
    lines.push(`- 样本: ${intel.salary.sampleSize} | 来源: ${intel.salary.source}`);
    lines.push("");
  }

  if (intel.supply) {
    lines.push("### 人才供需");
    lines.push(`- 供给: ${intel.supply.supplyLevel} | 趋势: ${intel.supply.demandTrend}`);
    lines.push(`- 平均招聘周期: ${intel.supply.avgTimeToFill}`);
    lines.push("");
  }

  if (intel.skills && intel.skills.topSkills.length > 0) {
    lines.push("### 热门技能");
    for (const s of intel.skills.topSkills.slice(0, 5)) {
      const icon = s.trend === "hot" ? "🔥" : s.trend === "stable" ? "📌" : "📉";
      lines.push(`- ${icon} ${s.skill} (${Math.round(s.demandRate * 100)}% JD 提及)`);
    }
    lines.push("");
  }

  if (intel.competitors && intel.competitors.length > 0) {
    lines.push("### 竞品 JD 参考");
    for (const c of intel.competitors.slice(0, 3)) {
      lines.push(`- ${c.company}: ${c.highlights.join("; ")}`);
    }
    lines.push("");
  }

  lines.push("### 建议");
  for (const r of intel.recommendations) {
    lines.push(`- ${r}`);
  }

  return lines.join("\n");
}

/**
 * 将市场情报注入到上下文评估器的市场维度
 * （用于填充之前 0% 的市场维度）
 */
export function marketToIntelForEvaluation(intel: MarketIntelligence): {
  hasSalaryRange: boolean;
  hasMarketBenchmark: boolean;
  hasCompetitorAnalysis: boolean;
  hasTalentSupply: boolean;
  data: MarketIntelligence;
} {
  return {
    hasSalaryRange: !!intel.salary && intel.salary.p50 > 0,
    hasMarketBenchmark: !!intel.salary,
    hasCompetitorAnalysis: !!(
      intel.competitors && intel.competitors.length > 0
    ),
    hasTalentSupply: !!intel.supply,
    data: intel,
  };
}

// ========== 快捷函数 ==========

/**
 * 为需求访谈 Agent 提供薪资建议
 * 返回一个自然语言的薪资参考文本
 */
export function getSalarySuggestion(
  role: string,
  city: string,
  level: string,
  salary?: SalaryData
): string {
  if (!salary || salary.p50 === 0) {
    return `暂无${city}${role}${level}的精确薪资数据，建议参考 BOSS 直聘同类岗位。`;
  }

  return `${city}${role}${level}的市场薪资参考：中位数 ${salary.p50}K/月，` +
    `常见区间 ${salary.p25}-${salary.p75}K/月。` +
    `如果要求较强，建议定位 ${salary.p50}-${salary.p75}K 以吸引优质候选人。`;
}

/**
 * 检查薪资期望是否合理
 */
export function validateSalaryExpectation(
  expected: string,
  salary?: SalaryData
): {
  reasonable: boolean;
  feedback: string;
} {
  if (!salary || salary.p50 === 0) {
    return { reasonable: true, feedback: "无法验证（缺少市场数据）" };
  }

  // 提取期望薪资数字（支持 15K-25K, 15-25K, 1.5-2.5万 等格式）
  const match = expected.match(/(\d+(?:\.\d+)?)\s*[kK万千]?\s*[-~到至]\s*(\d+(?:\.\d+)?)/);
  if (!match) {
    return { reasonable: true, feedback: "无法解析薪资格式" };
  }

  let low = parseFloat(match[1]);
  let high = parseFloat(match[2]);

  // 处理"万"为单位（转为K）
  if (expected.includes("万")) {
    low *= 10;
    high *= 10;
  }
  const mid = (low + high) / 2;

  if (mid < salary.p25 * 0.8) {
    return {
      reasonable: false,
      feedback: `期望薪资 (${low}-${high}K) 明显低于市场 P25 (${salary.p25}K)，可能招不到合适的人`,
    };
  }

  if (mid > salary.p90 * 1.2) {
    return {
      reasonable: false,
      feedback: `期望薪资 (${low}-${high}K) 明显高于市场 P90 (${salary.p90}K)，建议确认是否需要顶尖人才`,
    };
  }

  return {
    reasonable: true,
    feedback: `期望薪资 (${low}-${high}K) 在市场合理范围内 (P25-P90: ${salary.p25}-${salary.p90}K)`,
  };
}
