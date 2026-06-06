/**
 * 需求访谈 Agent
 *
 * 目标：引导用人部门把模糊需求说清楚
 *
 * 流程：
 * 1. 分析现有输入，识别缺失维度
 * 2. 按优先级生成访谈问题
 * 3. 交互式访谈（可多轮）
 * 4. 输出结构化需求文档
 *
 * 设计原则：
 * - 不是填表，是对话——用人部门经理不会填表
 * - 问题要具体、有选项——"你希望他前 3 个月做什么？" 而不是 "请描述岗位职责"
 * - 逐步深入——先问最关键的，再补充细节
 * - 支持跳过——不是每个问题都必须回答
 */
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { z } from "zod";
import { config } from "../config.js";
import { evaluateContext, formatEvaluation, type ContextEvaluation } from "./context-evaluator.js";

// ========== 类型 ==========

export interface InterviewInput {
  /** 用人部门经理的原始描述 */
  rawDescription: string;
  /** 已知信息（可选） */
  knownInfo?: {
    title?: string;
    department?: string;
    budget?: { min: number; max: number };
    urgency?: "紧急" | "常规" | "储备";
    teamSize?: number;
    industry?: string;
  };
}

export interface InterviewQuestion {
  id: string;
  dimension: string;
  priority: "高" | "中" | "低";
  question: string;
  hint: string;
  options?: string[];
  followUp?: string;
}

export interface InterviewAnswer {
  questionId: string;
  answer: string;
}

export interface StructuredRequirement {
  /** 岗位基本信息 */
  position: {
    title: string;
    department: string;
    reportsTo: string;
    level: string;
  };
  /** 业务背景 */
  business: {
    whyHire: string;
    businessGoals: string[];
    painPoints: string[];
    bossExpectation: string;
  };
  /** 岗位详情 */
  job: {
    firstQuarterTasks: string[];
    successMetrics: string[];
    workDistribution: string;
    decisionScope: string;
    dealbreakers: string[];
    previousHolder: string;
  };
  /** 团队情况 */
  team: {
    currentMembers: string[];
    skillGaps: string[];
    managementStyle: string;
    collaboration: string;
    growthPath: string;
  };
  /** 市场信息 */
  market: {
    salaryRange: { min: number; max: number };
    supply: string;
    competitorNotes: string;
    hotSkills: string[];
  };
  /** 候选人画像 */
  candidate: {
    targetProfile: string;
    motivation: string;
    decisionFactors: string[];
    channels: string[];
  };
  /** 约束条件 */
  constraints: {
    location: string;
    remote: string;
    headcount: number;
    startDate: string;
    budgetFlexibility: string;
  };
  /** 评估结果 */
  evaluation: ContextEvaluation;
}

// ========== LLM ==========

function createLLM(tier: "flash" | "pro" = "flash", temp = 0.7) {
  return new ChatOpenAI({
    apiKey: config.deepseek.apiKey,
    model: config.deepseek.models[tier],
    temperature: temp,
    maxTokens: tier === "pro" ? 4000 : 2000,
    configuration: { baseURL: config.deepseek.baseUrl },
  });
}

// ========== 问题库 ==========

const QUESTION_TEMPLATES: Record<string, InterviewQuestion[]> = {
  岗位维度: [
    {
      id: "first_quarter",
      dimension: "岗位维度",
      priority: "高",
      question: "这个人来了之后，前 3 个月你希望 TA 完成什么？",
      hint: "比如：搭建XX系统、完成XX模块上线、建立XX流程",
      options: [
        "从 0 到 1 搭建某个系统/模块",
        "接手并优化现有项目",
        "完成某个具体项目/功能",
        "建立团队的技术规范/流程",
        "其他（请描述）",
      ],
    },
    {
      id: "success_metrics",
      dimension: "岗位维度",
      priority: "高",
      question: "怎么衡量这个人干得好不好？你最看重什么指标？",
      hint: "比如：上线时间、代码质量、用户满意度、业务数据",
      options: [
        "按时交付（项目管理能力）",
        "质量指标（Bug率、代码质量）",
        "业务指标（用户增长、转化率）",
        "团队指标（带人能力、知识分享）",
        "其他（请描述）",
      ],
    },
    {
      id: "work_distribution",
      dimension: "岗位维度",
      priority: "中",
      question: "这个人的日常工作大概是什么比例？",
      hint: "比如：70% 写代码 + 20% 开会沟通 + 10% 学习调研",
      options: [
        "主要是执行（80%+ 做具体的事）",
        "执行为主，兼顾协调（60% 执行 + 30% 沟通 + 10% 规划）",
        "均衡型（各占 1/3）",
        "管理为主（40% 管理 + 40% 技术 + 20% 沟通）",
        "其他（请描述）",
      ],
    },
    {
      id: "decision_scope",
      dimension: "岗位维度",
      priority: "中",
      question: "这个人能自己决定什么？什么事需要向上请示？",
      hint: "比如：技术选型可以自己定，但预算超 5 万需要审批",
    },
    {
      id: "dealbreakers",
      dimension: "岗位维度",
      priority: "高",
      question: "有什么情况是你绝对不会考虑的？（一票否决项）",
      hint: "比如：频繁跳槽（2年换3份工作）、没有相关行业经验、不能接受加班",
      options: [
        "频繁跳槽",
        "没有相关技术/行业经验",
        "沟通能力差",
        "不能接受出差/加班",
        "其他（请描述）",
      ],
    },
    {
      id: "previous_holder",
      dimension: "岗位维度",
      priority: "低",
      question: "这个岗位之前有人做过吗？如果有，TA 离开的原因是什么？",
      hint: "如果是新岗位就说新岗位。如果有人离开，说说原因能帮我们避免同样的问题。",
    },
  ],
  市场维度: [
    {
      id: "salary_range",
      dimension: "市场维度",
      priority: "高",
      question: "这个岗位的薪资预算大概是多少？",
      hint: "给一个范围就行，比如 15-25K/月。如果不确定，我可以帮你查市场行情。",
      options: [
        "8K 以下",
        "8-15K",
        "15-25K",
        "25-40K",
        "40K 以上",
        "不确定，需要参考市场",
      ],
    },
    {
      id: "supply_awareness",
      dimension: "市场维度",
      priority: "中",
      question: "你觉得这类人才在市场上好招吗？",
      hint: "如果之前招过类似岗位，说说当时的情况。",
      options: [
        "很好招，投简历的人很多",
        "一般，需要主动搜索",
        "比较难招，需要花时间",
        "非常难招，是稀缺人才",
        "不清楚，没招过",
      ],
    },
  ],
  候选人维度: [
    {
      id: "target_profile",
      dimension: "候选人维度",
      priority: "中",
      question: "你理想中的候选人现在可能在哪里工作？什么样的背景？",
      hint: "比如：在同行业公司做了 2-3 年、在大厂做过类似项目、刚从某类公司出来",
    },
    {
      id: "motivation",
      dimension: "候选人维度",
      priority: "中",
      question: "你觉得这类人为什么会想换工作？什么能吸引 TA 来我们这里？",
      hint: "比如：技术成长空间、业务前景、团队氛围、薪酬涨幅",
      options: [
        "技术成长（想用新技术/做更有挑战的项目）",
        "业务前景（看好行业/公司发展）",
        "管理机会（想带团队/有更大决策权）",
        "薪酬涨幅（给更高的薪资）",
        "工作生活平衡（更好的工作环境）",
        "其他（请描述）",
      ],
    },
    {
      id: "channels",
      dimension: "候选人维度",
      priority: "低",
      question: "你觉得这类人会在哪里看工作机会？",
      hint: "帮助我们选择最有效的招聘渠道。",
      options: [
        "BOSS直聘",
        "猎聘",
        "脉脉",
        "拉勾",
        "GitHub/技术社区",
        "内推",
        "猎头",
        "其他",
      ],
    },
  ],
  约束维度: [
    {
      id: "location",
      dimension: "约束维度",
      priority: "高",
      question: "工作地点在哪？支持远程吗？",
      hint: "比如：深圳南山、每周可远程 2 天、完全远程、必须驻场",
    },
    {
      id: "headcount",
      dimension: "约束维度",
      priority: "中",
      question: "这次招几个人？",
      hint: "1 个还是多个？",
    },
    {
      id: "hard_requirements",
      dimension: "约束维度",
      priority: "中",
      question: "有没有硬性的门槛条件？",
      hint: "比如：必须本科以上、必须有某证书、必须有 N 年以上经验",
      options: [
        "学历要求（本科/硕士）",
        "经验年限（N 年以上）",
        "特定证书/资质",
        "行业背景",
        "年龄范围",
        "没有硬性要求",
      ],
    },
  ],
};

// ========== 核心逻辑 ==========

/**
 * 分析现有输入，生成访谈问题
 */
export function generateInterviewQuestions(input: InterviewInput): InterviewQuestion[] {
  // 构造评估输入
  const evalInput = {
    requirement: {
      title: input.knownInfo?.title || "",
      rawNeed: input.rawDescription,
      budget: input.knownInfo?.budget,
      urgency: input.knownInfo?.urgency,
    },
    department: {},
    business: {},
  };

  const evaluation = evaluateContext(evalInput);

  // 找出缺失的维度，按权重排序
  const weakDimensions = evaluation.dimensions
    .filter((d) => d.actualScore / d.maxScore < 0.5)
    .sort((a, b) => b.weight - a.weight);

  const questions: InterviewQuestion[] = [];

  for (const dim of weakDimensions) {
    const templateQuestions = QUESTION_TEMPLATES[dim.dimension] || [];
    for (const q of templateQuestions) {
      // 只问缺失的问题
      const isAlreadyAnswered = dim.checks.some(
        (c) => c.passed && c.item.includes(q.id.replace(/_/g, ""))
      );
      if (!isAlreadyAnswered) {
        questions.push(q);
      }
    }
  }

  // 按优先级排序：高 > 中 > 低
  const priorityOrder = { 高: 0, 中: 1, 低: 2 };
  questions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return questions;
}

/**
 * 生成访谈开场白
 */
export function generateInterviewOpening(input: InterviewInput): string {
  const title = input.knownInfo?.title || "这个岗位";
  return `好的，我来帮你梳理一下${title}的招聘需求。

为了生成一份高质量的 JD，我需要了解一些信息。我会按重要性排序来问，你可以随时跳过不想回答的问题。

先从最关键的开始：
`;
}

/**
 * 根据用户回答，生成追问或下一个问题
 */
export async function generateFollowUp(
  currentQuestion: InterviewQuestion,
  userAnswer: string,
  allAnswers: InterviewAnswer[],
  remainingQuestions: InterviewQuestion[]
): Promise<{
  followUp: string | null;
  nextQuestion: InterviewQuestion | null;
  isComplete: boolean;
}> {
  const llm = createLLM("flash", 0.7);

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `你是一个资深 HR 需求访谈专家。你在和用人部门经理对话，收集招聘需求。

当前问题：{question}
用户回答：{answer}

你的任务：
1. 判断回答是否足够清晰和完整
2. 如果不够清晰，生成一个简短的追问（不超过 2 句话）
3. 如果够清晰，返回 null（不需要追问）

追问原则：
- 不要重复问已经回答过的内容
- 追问要具体，比如"你提到XX，能再具体说说吗？"
- 语气要自然，像聊天不像填表
- 如果回答是"不确定"或"没想过"，可以给建议选项

只输出追问内容，不需要追问就输出 "null"`,
    ],
    ["human", "问题：{question}\n提示：{hint}\n用户回答：{answer}"],
  ]);

  const chain = prompt.pipe(llm).pipe(new StringOutputParser());
  const followUp = await chain.invoke({
    question: currentQuestion.question,
    hint: currentQuestion.hint,
    answer: userAnswer,
  });

  const cleanFollowUp = followUp.trim().toLowerCase() === "null" ? null : followUp.trim();

  // 下一个问题
  const nextQuestion = remainingQuestions.length > 0 ? remainingQuestions[0] : null;
  const isComplete = remainingQuestions.length === 0 && !cleanFollowUp;

  return { followUp: cleanFollowUp, nextQuestion, isComplete };
}

/**
 * 将访谈结果整理为结构化需求
 */
export async function structureRequirement(
  input: InterviewInput,
  answers: InterviewAnswer[]
): Promise<StructuredRequirement> {
  const llm = createLLM("pro", 0.3);

  const answerText = answers.map((a) => `Q: ${a.questionId}\nA: ${a.answer}`).join("\n\n");

  const systemMsg = "你是一个资深HR专家。将访谈记录整理为结构化的招聘需求文档。输出严格JSON，包含以下顶级字段：position, business, job, team, market, candidate, constraints。每个字段下有子字段。缺失字段写待确认。只输出JSON。";
  const humanMsg = "原始描述：" + input.rawDescription + "\n已知信息：" + JSON.stringify(input.knownInfo || {}) + "\n访谈记录：" + answerText + "\n\n输出结构化需求JSON：";

  const result = await llm.invoke([
    ["system", systemMsg],
    ["human", humanMsg],
  ]).then(r => typeof r.content === 'string' ? r.content : JSON.stringify(r.content));

  // 解析 JSON
  try {
    const jsonStr = result.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
    const start = jsonStr.indexOf("{");
    const end = jsonStr.lastIndexOf("}");
    const parsed = JSON.parse(jsonStr.substring(start, end + 1));

    // 评估完整性
    const evaluation = evaluateContext({
      requirement: { ...parsed.position, rawNeed: input.rawDescription, budget: parsed.market?.salaryRange },
      department: parsed.team,
      business: { ...parsed.business, budgetConstraint: parsed.constraints?.budgetFlexibility },
    });

    return { ...parsed, evaluation };
  } catch {
    throw new Error("结构化失败，访谈结果可能不够完整");
  }
}
