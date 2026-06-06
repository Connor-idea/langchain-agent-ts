/**
 * JD 生成器 V2 — 多维评估体系
 *
 * 从"一个岗位的 JD"升级为"组织语境下的 JD"
 *
 * 新增维度：
 * 1. 用人部门画像（团队结构、文化、管理风格）
 * 2. 公司战略对齐（业务方向、增长阶段、老板期望）
 * 3. 人力结构分析（现有人员、技能缺口、协作模式）
 * 4. 市场可行性（人才供给、薪酬竞争力）
 *
 * 流程：需求收集 → 组织诊断 → JD 生成 → 多维审查 → 迭代修订
 */
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { z } from "zod";
import { config } from "../config.js";

// ========== 组织上下文类型 ==========

/** 用人部门画像 */
export interface DepartmentProfile {
  /** 部门名称 */
  name: string;
  /** 部门职能定位 */
  mission: string;
  /** 当前人员结构 */
  team: TeamMember[];
  /** 管理风格 */
  managementStyle: "扁平" | "层级" | "矩阵" | "项目制";
  /** 团队文化关键词 */
  culture: string[];
  /** 协作模式 */
  collaboration: string;
  /** 部门当前最大挑战 */
  topChallenge: string;
}

export interface TeamMember {
  role: string;
  level: "初级" | "中级" | "高级" | "专家";
  yearsOfExp: number;
  keySkills: string[];
  /** 是否可被替代 */
  replaceable: boolean;
}

/** 公司/老板视角 */
export interface BusinessContext {
  /** 公司名称 */
  companyName: string;
  /** 行业 */
  industry: string;
  /** 发展阶段 */
  stage: "初创" | "成长" | "成熟" | "转型";
  /** 老板/CEO 对这个岗位的期望 */
  bossExpectation: string;
  /** 业务战略方向 */
  strategy: string;
  /** 未来 12 个月的业务目标 */
  businessGoals: string[];
  /** 预算约束 */
  budgetConstraint: "宽松" | "适中" | "紧张";
  /** 用人的隐性要求（老板没明说但很在意的） */
  implicitRequirements?: string;
}

/** 招聘需求 */
export interface JobRequirementV2 {
  /** 岗位名称（初步） */
  title: string;
  /** 用人部门原始需求（口语化） */
  rawNeed: string;
  /** 薪资预算 */
  budget?: { min: number; max: number };
  /** 紧急程度 */
  urgency: "紧急" | "常规" | "储备";
  /** 补充信息 */
  extras?: string;
}

/** 完整输入 */
export interface JDDraftInput {
  requirement: JobRequirementV2;
  department: DepartmentProfile;
  business: BusinessContext;
}

/** 审查反馈 */
export interface ReviewFeedback {
  role: string;
  perspective: string;
  issues: string[];
  suggestions: string[];
  score: number;
  verdict: "通过" | "需修订" | "重大问题";
}

export interface JDResult {
  jd: string;
  diagnosis: string;
  reviews: ReviewFeedback[];
  iterations: number;
}

// ========== LLM ==========

function createLLM(temp = 0.7) {
  return new ChatOpenAI({
    apiKey: config.deepseek.apiKey,
    model: config.deepseek.model,
    temperature: temp,
    configuration: { baseURL: config.deepseek.baseUrl },
  });
}

// ========== Step 1: 组织诊断 ==========

const DIAGNOSIS_PROMPT = ChatPromptTemplate.fromMessages([
  [
    "system",
    `你是一个资深组织发展顾问（OD）。在生成 JD 之前，你需要先做组织诊断。

你的任务：分析用人部门的现状，找出这个岗位需要解决的**真正问题**。

诊断框架：
1. **团队缺口分析**：现有团队缺什么能力？这个人补的是哪个位置？
2. **协作关系图**：这个人进来后，和谁协作？上下游是谁？
3. **管理适配**：部门管理风格是什么样的？这个人需要什么样的自主性？
4. **成长路径**：这个人进来后 1 年、3 年的发展路径是什么？
5. **风险评估**：招这个人的最大风险是什么？（招不到/留不住/不匹配）

输出格式：
- 一段简洁的诊断结论（300-500字）
- 明确指出：这个人到底要解决什么问题，而不是"完成什么任务"`,
  ],
  [
    "human",
    `=== 用人部门画像 ===
部门：{department_name}
职能定位：{department_mission}
团队结构：
{team_structure}
管理风格：{management_style}
团队文化：{culture}
协作模式：{collaboration}
当前最大挑战：{topChallenge}

=== 公司/老板视角 ===
公司：{company_name}（{industry}，{stage}阶段）
老板对这个岗位的期望：{bossExpectation}
业务战略：{strategy}
未来12个月目标：{business_goals}
预算约束：{budget_constraint}
隐性要求：{implicit_requirements}

=== 招聘需求 ===
岗位：{title}
原始需求：{rawNeed}
预算：{budget}
紧急程度：{urgency}

请做组织诊断：`,
  ],
]);

// ========== Step 2: JD 生成（基于诊断） ==========

const JD_GENERATION_PROMPT = ChatPromptTemplate.fromMessages([
  [
    "system",
    `你是一个资深 HR 专家，擅长撰写高质量的职位描述（JD）。

你已经拿到了组织诊断结论。现在要基于诊断结果生成 JD。

**核心原则：**
- JD 不是"岗位说明书"，是"吸引对的人的营销文案"
- 每一条职责都要对应诊断中发现的真实问题
- 每一条要求都要有存在的理由（不要堆砌"精通XX"）
- 语言要专业但不官僚，具体但不琐碎

**JD 结构：**
1. 岗位名称（准确、市场通用、有吸引力）
2. 一句话定位（这个人在团队中的角色和价值）
3. 你将解决的核心问题（3-5个，来自诊断）
4. 我们期望你具备的（硬性条件 + 软性素质，每条有理由）
5. 我们提供的（薪酬 + 成长 + 团队，有吸引力但不吹）
6. 关于我们（简洁、真实、有差异化）`,
  ],
  [
    "human",
    `=== 组织诊断结论 ===
{diagnosis}

=== 补充信息 ===
薪酬预算：{budget}
团队文化关键词：{culture}
老板的隐性要求：{implicit_requirements}

请生成 JD：`,
  ],
]);

// ========== Step 3: 多维审查（5 个角色） ==========

const REVIEWERS: Record<
  string,
  { system: string; focus: string; lens: string }
> = {
  PM: {
    system: `你是产品总监。从**业务价值和团队协作**角度审查 JD。
你的团队和这个岗位紧密协作，你关心的是：
- 这个人能不能帮你把产品做好？
- 职责是否清晰，不会和你的团队职责冲突？
- 要求是否合理，不会招来眼高手低的人？`,
    focus: "业务价值、职责边界、产出质量",
    lens: "我能不能和这个人愉快合作？",
  },
  TECH: {
    system: `你是技术总监。从**技术能力和技术栈匹配**角度审查 JD。
你关心的是：
- 技术要求是否准确、不过时、不堆砌？
- 和团队现有技术栈是否匹配？
- 能力层级是否和薪酬匹配？`,
    focus: "技术准确性、技能组合、层级匹配",
    lens: "这个人能不能解决我们的技术问题？",
  },
  HRD: {
    system: `你是 HRD。从**招聘可行性和市场竞争力**角度审查 JD。
你关心的是：
- 这样的 JD 在市场上能不能招到人？
- 薪酬有没有竞争力？
- 有没有合规风险？
- 对目标候选人的吸引力如何？`,
    focus: "招聘可行性、市场竞争力、吸引力",
    lens: "这个 JD 能不能吸引到对的人？",
  },
  BOSS: {
    system: `你是 CEO/老板。从**战略对齐和投入产出**角度审查 JD。
你的期望是：{bossExpectation}
你关心的是：
- 这个人能不能推动业务目标达成？
- 投入（薪酬+管理成本）和产出是否匹配？
- 这个岗位是不是当前阶段最需要的？`,
    focus: "战略对齐、ROI、优先级",
    lens: "这个人值不值这个钱？",
  },
  OD: {
    system: `你是组织发展顾问（OD）。从**组织健康和人才梯队**角度审查 JD。
你关心的是：
- 这个人进来后，团队结构是否健康？
- 会不会造成人才冗余或断层？
- 和现有团队的能力互补性如何？
- 成长路径是否清晰？`,
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
      `你是${role}，你的审查视角是：${cfg.lens}

请审查以下 JD：

---
{jd}
---

**评分标准：**
- 1-3分：重大问题
- 4-6分：需修订
- 7-8分：基本合格
- 9-10分：优秀

**输出格式：**
问题列表：（每行一个，- 开头）
改进建议：（每行一个，- 开头）
评分：X/10
结论：通过/需修订/重大问题`,
    ],
  ]);
}

// ========== Step 4: 修订 ==========

const REVISE_PROMPT = ChatPromptTemplate.fromMessages([
  [
    "system",
    `你是资深 HR 专家。根据五位审查者的反馈修订 JD。

修订原则：
- BOSS 的战略对齐意见优先级最高
- OD 的组织健康意见优先级次之
- HRD 的市场可行性意见要认真对待
- PM 和 TECH 的具体意见酌情采纳
- 如果意见冲突，以"这个人能不能推动业务"为判断标准
- 不要因为修订而变得过度保守`,
  ],
  [
    "human",
    `原始 JD：
{jd}

组织诊断：
{diagnosis}

五维审查反馈：
{reviews}

请修订 JD，输出完整修订版：`,
  ],
]);

// ========== 解析审查反馈 ==========

function parseFeedback(raw: string, role: string): ReviewFeedback {
  const cfg = REVIEWERS[role];
  const lines = raw.split("\n").filter((l) => l.trim());
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 5;
  let verdict: ReviewFeedback["verdict"] = "需修订";
  let section = "";

  for (const line of lines) {
    if (line.includes("问题列表") || line.includes("问题：")) section = "issues";
    else if (line.includes("改进建议") || line.includes("建议：")) section = "suggestions";
    else if (line.includes("评分")) {
      const m = line.match(/(\d+)/);
      if (m) score = parseInt(m[1]);
    } else if (line.includes("结论")) {
      if (line.includes("重大")) verdict = "重大问题";
      else if (line.includes("通过") && !line.includes("需修订")) verdict = "通过";
      else verdict = "需修订";
    } else if (line.startsWith("-") || line.startsWith("·")) {
      const text = line.replace(/^[-·]\s*/, "").trim();
      if (section === "issues") issues.push(text);
      else suggestions.push(text);
    }
  }

  return { role, perspective: cfg.focus, issues, suggestions, score, verdict };
}

// ========== 主流程 ==========

export async function generateJDV2(
  input: JDDraftInput,
  options: { maxIterations?: number; onProgress?: (msg: string) => void } = {}
): Promise<JDResult> {
  const { maxIterations = 2, onProgress } = options;
  const log = onProgress || (() => {});
  const llm = createLLM(0.7);
  const llmLow = createLLM(0.3);

  // Step 1: 组织诊断
  log("🔍 Step 1: 组织诊断...");
  const diagChain = DIAGNOSIS_PROMPT.pipe(llm).pipe(new StringOutputParser());
  const diagnosis = await diagChain.invoke({
    department_name: input.department.name,
    department_mission: input.department.mission,
    team_structure: input.department.team
      .map((m) => `- ${m.role}（${m.level}，${m.yearsOfExp}年经验，技能：${m.keySkills.join("、")}）`)
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
  log(`   ✅ 诊断完成: ${diagnosis.substring(0, 100)}...\n`);

  // Step 2: 生成 JD
  log("📝 Step 2: 基于诊断生成 JD...");
  const jdChain = JD_GENERATION_PROMPT.pipe(llm).pipe(new StringOutputParser());
  let currentJD = await jdChain.invoke({
    diagnosis,
    budget: input.requirement.budget
      ? `${input.requirement.budget.min}-${input.requirement.budget.max}K`
      : "未定",
    culture: input.department.culture.join("、"),
    implicit_requirements: input.business.implicitRequirements || "无",
  });
  log(`   ✅ JD 初稿完成 (${currentJD.length} 字)\n`);

  // Step 3-N: 五维审查 + 修订
  let iterations = 0;
  const allReviews: ReviewFeedback[] = [];
  const roles = ["PM", "TECH", "HRD", "BOSS", "OD"];

  for (let i = 0; i < maxIterations; i++) {
    iterations++;
    log(`🔄 迭代 ${iterations}: 五维审查...`);

    const reviews: ReviewFeedback[] = [];
    for (const role of roles) {
      const prompt = createReviewPrompt(role, {
        bossExpectation: input.business.bossExpectation,
      });
      const chain = prompt.pipe(llmLow).pipe(new StringOutputParser());
      const raw = await chain.invoke({ jd: currentJD });
      const fb = parseFeedback(raw, role);
      reviews.push(fb);

      const icon = fb.verdict === "通过" ? "✅" : fb.verdict === "需修订" ? "⚠️" : "❌";
      log(`   ${icon} ${role}: ${fb.score}/10 (${fb.verdict}) - ${fb.issues.length}个问题`);
    }

    allReviews.push(...reviews);

    if (reviews.every((r) => r.verdict === "通过")) {
      log("   🎉 五维全部通过！\n");
      break;
    }

    log("   ✏️ 根据反馈修订...");
    const reviseChain = REVISE_PROMPT.pipe(llm).pipe(new StringOutputParser());
    currentJD = await reviseChain.invoke({
      jd: currentJD,
      diagnosis,
      reviews: reviews
        .map((r) => `【${r.role}】${r.score}/10 (${r.verdict})\n问题：${r.issues.join("; ")}\n建议：${r.suggestions.join("; ")}`)
        .join("\n\n"),
    });
    log(`   ✅ 修订完成 (${currentJD.length} 字)\n`);
  }

  return { jd: currentJD, diagnosis, reviews: allReviews, iterations };
}
