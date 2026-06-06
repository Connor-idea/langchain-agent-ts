/**
 * JD 生成器 — 三角色自批评架构
 *
 * 流程：需求输入 → 初稿生成 → PM审查 → 技术审查 → HRD审查 → 修订 → 最终JD
 *
 * 设计原则：
 * - Harness 架构：代码控制流程，LLM 只负责内容生成
 * - 三角色自批评：PM/技术/HRD 各自从不同视角审查
 * - 数据驱动：内置行业基准 + 可选搜索补充
 */
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { z } from "zod";
import { config } from "../config.js";

// ========== 类型定义 ==========

export interface JobRequirement {
  /** 岗位名称 */
  title: string;
  /** 部门 */
  department: string;
  /** 汇报对象 */
  reportsTo: string;
  /** 用人部门描述的原始需求（口语化） */
  rawNeed: string;
  /** 预算范围（可选） */
  budget?: { min: number; max: number };
  /** 紧急程度 */
  urgency: "紧急" | "常规" | "储备";
  /** 补充信息 */
  extras?: string;
}

export interface ReviewFeedback {
  role: string;
  perspective: string;
  issues: string[];
  suggestions: string[];
  score: number; // 1-10
  verdict: "通过" | "需修订" | "重大问题";
}

export interface JDResult {
  /** 最终 JD 文本 */
  jd: string;
  /** 三角色审查反馈 */
  reviews: ReviewFeedback[];
  /** 迭代次数 */
  iterations: number;
  /** 总 token 消耗 */
  totalTokens: number;
}

// ========== LLM 工厂 ==========

function createLLM(temperature = 0.7) {
  return new ChatOpenAI({
    apiKey: config.deepseek.apiKey,
    model: config.deepseek.model,
    temperature,
    configuration: { baseURL: config.deepseek.baseUrl },
  });
}

// ========== 行业基准数据（L1 内置） ==========

const INDUSTRY_BENCHMARKS: Record<string, object> = {
  "前端开发": {
    common_titles: ["前端开发工程师", "Web前端工程师", "FE Developer"],
    core_skills: ["React/Vue", "TypeScript", "CSS", "性能优化", "工程化"],
    salary_range: { junior: "8-15K", mid: "15-25K", senior: "25-40K" },
    market_demand: "高",
    turnover_rate: "中高",
  },
  "产品经理": {
    common_titles: ["产品经理", "高级产品经理", "Product Manager"],
    core_skills: ["需求分析", "数据分析", "项目管理", "用户研究", "商业思维"],
    salary_range: { junior: "10-18K", mid: "18-30K", senior: "30-50K" },
    market_demand: "高",
    turnover_rate: "中",
  },
  "销售": {
    common_titles: ["销售经理", "客户经理", "商务拓展"],
    core_skills: ["客户开发", "谈判", "CRM", "行业知识", "抗压能力"],
    salary_range: { junior: "6-10K+提成", mid: "10-15K+提成", senior: "15-25K+提成" },
    market_demand: "持续",
    turnover_rate: "高",
  },
};

// ========== Prompt 模板 ==========

const JD_DRAFT_PROMPT = ChatPromptTemplate.fromMessages([
  [
    "system",
    `你是一个资深 HR 专家，擅长撰写高质量的职位描述（JD）。

你的任务：根据用人部门的需求，生成一份专业、准确、有吸引力的 JD。

**JD 结构要求：**
1. 岗位名称（准确、市场通用）
2. 部门与汇报关系
3. 岗位职责（5-8 条，具体可衡量）
4. 任职要求（分硬性条件和软性素质）
5. 薪酬福利（如有信息）
6. 公司/团队介绍（如有信息）

**关键原则：**
- 拒绝表面术语包装，每一条都要有实际意义
- 职责要具体，不要"完成领导交办的其他任务"
- 要求要合理，不要"精通一切"
- 语言要专业但不官僚

行业参考数据：
{benchmark}`,
  ],
  [
    "human",
    `岗位：{title}
部门：{department}
汇报对象：{reportsTo}
用人部门原始需求：{rawNeed}
预算：{budget}
紧急程度：{urgency}
补充信息：{extras}

请生成 JD 初稿：`,
  ],
]);

const REVIEW_PROMPTS: Record<string, { system: string; focus: string }> = {
  PM: {
    system: `你是产品总监，从**业务价值和团队协作**角度审查 JD。
关注点：
- 这个岗位对业务的实际贡献是什么？
- 职责是否和团队其他角色有重叠或空白？
- 要求是否过高/过低？
- 招这个人能解决什么业务问题？`,
    focus: "业务价值、团队协作、职责合理性",
  },
  TECH: {
    system: `你是技术总监，从**技术能力和团队技术栈**角度审查 JD。
关注点：
- 技术要求是否准确、不过时？
- 技能组合是否合理（不要求全栈但啥都不精）？
- 和团队现有技术栈是否匹配？
- 能力层级是否和薪酬匹配？`,
    focus: "技术准确性、技能组合、层级匹配",
  },
  HRD: {
    system: `你是 HRD，从**招聘可行性和市场竞争力**角度审查 JD。
关注点：
- 这样的 JD 能不能招到人？
- 薪酬在市场上有没有竞争力？
- 要求和预算是否匹配？
- 有没有隐性歧视或合规风险？
- JD 的吸引力如何？`,
    focus: "招聘可行性、市场竞争力、合规性",
  },
};

function createReviewPrompt(role: string) {
  const cfg = REVIEW_PROMPTS[role];
  return ChatPromptTemplate.fromMessages([
    ["system", cfg.system],
    [
      "human",
      `请审查以下 JD，从 ${cfg.focus} 角度给出意见。

**评分标准：**
- 1-3分：重大问题，必须重写
- 4-6分：有明显问题，需要修订
- 7-8分：基本合格，小修即可
- 9-10分：优秀

**输出格式（严格遵守）：**
问题列表：（每行一个，用 - 开头）
改进建议：（每行一个，用 - 开头）
评分：X/10
结论：通过/需修订/重大问题

---

待审查的 JD：

{jd}`,
    ],
  ]);
}

const REVISE_PROMPT = ChatPromptTemplate.fromMessages([
  [
    "system",
    `你是一个资深 HR 专家，根据三位审查者的反馈修订 JD。

修订原则：
- 认真对待每一条反馈，但不要盲目接受
- 如果反馈之间有冲突，以业务价值为优先
- 保持 JD 的专业性和可读性
- 不要因为修订而变得过度保守（写成"有相关经验者优先"这样什么都不要求的 JD）`,
  ],
  [
    "human",
    `原始 JD：
{jd}

PM 审查反馈：
{pm_feedback}

技术审查反馈：
{tech_feedback}

HRD 审查反馈：
{hrd_feedback}

请根据以上反馈修订 JD，输出修订后的完整 JD：`,
  ],
]);

// ========== 核心流程 ==========

function parseReviewFeedback(raw: string, role: string): ReviewFeedback {
  const lines = raw.split("\n").filter((l) => l.trim());

  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 5;
  let verdict: ReviewFeedback["verdict"] = "需修订";

  let section = "";
  for (const line of lines) {
    if (line.includes("问题列表") || line.includes("问题：")) section = "issues";
    else if (line.includes("改进建议") || line.includes("建议："))
      section = "suggestions";
    else if (line.includes("评分")) {
      const m = line.match(/(\d+)/);
      if (m) score = parseInt(m[1]);
    } else if (line.includes("结论")) {
      if (line.includes("通过")) verdict = "通过";
      else if (line.includes("重大")) verdict = "重大问题";
      else verdict = "需修订";
    } else if (line.startsWith("-") || line.startsWith("·")) {
      const text = line.replace(/^[-·]\s*/, "").trim();
      if (section === "issues") issues.push(text);
      else if (section === "suggestions") suggestions.push(text);
    }
  }

  return {
    role,
    perspective: REVIEW_PROMPTS[role].focus,
    issues,
    suggestions,
    score,
    verdict,
  };
}

export async function generateJD(
  requirement: JobRequirement,
  options: { maxIterations?: number; onProgress?: (msg: string) => void } = {}
): Promise<JDResult> {
  const { maxIterations = 2, onProgress } = options;
  const log = onProgress || console.log;
  let totalTokens = 0;

  const llm = createLLM(0.7);
  const llmLow = createLLM(0.3); // 审查用低温度

  // 获取行业基准
  const benchmark =
    INDUSTRY_BENCHMARKS[requirement.title] ||
    INDUSTRY_BENCHMARKS[requirement.department] ||
    { note: "无内置基准，请根据市场情况判断" };

  // Step 1: 生成 JD 初稿
  log("📝 Step 1: 生成 JD 初稿...");
  const draftChain = JD_DRAFT_PROMPT.pipe(llm).pipe(new StringOutputParser());
  let currentJD = await draftChain.invoke({
    title: requirement.title,
    department: requirement.department,
    reportsTo: requirement.reportsTo,
    rawNeed: requirement.rawNeed,
    budget: requirement.budget
      ? `${requirement.budget.min}-${requirement.budget.max}K`
      : "未定",
    urgency: requirement.urgency,
    extras: requirement.extras || "无",
    benchmark: JSON.stringify(benchmark, null, 2),
  });
  log(`   ✅ 初稿生成完成 (${currentJD.length} 字)\n`);

  // Step 2-N: 三角色审查 + 修订循环
  let iterations = 0;
  const allReviews: ReviewFeedback[] = [];

  for (let i = 0; i < maxIterations; i++) {
    iterations++;
    log(`🔄 迭代 ${iterations}: 三角色审查...`);

    const reviews: ReviewFeedback[] = [];

    // 并行执行三个角色的审查
    for (const role of ["PM", "TECH", "HRD"]) {
      const reviewPrompt = createReviewPrompt(role);
      const reviewChain = reviewPrompt
        .pipe(llmLow)
        .pipe(new StringOutputParser());
      const rawReview = await reviewChain.invoke({ jd: currentJD });
      const feedback = parseReviewFeedback(rawReview, role);
      reviews.push(feedback);

      const icon =
        feedback.verdict === "通过"
          ? "✅"
          : feedback.verdict === "需修订"
            ? "⚠️"
            : "❌";
      log(
        `   ${icon} ${role}: ${feedback.score}/10 (${feedback.verdict}) - ${feedback.issues.length} 个问题`
      );
    }

    allReviews.push(...reviews);

    // 检查是否全部通过
    const allPassed = reviews.every((r) => r.verdict === "通过");
    if (allPassed) {
      log("   🎉 三角色全部通过！\n");
      break;
    }

    // 修订
    log("   ✏️ 根据反馈修订...");
    const reviseChain = REVISE_PROMPT.pipe(llm).pipe(new StringOutputParser());
    currentJD = await reviseChain.invoke({
      jd: currentJD,
      pm_feedback: reviews
        .filter((r) => r.role === "PM")
        .map(
          (r) =>
            `问题：${r.issues.join("; ")}\n建议：${r.suggestions.join("; ")}\n评分：${r.score}/10`
        )
        .join("\n"),
      tech_feedback: reviews
        .filter((r) => r.role === "TECH")
        .map(
          (r) =>
            `问题：${r.issues.join("; ")}\n建议：${r.suggestions.join("; ")}\n评分：${r.score}/10`
        )
        .join("\n"),
      hrd_feedback: reviews
        .filter((r) => r.role === "HRD")
        .map(
          (r) =>
            `问题：${r.issues.join("; ")}\n建议：${r.suggestions.join("; ")}\n评分：${r.score}/10`
        )
        .join("\n"),
    });
    log(`   ✅ 修订完成 (${currentJD.length} 字)\n`);
  }

  return {
    jd: currentJD,
    reviews: allReviews,
    iterations,
    totalTokens,
  };
}
