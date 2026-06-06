/**
 * Prompt 版本管理 + A/B 测试框架
 */

import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { config } from "../config.js";

// Prompt V1: 基础版
export const PROMPT_V1 = ChatPromptTemplate.fromMessages([
  ["system", "你是一位资深 HR 专家，擅长撰写高质量的职位描述（JD）。\n\n要求：\n1. JD 必须包含：岗位职责、任职要求、薪资福利、公司介绍\n2. 职责要具体、可衡量，不要空泛的描述\n3. 要求要合理，不要过度要求\n4. 薪资要符合市场水平\n5. 整体风格专业、真诚、有吸引力\n\n请直接输出完整的 JD。"],
  ["human", "请为以下岗位撰写 JD：\n\n岗位：{role}\n城市：{city}\n级别：{level}\n描述：{description}\n{context}\n\n请输出完整的 JD。"],
]);

// Prompt V2: 结构化版
export const PROMPT_V2 = ChatPromptTemplate.fromMessages([
  ["system", "你是一位资深 HR 专家，擅长撰写高质量的职位描述（JD）。\n\n## 输出格式要求\n请严格按照以下结构输出：\n\n1. 岗位标题：[级别][岗位名称]\n2. 公司简介（50-100字）\n3. 岗位职责（5-8条，每条以动词开头，有具体数字）\n4. 任职要求（分为必须和加分项）\n5. 薪资福利（明确薪资范围）\n6. 成长发展\n7. 投递方式\n\n## 质量标准\n- 总字数：800-1500字\n- 必须包含具体数字\n- 避免空泛描述\n- 专业、真诚、有吸引力"],
  ["human", "请为以下岗位撰写 JD：\n\n岗位：{role}\n城市：{city}\n级别：{level}\n描述：{description}\n\n补充信息：{context}\n\n请严格按照上述格式输出。"],
]);

// Prompt V3: Chain-of-Thought
export const PROMPT_V3 = ChatPromptTemplate.fromMessages([
  ["system", "你是一位资深 HR 专家，擅长撰写高质量的职位描述（JD）。\n\n## 思考过程\n在撰写 JD 前，请先分析：\n1. 岗位核心价值是什么？\n2. 最需要什么样的人？\n3. 候选人最关心什么？\n4. 我们能提供什么独特价值？\n\n## 输出要求\n1. 先输出思考过程（简要）\n2. 再输出完整 JD\n3. JD 必须包含：岗位职责（5-8条）、任职要求、薪资福利\n4. 每条职责必须有具体数字\n5. 总字数：800-1500字"],
  ["human", "请为以下岗位撰写 JD：\n\n岗位：{role}\n城市：{city}\n级别：{level}\n描述：{description}\n{context}\n\n请先思考，再输出 JD。"],
]);

// Prompt V4: 竞品对标
export const PROMPT_V4 = ChatPromptTemplate.fromMessages([
  ["system", "你是一位资深 HR 专家，擅长撰写高质量的职位描述（JD）。\n\n## 策略：竞品对标法\n撰写超越市场平均水平的 JD。\n\n## 优秀 JD 特征\n1. 具体而非空泛（有数字、有场景）\n2. 真诚而非套路（不说套话）\n3. 有温度而非冰冷（像朋友介绍工作）\n4. 有成长而非只干活（说清楚发展路径）\n\n## 输出要求\n- 总字数：800-1500字\n- 必须包含具体数字\n- 风格：专业、真诚、有温度\n- 避免所有套话"],
  ["human", "请撰写一个超越市场平均水平的 JD：\n\n岗位：{role}\n城市：{city}\n级别：{level}\n描述：{description}\n\n背景：{context}\n市场参考：{market_context}\n\n请撰写专业、真诚、有吸引力的 JD。"],
]);

// Prompt 版本管理
export const PROMPT_VERSIONS: Record<string, { prompt: ChatPromptTemplate; description: string; strategy: string }> = {
  v1: { prompt: PROMPT_V1, description: "基础版 - 直接指令", strategy: "direct" },
  v2: { prompt: PROMPT_V2, description: "结构化版 - 明确格式", strategy: "structured" },
  v3: { prompt: PROMPT_V3, description: "Chain-of-Thought - 分步推理", strategy: "cot" },
  v4: { prompt: PROMPT_V4, description: "竞品对标 - 超越市场", strategy: "benchmark" },
};

// 类型定义
export interface JDGenerationInput {
  role: string;
  city: string;
  level: string;
  description: string;
  context?: string;
  marketContext?: string;
}

export interface JDGenerationResult {
  version: string;
  jdText: string;
  thinking?: string;
  duration: number;
}

// 使用指定版本生成 JD
export async function generateJDWithPrompt(
  input: JDGenerationInput,
  version: string = "v2",
  modelConfig?: { modelName?: string; temperature?: number }
): Promise<JDGenerationResult> {
  const startTime = Date.now();
  const promptConfig = PROMPT_VERSIONS[version];
  if (!promptConfig) throw new Error("Unknown prompt version: " + version);

  const model = new ChatOpenAI({
    model: modelConfig?.modelName || config.deepseek.models.pro,
    apiKey: config.deepseek.apiKey,
    configuration: { baseURL: config.deepseek.baseUrl },
    temperature: modelConfig?.temperature || 0.7,
    maxTokens: 3000,
  });

  const chain = promptConfig.prompt.pipe(model).pipe(new StringOutputParser());
  const context = input.context || "暂无";

  const result = await chain.invoke({
    role: input.role,
    city: input.city,
    level: input.level,
    description: input.description,
    context: context,
    market_context: input.marketContext || "暂无市场数据",
  });

  let thinking: string | undefined;
  let jdText = result;

  if (version === "v3") {
    const thinkingMatch = result.match(/##\s*思考[\s\S]*?(?=##\s*JD)/i);
    const jdMatch = result.match(/##\s*JD[\s\S]*/i);
    if (thinkingMatch) thinking = thinkingMatch[0].trim();
    if (jdMatch) jdText = jdMatch[0].replace(/##\s*JD\s*正文/i, "").trim();
  }

  return { version, jdText, thinking, duration: Date.now() - startTime };
}

// 并行测试所有版本
export async function runPromptABTest(
  input: JDGenerationInput,
  versions: string[] = ["v1", "v2", "v3", "v4"]
): Promise<JDGenerationResult[]> {
  return Promise.all(versions.map((v) => generateJDWithPrompt(input, v)));
}

// 格式化对比结果
export function formatPromptComparison(results: JDGenerationResult[]): string {
  const lines: string[] = [];
  lines.push("## Prompt A/B 测试结果\n");
  lines.push("| 版本 | 字数 | 耗时 |");
  lines.push("| --- | --- | --- |");
  for (const r of results) {
    lines.push("| " + r.version + " | " + r.jdText.length + "字 | " + r.duration + "ms |");
  }
  return lines.join("\n");
}
