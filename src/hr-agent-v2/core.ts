/**
 * HR Agent V2 - 核心模块
 */

import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { config } from "../config.js";

// ========== 类型定义 ==========

export interface ParsedRequirement {
  jobTitle: string;
  jobCategory: string;
  jobLevel: string;
  companyName?: string;
  businessType: string;
  industry: string;
  stage?: string;
  requirements: string[];
  responsibilities: string[];
  niceToHave: string[];
  salaryRange?: string;
  location: string;
  urgency: string;
  rawInput: string;
}

export interface GeneratedJD {
  title: string;
  companyIntro: string;
  responsibilities: string[];
  requirements: string[];
  niceToHave: string[];
  salary: string;
  benefits: string[];
  workEnvironment: string;
  applyMethod: string;
}

export interface HiringAdvice {
  salaryBenchmark: { min: number; max: number; median: number; source: string };
  channels: { name: string; reason: string; priority: number }[];
  candidateProfile: { ideal: string; realistic: string; redFlags: string[]; greenFlags: string[] };
  interviewTips: { questions: string[]; evaluation: string[] };
}

// ========== LLM 配置 ==========

function createLLM(temperature = 0.7) {
  return new ChatOpenAI({
    model: config.deepseek.models.pro,
    apiKey: config.deepseek.apiKey,
    configuration: { baseURL: config.deepseek.baseUrl },
    temperature,
    maxTokens: 2000,
  });
}

// ========== 核心函数 ==========

export async function parseRequirement(input: string): Promise<ParsedRequirement> {
  const llm = createLLM(0.3);
  
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", `你是一个招聘需求解析专家。从用户的口语化描述中提取结构化的招聘信息。

输出格式（严格JSON）：
{{
  "jobTitle": "岗位名称",
  "jobCategory": "岗位类别（餐饮/技术/销售/财务/设计/运营/教育/医疗/制造/物流/其他）",
  "jobLevel": "级别（初级/中级/高级）",
  "companyName": "公司名称（如有）",
  "businessType": "业务类型（个体户/创业公司/中小企业/大企业/政府机构）",
  "industry": "行业",
  "stage": "发展阶段（如有）",
  "requirements": ["具体要求1", "具体要求2"],
  "responsibilities": ["工作职责1", "工作职责2"],
  "niceToHave": ["加分项1", "加分项2"],
  "salaryRange": "薪资范围（如有）",
  "location": "工作地点",
  "urgency": "紧急程度（紧急/常规/储备）"
}}

注意：
- 从口语中提取关键信息，不要遗漏
- 如果信息缺失，用 null 表示
- 岗位名称要准确，不要把"招聘"当作岗位
- 行业要具体，不要用"互联网"这种泛称`],
    ["human", "{input}"]
  ]);
  
  const chain = prompt.pipe(llm).pipe(new StringOutputParser());
  const result = await chain.invoke({ input });
  
  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return { ...parsed, rawInput: input };
    }
  } catch (e) {
    console.log("⚠️ JSON 解析失败，使用默认值");
  }
  
  return {
    jobTitle: "岗位", jobCategory: "其他", jobLevel: "中级",
    businessType: "未知", industry: "未知", requirements: [],
    responsibilities: [], niceToHave: [], location: "上海",
    urgency: "常规", rawInput: input,
  };
}

export async function generateJD(requirement: ParsedRequirement): Promise<GeneratedJD> {
  const llm = createLLM(0.7);
  
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", `你是一个专业的 JD 撰写专家。根据招聘需求生成一份专业、真实、有吸引力的职位描述。

要求：
1. 语言要专业但不生硬
2. 职责要具体、可衡量
3. 要求要合理，不要过度要求
4. 薪资要符合市场水平
5. 要体现公司特色和岗位吸引力

输出格式（严格JSON）：
{{
  "title": "岗位名称",
  "companyIntro": "公司简介（50-100字）",
  "responsibilities": ["职责1", "职责2"],
  "requirements": ["要求1", "要求2"],
  "niceToHave": ["加分项1", "加分项2"],
  "salary": "薪资范围",
  "benefits": ["福利1", "福利2"],
  "workEnvironment": "工作环境描述",
  "applyMethod": "投递方式"
}}`],
    ["human", `请为以下招聘需求生成 JD：

岗位：{jobTitle}
类别：{jobCategory}
级别：{jobLevel}
业务类型：{businessType}
行业：{industry}
具体要求：{requirements}
工作职责：{responsibilities}
薪资范围：{salaryRange}
工作地点：{location}

请生成一份专业、真实、有吸引力的 JD。`]
  ]);
  
  const chain = prompt.pipe(llm).pipe(new StringOutputParser());
  
  const result = await chain.invoke({
    jobTitle: requirement.jobTitle,
    jobCategory: requirement.jobCategory,
    jobLevel: requirement.jobLevel,
    businessType: requirement.businessType,
    industry: requirement.industry,
    requirements: (requirement.requirements || []).join("、") || "待补充",
    responsibilities: (requirement.responsibilities || []).join("、") || "待补充",
    salaryRange: requirement.salaryRange || "面议",
    location: requirement.location,
  });
  
  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.log("⚠️ JD JSON 解析失败");
  }
  
  return {
    title: requirement.jobTitle,
    companyIntro: `${requirement.businessType}，${requirement.industry}行业`,
    responsibilities: (requirement.responsibilities || []).length > 0 ? requirement.responsibilities : ["待补充"],
    requirements: (requirement.requirements || []).length > 0 ? requirement.requirements : ["待补充"],
    niceToHave: requirement.niceToHave || [],
    salary: requirement.salaryRange || "面议",
    benefits: ["五险一金", "带薪年假"],
    workEnvironment: "良好的工作环境",
    applyMethod: "请将简历发送至 hr@company.com",
  };
}

export async function generateHiringAdvice(requirement: ParsedRequirement): Promise<HiringAdvice> {
  const llm = createLLM(0.7);
  
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", `你是一个资深招聘顾问。根据招聘需求提供专业的招聘建议。

输出格式（严格JSON）：
{{
  "salaryBenchmark": {{
    "min": 最低薪资,
    "max": 最高薪资,
    "median": 中位数薪资,
    "source": "数据来源"
  }},
  "channels": [
    {{
      "name": "渠道名称",
      "reason": "推荐原因",
      "priority": 优先级(1-5)
    }}
  ],
  "candidateProfile": {{
    "ideal": "理想候选人描述",
    "realistic": "现实候选人描述",
    "redFlags": ["危险信号1", "危险信号2"],
    "greenFlags": ["积极信号1", "积极信号2"]
  }},
  "interviewTips": {{
    "questions": ["推荐问题1", "推荐问题2"],
    "evaluation": ["评估要点1", "评估要点2"]
  }}
}}`],
    ["human", `请为以下招聘需求提供专业建议：

岗位：{jobTitle}
类别：{jobCategory}
级别：{jobLevel}
业务类型：{businessType}
行业：{industry}
具体要求：{requirements}
工作地点：{location}

请提供薪资参考、招聘渠道、候选人画像和面试建议。`]
  ]);
  
  const chain = prompt.pipe(llm).pipe(new StringOutputParser());
  
  const result = await chain.invoke({
    jobTitle: requirement.jobTitle,
    jobCategory: requirement.jobCategory,
    jobLevel: requirement.jobLevel,
    businessType: requirement.businessType,
    industry: requirement.industry,
    requirements: requirement.requirements.join("、") || "待补充",
    location: requirement.location,
  });
  
  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.log("⚠️ 建议 JSON 解析失败");
  }
  
  return {
    salaryBenchmark: { min: 0, max: 0, median: 0, source: "暂无数据" },
    channels: [
      { name: "BOSS直聘", reason: "覆盖面广", priority: 5 },
      { name: "脉脉", reason: "社交招聘", priority: 4 },
      { name: "朋友内推", reason: "信任度高", priority: 3 },
    ],
    candidateProfile: { ideal: "暂无数据", realistic: "暂无数据", redFlags: [], greenFlags: [] },
    interviewTips: { questions: ["请介绍一下你的工作经验"], evaluation: ["关注专业技能和工作态度"] },
  };
}

// ========== 格式化输出 ==========

export function formatParsedRequirement(req: ParsedRequirement): string {
  const lines: string[] = [];
  lines.push("📋 需求解析结果");
  lines.push("─".repeat(40));
  lines.push(`岗位: ${req.jobTitle}`);
  lines.push(`类别: ${req.jobCategory}`);
  lines.push(`级别: ${req.jobLevel}`);
  lines.push(`业务: ${req.businessType} | ${req.industry}`);
  lines.push(`地点: ${req.location}`);
  lines.push(`紧急: ${req.urgency}`);
  
  if ((req.requirements || []).length > 0) {
    lines.push("\n具体要求:");
    (req.requirements || []).forEach(r => lines.push(`  • ${r}`));
  }
  
  if ((req.responsibilities || []).length > 0) {
    lines.push("\n工作职责:");
    (req.responsibilities || []).forEach(r => lines.push(`  • ${r}`));
  }
  
  return lines.join("\n");
}

export function formatJD(jd: GeneratedJD): string {
  const lines: string[] = [];
  lines.push(`\n${"═".repeat(50)}`);
  lines.push(`📝 ${jd.title}`);
  lines.push(`${"═".repeat(50)}\n`);
  
  lines.push("## 公司简介");
  lines.push(jd.companyIntro);
  lines.push("");
  
  lines.push("## 岗位职责");
  (jd.responsibilities || []).forEach((r, i) => lines.push(`${i + 1}. ${r}`));
  lines.push("");
  
  lines.push("## 任职要求");
  (jd.requirements || []).forEach((r, i) => lines.push(`${i + 1}. ${r}`));
  lines.push("");
  
  if ((jd.niceToHave || []).length > 0) {
    lines.push("## 加分项");
    (jd.niceToHave || []).forEach(r => lines.push(`• ${r}`));
    lines.push("");
  }
  
  lines.push("## 薪资福利");
  lines.push(`薪资: ${jd.salary || "面议"}`);
  lines.push("福利:");
  (jd.benefits || []).forEach(r => lines.push(`• ${r}`));
  lines.push("");
  
  lines.push("## 工作环境");
  lines.push(jd.workEnvironment || "良好的工作环境");
  lines.push("");
  
  lines.push("## 投递方式");
  lines.push(jd.applyMethod || "请将简历发送至 hr@company.com");
  
  return lines.join("\n");
}

export function formatHiringAdvice(advice: HiringAdvice): string {
  const lines: string[] = [];
  lines.push("\n💡 招聘建议");
  lines.push("─".repeat(40));
  
  if (advice.salaryBenchmark.median > 0) {
    lines.push("\n💰 薪资参考:");
    lines.push(`  范围: ${advice.salaryBenchmark.min}-${advice.salaryBenchmark.max}K`);
    lines.push(`  中位数: ${advice.salaryBenchmark.median}K`);
    lines.push(`  来源: ${advice.salaryBenchmark.source}`);
  }
  
  lines.push("\n📢 推聘渠道:");
  advice.channels
    .sort((a, b) => b.priority - a.priority)
    .forEach(c => lines.push(`  ${"⭐".repeat(c.priority)} ${c.name}: ${c.reason}`));
  
  lines.push("\n👤 候选人画像:");
  lines.push(`  理想: ${advice.candidateProfile.ideal}`);
  lines.push(`  现实: ${advice.candidateProfile.realistic}`);
  
  if (advice.candidateProfile.redFlags.length > 0) {
    lines.push("  ⚠️ 危险信号:");
    advice.candidateProfile.redFlags.forEach(f => lines.push(`    • ${f}`));
  }
  
  if (advice.candidateProfile.greenFlags.length > 0) {
    lines.push("  ✅ 积极信号:");
    advice.candidateProfile.greenFlags.forEach(f => lines.push(`    • ${f}`));
  }
  
  lines.push("\n🎤 面试建议:");
  lines.push("  推荐问题:");
  advice.interviewTips.questions.forEach(q => lines.push(`    • ${q}`));
  lines.push("  评估要点:");
  advice.interviewTips.evaluation.forEach(e => lines.push(`    • ${e}`));
  
  return lines.join("\n");
}
