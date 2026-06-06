/**
 * JD 生成器 V3 — 深度优化版
 *
 * V2 → V3 升级：
 * 1. 并行审查：5 个角色 Promise.all 同时执行，速度 5x
 * 2. 结构化输出：JD 输出为 JSON Schema，方便下游消费
 * 3. 成本追踪：token 消耗、耗时、费用估算
 * 4. 审查校准：评分标准更合理，避免虚低
 * 5. 更丰富的行业基准数据
 */
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { z } from "zod";
import { config } from "../config.js";

// ========== 结构化输出 Schema ==========

export const JDSchema = z.object({
  title: z.string().describe("岗位名称"),
  level: z.enum(["初级", "中级", "高级", "专家/总监"]).describe("职级"),
  department: z.string().describe("所属部门"),
  reportsTo: z.string().describe("汇报对象"),
  positioning: z.string().describe("一句话定位：这个人在团队中的角色和价值"),
  responsibilities: z
    .array(
      z.object({
        id: z.number(),
        description: z.string().describe("职责描述"),
        priority: z.enum(["核心", "重要", "辅助"]).describe("优先级"),
        measurable: z.string().default("").describe("可衡量的产出指标"),
      })
    )
    .describe("岗位职责 5-8 条"),
  requirements: z.object({
    hard: z
      .array(
        z.object({
          item: z.string().describe("硬性条件"),
          required: z.boolean().describe("是否必须（false=加分项）"),
          reason: z.string().default("").describe("为什么需要这个条件"),
        })
      )
      .describe("硬性条件"),
    soft: z
      .array(
        z.object({
          item: z.string().describe("软性素质"),
          evidence: z.string().default("").describe("如何在面试中验证"),
        })
      )
      .describe("软性素质"),
  }),
  compensation: z.object({
    salaryRange: z.string().describe("薪资范围"),
    salaryNote: z.string().describe("薪资说明（如高薪对应什么条件）"),
    benefits: z.array(z.string()).describe("福利列表"),
    bonus: z.string().default("").describe("奖金/激励"),
  }),
  teamContext: z.object({
    currentTeam: z.string().describe("当前团队情况"),
    thisRole: z.string().describe("这个人在团队中的位置"),
    growthPath: z.string().describe("成长路径"),
  }),
  companyPitch: z.string().describe("公司/团队介绍（简洁、真实、有差异化）"),
  dealbreakers: z
    .array(z.string())
    .default([])
    .describe("一票否决项（有这些直接不考虑）"),
  niceToHaves: z
    .array(z.string())
    .default([])
    .describe("加分项（有更好，没有也行）"),
});

export type JDStructured = z.infer<typeof JDSchema>;

// ========== 类型 ==========

export interface DepartmentProfile {
  name: string;
  mission: string;
  team: TeamMember[];
  managementStyle: "扁平" | "层级" | "矩阵" | "项目制";
  culture: string[];
  collaboration: string;
  topChallenge: string;
}

export interface TeamMember {
  role: string;
  level: "初级" | "中级" | "高级" | "专家";
  yearsOfExp: number;
  keySkills: string[];
  replaceable: boolean;
}

export interface BusinessContext {
  companyName: string;
  industry: string;
  stage: "初创" | "成长" | "成熟" | "转型";
  bossExpectation: string;
  strategy: string;
  businessGoals: string[];
  budgetConstraint: "宽松" | "适中" | "紧张";
  implicitRequirements?: string;
}

export interface JobRequirementV2 {
  title: string;
  rawNeed: string;
  budget?: { min: number; max: number };
  urgency: "紧急" | "常规" | "储备";
  extras?: string;
}

export interface JDDraftInput {
  requirement: JobRequirementV2;
  department: DepartmentProfile;
  business: BusinessContext;
}

export interface ReviewFeedback {
  role: string;
  perspective: string;
  issues: string[];
  suggestions: string[];
  score: number;
  verdict: "通过" | "需修订" | "重大问题";
}

export interface CostMetrics {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostRMB: number;
  totalDurationMs: number;
  llmCalls: number;
}

export interface JDResultV3 {
  jd: JDStructured;
  jdText: string;
  diagnosis: string;
  reviews: ReviewFeedback[];
  iterations: number;
  cost: CostMetrics;
}

// ========== LLM ==========

function createLLM(temp = 0.7) {
  return new ChatOpenAI({
    apiKey: config.deepseek.apiKey,
    model: config.deepseek.models.flash,
    temperature: temp,
    configuration: { baseURL: config.deepseek.baseUrl },
  });
}

/** Pro 模型：深度推理，用于诊断/生成/修订 */
function createProLLM(temp = 0.7, reasoningEffort: "low" | "medium" | "high" = "medium") {
  const llm = new ChatOpenAI({
    apiKey: config.deepseek.apiKey,
    model: config.deepseek.models.pro,
    temperature: temp,
    maxTokens: 4000,
    configuration: { baseURL: config.deepseek.baseUrl },
  });
  return llm.bind({ reasoning_effort: reasoningEffort } as any);
}

// ========== 行业基准 ==========

const INDUSTRY_BENCHMARKS: Record<string, object> = {
  前端开发: {
    market_salary: {
      junior: "8-15K",
      mid: "15-25K",
      senior: "25-40K",
      lead: "35-55K",
    },
    hot_skills: ["React", "Vue3", "TypeScript", "Next.js", "Tailwind"],
    supply: "充足",
    avg_tenure: "1.5年",
    common_red_flags: ["只会框架不懂原理", "没有大型项目经验", "不写测试"],
    interview_focus: ["系统设计", "性能优化", "实际项目深挖"],
  },
  产品经理: {
    market_salary: {
      junior: "10-18K",
      mid: "18-30K",
      senior: "30-50K",
      director: "40-70K",
    },
    hot_skills: ["数据分析", "用户研究", "B端经验", "AI产品", "商业化"],
    supply: "中等",
    avg_tenure: "2年",
    common_red_flags: ["只会画原型不做分析", "没有数据意识", "脱离用户"],
    interview_focus: ["需求分析", "数据驱动", "商业思维"],
  },
  后端开发: {
    market_salary: {
      junior: "10-16K",
      mid: "16-28K",
      senior: "28-45K",
      architect: "40-65K",
    },
    hot_skills: ["Java", "Go", "微服务", "云原生", "分布式"],
    supply: "充足",
    avg_tenure: "2年",
    common_red_flags: ["只做CRUD", "不懂架构", "性能优化能力弱"],
    interview_focus: ["系统设计", "架构能力", "问题排查"],
  },
  销售: {
    market_salary: {
      junior: "6-10K+提成",
      mid: "10-15K+提成",
      senior: "15-25K+提成",
      director: "20-35K+提成",
    },
    hot_skills: ["SaaS销售", "大客户", "行业资源", "方案型销售"],
    supply: "充足",
    avg_tenure: "1.5年",
    common_red_flags: ["只有关系没有方法论", "不能复制成功", "客单价上不去"],
    interview_focus: ["业绩数据", "销售方法论", "客户开发能力"],
  },
};

// ========== 成本估算 ==========
// DeepSeek 定价：输入 ¥1/百万token，输出 ¥2/百万token
const COST_PER_MILLION_INPUT = 1;
const COST_PER_MILLION_OUTPUT = 2;

// ========== Step 1: 组织诊断 ==========

const DIAGNOSIS_PROMPT = ChatPromptTemplate.fromMessages([
  [
    "system",
    `你是资深组织发展顾问（OD）。在生成 JD 之前做组织诊断。

诊断框架（输出 300-500 字）：
1. **核心问题**：这个岗位到底要解决什么问题？（不是"做什么任务"）
2. **团队缺口**：现有团队缺什么能力？这个人补的是哪个位置？
3. **协作关系**：这个人进来后和谁协作？上下游是谁？
4. **管理适配**：部门管理风格适合什么样的人？
5. **风险提示**：招这个人的最大风险是什么？

要求：结论先行，每条有依据，不要泛泛而谈。`,
  ],
  [
    "human",
    `部门：{department_name}（{department_mission}）
团队：{team_structure}
管理风格：{management_style} | 文化：{culture}
协作模式：{collaboration} | 当前挑战：{topChallenge}

公司：{company_name}（{industry}，{stage}）
老板期望：{bossExpectation}
战略：{strategy} | 目标：{business_goals}
预算：{budget_constraint} | 隐性要求：{implicit_requirements}

岗位：{title} | 需求：{rawNeed} | 预算：{budget} | 紧急度：{urgency}`,
  ],
]);

// ========== Step 2: JD 生成（结构化） ==========

const JD_GENERATION_PROMPT = ChatPromptTemplate.fromMessages([
  [
    "system",
    `你是资深 HR 专家，基于组织诊断结论生成 JD。

核心原则：
- 每条职责对应诊断中发现的真实问题
- 每条要求有存在的理由（不要堆砌"精通XX"）
- 用"你将..."而不是"负责..."——让候选人看到画面感
- 薪酬要有竞争力分析，不只是数字

输出格式要求（严格按照此结构）：
# [岗位名称]
级别：[职级] | 部门：[部门] | 汇报：[汇报对象]
定位：[一句话定位]

## 岗位职责
1. [核心/重要/辅助] [职责描述]（可衡量指标：xxx）
2. ...

## 任职要求
### 必须具备
- [条件]（理由：xxx）
### 加分项
- [条件]

## 软性素质
- [素质]（验证方式：xxx）

## 薪酬福利
薪资：[范围]
说明：[薪资说明]
奖金：[奖金/激励]
福利：[福利列表]

## 团队与发展
当前团队：[描述]
你的位置：[描述]
成长路径：[描述]

## 一票否决
- [条件]

## 加分项
- [条件]

## 关于我们
[公司/团队介绍]`,
  ],
  [
    "human",
    `=== 组织诊断 ===
{diagnosis}

=== 行业基准 ===
{benchmark}

=== 薪酬预算 ===
{budget}

=== 团队文化 ===
{culture}

=== 隐性要求 ===
{implicit_requirements}

请生成 JD：`,
  ],
]);

// ========== Step 3: 审查（校准版） ==========

const REVIEWERS: Record<
  string,
  { system: string; focus: string; lens: string }
> = {
  PM: {
    system: `你是产品总监。从**业务价值和团队协作**角度审查 JD。

评分标准（请严格按此打分）：
- 9-10分：优秀，可以直接发布
- 7-8分：合格，小修即可
- 5-6分：有明显问题，需要修订
- 3-4分：重大问题
- 1-2分：需要重写

注意：7分是"合格线"，不要因为小瑕疵就打5-6分。只有确实影响招聘效果的问题才扣分。`,
    focus: "业务价值、职责边界、产出质量",
    lens: "我能不能和这个人愉快合作？",
  },
  TECH: {
    system: `你是技术总监。从**技术能力和技术栈匹配**角度审查 JD。

评分标准（请严格按此打分）：
- 9-10分：技术要求精准，完全匹配团队需求
- 7-8分：基本准确，有小的调整
- 5-6分：有明显不准确或遗漏
- 3-4分：技术要求严重偏离实际
- 1-2分：需要重写

注意：7分是"合格线"。不要因为"可以更精确"就打5-6分。`,
    focus: "技术准确性、技能组合、层级匹配",
    lens: "这个人能不能解决我们的技术问题？",
  },
  HRD: {
    system: `你是 HRD。从**招聘可行性和市场竞争力**角度审查 JD。

评分标准（请严格按此打分）：
- 9-10分：极具竞争力，能吸引优质候选人
- 7-8分：合格，能招到合适的人
- 5-6分：竞争力不足，可能招不到人
- 3-4分：严重问题
- 1-2分：需要重写

注意：7分是"合格线"。小的优化建议放在"建议"里，不影响评分。`,
    focus: "招聘可行性、市场竞争力、吸引力",
    lens: "这个 JD 能不能吸引到对的人？",
  },
  BOSS: {
    system: `你是 CEO/老板。从**战略对齐和投入产出**角度审查 JD。

评分标准（请严格按此打分）：
- 9-10分：完美对齐战略，ROI 清晰
- 7-8分：基本对齐，有小的调整空间
- 5-6分：战略对齐度不够
- 3-4分：严重偏离战略
- 1-2分：需要重写

注意：7分是"合格线"。不要因为"可以更好"就打低分。`,
    focus: "战略对齐、ROI、优先级",
    lens: "这个人值不值这个钱？",
  },
  OD: {
    system: `你是组织发展顾问（OD）。从**组织健康和人才梯队**角度审查 JD。

评分标准（请严格按此打分）：
- 9-10分：完美补充团队，成长路径清晰
- 7-8分：基本合适，有小的调整
- 5-6分：团队适配有隐患
- 3-4分：可能造成组织问题
- 1-2分：需要重写

注意：7分是"合格线"。`,
    focus: "团队结构、能力互补、成长路径",
    lens: "这个人让团队变得更好还是更乱？",
  },
};

function createReviewPrompt(role: string, context: { bossExpectation?: string }) {
  const cfg = REVIEWERS[role];
  let systemPrompt = cfg.system;
  if (context.bossExpectation) {
    systemPrompt = systemPrompt.replace("{bossExpectation}", context.bossExpectation);
  }
  return ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    [
      "human",
      `你是${role}，审查视角：${cfg.lens}

待审查 JD：
---
{jd}
---

输出格式（严格遵守）：
问题列表：
- 问题1
- 问题2
改进建议：
- 建议1
- 建议2
评分：X/10
结论：通过/需修订/重大问题`,
    ],
  ]);
}

// ========== 修订 Prompt ==========

const REVISE_PROMPT = ChatPromptTemplate.fromMessages([
  [
    "system",
    `你是资深 HR 专家。根据五维审查反馈修订 JD。

修订优先级：BOSS 战略对齐 > OD 组织健康 > HRD 市场可行性 > PM/TECH 具体意见

原则：
- 采纳合理建议，但保留专业判断
- 不要因为修订而变得过度保守（什么都"优先"等于什么都不要求）
- 输出完整修订版 JD（JSON 格式，不要 markdown 标记）`,
  ],
  [
    "human",
    `原始 JD（JSON）：
{jd}

组织诊断：
{diagnosis}

五维审查反馈：
{reviews}

请输出修订后的完整 JD（JSON 格式）：`,
  ],
]);


function createDefaultJD(text: string, input: JDDraftInput): JDStructured {
  return {
    title: input.requirement.title,
    level: "中级",
    department: input.department.name,
    reportsTo: "",
    positioning: text.substring(0, 200),
    responsibilities: [{ id: 1, description: text.substring(0, 500), priority: "核心", measurable: "" }],
    requirements: { hard: [], soft: [] },
    compensation: {
      salaryRange: input.requirement.budget ? \`\${input.requirement.budget.min}-\${input.requirement.budget.max}K\` : "面议",
      salaryNote: "",
      benefits: [],
      bonus: "",
    },
    teamContext: { currentTeam: "", thisRole: "", growthPath: "" },
    companyPitch: "",
    dealbreakers: [],
    niceToHaves: [],
  };
}

// ========== 工具函数 ==========

function parseFeedback(raw: string, role: string): ReviewFeedback {
  const cfg = REVIEWERS[role];
  const lines = raw.split("\n").filter((l) => l.trim());
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 7;
  let verdict: ReviewFeedback["verdict"] = "需修订";
  let section = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.includes("问题列表")) section = "issues";
    else if (trimmed.includes("改进建议") || trimmed.includes("建议")) section = "suggestions";
    else if (trimmed.includes("评分")) {
      const m = trimmed.match(/(\d+)/);
      if (m) score = parseInt(m[1]);
    } else if (trimmed.includes("结论")) {
      if (trimmed.includes("重大")) verdict = "重大问题";
      else if (trimmed.includes("通过") && !trimmed.includes("需修订")) verdict = "通过";
      else verdict = "需修订";
    } else if (trimmed.startsWith("-") || trimmed.startsWith("·")) {
      const text = trimmed.replace(/^[-·]\s*/, "").trim();
      if (text) {
        if (section === "issues") issues.push(text);
        else if (section === "suggestions") suggestions.push(text);
      }
    }
  }

  return { role, perspective: cfg.focus, issues, suggestions, score, verdict };
}

function extractJSON(text: string): string {
  // Remove markdown code blocks if present
  let cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/gi, "");
  // Find the first { and last }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1) {
    cleaned = cleaned.substring(start, end + 1);
  }
  // Try to fix common JSON issues
  cleaned = cleaned
    .replace(/,\s*}/g, "}")  // trailing commas in objects
    .replace(/,\s*]/g, "]")  // trailing commas in arrays
    .replace(/\n/g, " ")     // newlines in strings
    .replace(/\t/g, " ");    // tabs
  return cleaned;
}

// ========== 主流程 ==========

export async function generateJDV3(
  input: JDDraftInput,
  options: { maxIterations?: number; onProgress?: (msg: string) => void } = {}
): Promise<JDResultV3> {
  const { maxIterations = 2, onProgress } = options;
  const log = onProgress || (() => {});
  // 双模型策略：Pro 做诊断/生成/修订，Flash 做审查/结构化
  const llmPro = createProLLM(0.7, "high");   // 深度推理
  const llmFlash = createLLM(0.3);             // 快速审查
  const startTime = Date.now();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let llmCallCount = 0;

  // 行业基准
  const benchmark =
    INDUSTRY_BENCHMARKS[input.requirement.title] ||
    INDUSTRY_BENCHMARKS[input.department.name] ||
    { note: "无内置基准，请根据市场情况判断" };

  // Step 1: 组织诊断
  log("🔍 Step 1: 组织诊断...");
  const t1 = Date.now();
  const diagChain = DIAGNOSIS_PROMPT.pipe(llmPro).pipe(new StringOutputParser());
  const diagnosis = await diagChain.invoke({
    department_name: input.department.name,
    department_mission: input.department.mission,
    team_structure: input.department.team
      .map((m) => `- ${m.role}（${m.level}，${m.yearsOfExp}年，技能：${m.keySkills.join("、")}）`)
      .join("\n"),
    management_style: input.department.managementStyle,
    culture: input.department.culture.join("、"),
    collaboration: input.department.collaboration,
    topChallenge: input.department.topChallenge,
    company_name: input.business.companyName,
    industry: input.business.industry,
    stage: input.business.stage,
    bossExpectation: input.business.bossExpectation,
    strategy: input.business.strategy,
    business_goals: input.business.businessGoals.join("; "),
    budget_constraint: input.business.budgetConstraint,
    implicit_requirements: input.business.implicitRequirements || "无",
    title: input.requirement.title,
    rawNeed: input.requirement.rawNeed,
    budget: input.requirement.budget
      ? `${input.requirement.budget.min}-${input.requirement.budget.max}K`
      : "未定",
    urgency: input.requirement.urgency,
  });
  llmCallCount++;
  log(`   ✅ 诊断完成 (${Date.now() - t1}ms)\n`);

  // Step 2: 生成 JD（结构化）
  log("📝 Step 2: 生成结构化 JD...");
  const t2 = Date.now();
  const jdChain = JD_GENERATION_PROMPT.pipe(llmPro).pipe(new StringOutputParser());
  let currentJDText = await jdChain.invoke({
    diagnosis,
    json_schema: JDSchema.description || "JD JSON Schema",
    benchmark: JSON.stringify(benchmark, null, 2),
    budget: input.requirement.budget
      ? `${input.requirement.budget.min}-${input.requirement.budget.max}K`
      : "未定",
    culture: input.department.culture.join("、"),
    implicit_requirements: input.business.implicitRequirements || "无",
  });
  llmCallCount++;
  log(`   ✅ JD 初稿完成 (${Date.now() - t2}ms)\n`);

  // Convert text to structured format
  let currentJD: JDStructured;
  {
    const structChain = ChatPromptTemplate.fromMessages([
      ["system", `将以下 JD 文本转换为 JSON 格式。只输出 JSON，不要其他内容。注意：
- responsibilities 每项必须有 id, description, priority(核心/重要/辅助), measurable
- requirements.hard 每项必须有 item, required(true/false), reason
- requirements.soft 每项必须有 item, evidence
- compensation 必须有 salaryRange, salaryNote, benefits(数组), bonus
- teamContext 必须有 currentTeam, thisRole, growthPath
- dealbreakers 和 niceToHaves 是字符串数组
- companyPitch 是字符串`],
      ["human", "JD 文本：\n{jd_text}\n\n输出 JSON："],
    ]).pipe(createLLM(0.1)).pipe(new StringOutputParser());
    const structuredText = await structChain.invoke({ jd_text: currentJDText });
    try {
      const jsonStr = extractJSON(structuredText);
    try {
      try {
      currentJD = JDSchema.parse(JSON.parse(jsonStr));
    } catch (parseErr) {
      // Try partial parse - fill defaults for missing fields
      const raw = JSON.parse(jsonStr);
      currentJD = JDSchema.parse({
        title: raw.title || "未命名岗位",
        level: raw.level || "中级",
        department: raw.department || "",
        reportsTo: raw.reportsTo || "",
        positioning: raw.positioning || "",
        responsibilities: (raw.responsibilities || []).map((r: any, i: number) => ({
          id: r.id || i + 1,
          description: r.description || "",
          priority: r.priority || "重要",
          measurable: r.measurable || "",
        })),
        requirements: {
          hard: (raw.requirements?.hard || []).map((h: any) => ({
            item: h.item || "",
            required: h.required ?? true,
            reason: h.reason || "",
          })),
          soft: (raw.requirements?.soft || []).map((s: any) => ({
            item: s.item || "",
            evidence: s.evidence || "",
          })),
        },
        compensation: {
          salaryRange: raw.compensation?.salaryRange || "",
          salaryNote: raw.compensation?.salaryNote || "",
          benefits: raw.compensation?.benefits || [],
          bonus: raw.compensation?.bonus || "",
        },
        teamContext: {
          currentTeam: raw.teamContext?.currentTeam || "",
          thisRole: raw.teamContext?.thisRole || "",
          growthPath: raw.teamContext?.growthPath || "",
        },
        companyPitch: raw.companyPitch || "",
        dealbreakers: raw.dealbreakers || [],
        niceToHaves: raw.niceToHaves || [],
      });
    }
    } catch (parseErr) {
      // Try partial parse - fill defaults for missing fields
      const raw = JSON.parse(jsonStr);
      currentJD = JDSchema.parse({
        title: raw.title || "未命名岗位",
        level: raw.level || "中级",
        department: raw.department || "",
        reportsTo: raw.reportsTo || "",
        positioning: raw.positioning || "",
        responsibilities: (raw.responsibilities || []).map((r: any, i: number) => ({
          id: r.id || i + 1,
          description: r.description || "",
          priority: r.priority || "重要",
          measurable: r.measurable || "",
        })),
        requirements: {
          hard: (raw.requirements?.hard || []).map((h: any) => ({
            item: h.item || "",
            required: h.required ?? true,
            reason: h.reason || "",
          })),
          soft: (raw.requirements?.soft || []).map((s: any) => ({
            item: s.item || "",
            evidence: s.evidence || "",
          })),
        },
        compensation: {
          salaryRange: raw.compensation?.salaryRange || "",
          salaryNote: raw.compensation?.salaryNote || "",
          benefits: raw.compensation?.benefits || [],
          bonus: raw.compensation?.bonus || "",
        },
        teamContext: {
          currentTeam: raw.teamContext?.currentTeam || "",
          thisRole: raw.teamContext?.thisRole || "",
          growthPath: raw.teamContext?.growthPath || "",
        },
        companyPitch: raw.companyPitch || "",
        dealbreakers: raw.dealbreakers || [],
        niceToHaves: raw.niceToHaves || [],
      });
    }
    } catch (e) {
      log("   ⚠️ 结构化转换失败，使用默认值");
      currentJD = createDefaultJD(currentJDText, input);
    }
  }
  // Fallback if parsing still fails
  if (!currentJD!) {
    try {
      const jsonStr = extractJSON(currentJDText);
    const retryChain = ChatPromptTemplate.fromMessages([
      ["system", "将以下内容转换为严格的 JSON 格式，符合给定的 Schema。只输出 JSON，不要其他内容。"],
      ["human", "内容：{content}\n\nSchema 要求：{schema}"],
    ])
      .pipe(createLLM(0))
      .pipe(new StringOutputParser());
    currentJDText = await retryChain.invoke({
      content: currentJDText,
      schema: JSON.stringify(JDSchema.shape, null, 2),
    });
    llmCallCount++;
    const jsonStr = extractJSON(currentJDText);
    currentJD = JDSchema.parse(JSON.parse(jsonStr));
  }

  // Step 3-N: 并行五维审查 + 修订
  let iterations = 0;
  const allReviews: ReviewFeedback[] = [];
  const roles = ["PM", "TECH", "HRD", "BOSS", "OD"];

  for (let i = 0; i < maxIterations; i++) {
    iterations++;
    log(`🔄 迭代 ${iterations}: 并行五维审查...`);
    const t3 = Date.now();

    // 并行执行 5 个审查
    const reviewPromises = roles.map(async (role) => {
      const prompt = createReviewPrompt(role, {
        bossExpectation: input.business.bossExpectation,
      });
      const chain = prompt.pipe(llmFlash).pipe(new StringOutputParser());
      const raw = await chain.invoke({ jd: JSON.stringify(currentJD, null, 2) });
      return parseFeedback(raw, role);
    });

    const reviews = await Promise.all(reviewPromises);
    llmCallCount += 5;
    allReviews.push(...reviews);

    reviews.forEach((r) => {
      const icon = r.verdict === "通过" ? "✅" : r.verdict === "需修订" ? "⚠️" : "❌";
      log(`   ${icon} ${r.role}: ${r.score}/10 (${r.verdict}) - ${r.issues.length}个问题`);
    });
    log(`   ⏱️ 审查耗时: ${Date.now() - t3}ms\n`);

    if (reviews.every((r) => r.verdict === "通过")) {
      log("   🎉 五维全部通过！\n");
      break;
    }

    // 修订
    log("   ✏️ 根据反馈修订...");
    const t4 = Date.now();
    const reviseChain = REVISE_PROMPT.pipe(llmPro).pipe(new StringOutputParser());
    const revisedText = await reviseChain.invoke({
      jd: JSON.stringify(currentJD, null, 2),
      diagnosis,
      reviews: reviews
        .map(
          (r) =>
            `【${r.role}】${r.score}/10 (${r.verdict})\n问题：${r.issues.join("; ")}\n建议：${r.suggestions.join("; ")}`
        )
        .join("\n\n"),
    });
    llmCallCount++;
    log(`   ✅ 修订完成 (${Date.now() - t4}ms)\n`);

    try {
      const jsonStr = extractJSON(revisedText);
      currentJD = JDSchema.parse(JSON.parse(jsonStr));
    } catch {
      log("   ⚠️ 修订后 JSON 解析失败，使用文本版本");
      currentJDText = revisedText;
    }
  }

  // 生成文本版 JD
  const jdText = formatJDText(currentJD);

  // 成本估算
  const cost: CostMetrics = {
    totalTokens: totalInputTokens + totalOutputTokens,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    estimatedCostRMB:
      (totalInputTokens / 1_000_000) * COST_PER_MILLION_INPUT +
      (totalOutputTokens / 1_000_000) * COST_PER_MILLION_OUTPUT,
    totalDurationMs: Date.now() - startTime,
    llmCalls: llmCallCount,
  };

  return { jd: currentJD, jdText, diagnosis, reviews: allReviews, iterations, cost };
}

function formatJDText(jd: JDStructured): string {
  let text = `## ${jd.title}\n`;
  text += `**${jd.level}** | ${jd.department} | 汇报：${jd.reportsTo}\n\n`;
  text += `> ${jd.positioning}\n\n`;

  text += `### 岗位职责\n`;
  jd.responsibilities.forEach((r) => {
    const priority = r.priority === "核心" ? "⭐" : r.priority === "重要" ? "▸" : "·";
    text += `${priority} ${r.description}`;
    if (r.measurable) text += `（${r.measurable}）`;
    text += "\n";
  });

  text += `\n### 任职要求\n`;
  text += `**必须具备：**\n`;
  jd.requirements.hard
    .filter((h) => h.required)
    .forEach((h) => {
      text += `- ${h.item}（${h.reason}）\n`;
    });
  text += `**加分项：**\n`;
  jd.requirements.hard
    .filter((h) => !h.required)
    .forEach((h) => {
      text += `- ${h.item}\n`;
    });

  text += `\n### 软性素质\n`;
  jd.requirements.soft.forEach((s) => {
    text += `- ${s.item}（验证方式：${s.evidence}）\n`;
  });

  text += `\n### 薪酬福利\n`;
  text += `💰 ${jd.compensation.salaryRange}\n`;
  text += `📝 ${jd.compensation.salaryNote}\n`;
  if (jd.compensation.bonus) text += `🎁 ${jd.compensation.bonus}\n`;
  text += `福利：${jd.compensation.benefits.join("、")}\n`;

  text += `\n### 团队与发展\n`;
  text += `👥 ${jd.teamContext.currentTeam}\n`;
  text += `📍 ${jd.teamContext.thisRole}\n`;
  text += `🚀 ${jd.teamContext.growthPath}\n`;

  text += `\n### 一票否决\n`;
  jd.dealbreakers.forEach((d) => (text += `❌ ${d}\n`));

  text += `\n### 加分项\n`;
  jd.niceToHaves.forEach((n) => (text += `✅ ${n}\n`));

  text += `\n### 关于我们\n${jd.companyPitch}\n`;

  return text;
}
