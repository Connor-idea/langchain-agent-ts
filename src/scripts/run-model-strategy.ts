/**
 * 模型策略优化 — 多模型 A/B 测试
 *
 * 测试不同模型组合的质量、速度、成本
 *
 * 可用模型:
 * 1. DeepSeek V4 Pro (推理强，成本高)
 * 2. DeepSeek V4 Flash (速度快，成本低)
 * 3. NVIDIA Llama 3.1 8B (免费，快速)
 * 4. NVIDIA Llama 3.3 70B (免费，强大)
 * 5. NVIDIA Mixtral 8x7B (免费，混合专家)
 * 6. NVIDIA Qwen2.5 Coder 32B (免费，代码专用)
 */

import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { config } from "../config.js";
import { runEvaluation } from "../hr-agent/evaluators.js";
import * as fs from "fs";

// ========== 模型配置 ==========

interface ModelConfig {
  id: string;
  name: string;
  provider: "deepseek" | "nvidia" | "mimo";
  model: string;
  baseURL: string;
  apiKey: string;
  description: string;
  costPer1kTokens: number; // 估算
  isFree: boolean;
}

// 从环境变量读取
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || "";
const NVIDIA_BASE_URL = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
const MIMO_API_KEY = process.env.MIMO_API_KEY || "";
const MIMO_BASE_URL = process.env.MIMO_BASE_URL || "https://token-plan-cn.xiaomimimo.com/v1";

const MODELS: ModelConfig[] = [
  // DeepSeek (付费)
  {
    id: "deepseek-pro",
    name: "DeepSeek V4 Pro",
    provider: "deepseek",
    model: config.deepseek.models.pro,
    baseURL: config.deepseek.baseUrl,
    apiKey: config.deepseek.apiKey,
    description: "旗舰推理，适合复杂任务",
    costPer1kTokens: 0.014,
    isFree: false,
  },
  {
    id: "deepseek-flash",
    name: "DeepSeek V4 Flash",
    provider: "deepseek",
    model: config.deepseek.models.flash,
    baseURL: config.deepseek.baseUrl,
    apiKey: config.deepseek.apiKey,
    description: "快速模型，适合简单任务",
    costPer1kTokens: 0.001,
    isFree: false,
  },
  // NVIDIA (免费 - 顶级模型)
  {
    id: "nvidia-llama-70b",
    name: "Llama 3.3 70B (NVIDIA)",
    provider: "nvidia",
    model: "meta/llama-3.3-70b-instruct",
    baseURL: NVIDIA_BASE_URL,
    apiKey: NVIDIA_API_KEY,
    description: "Meta 70B，强大通用",
    costPer1kTokens: 0,
    isFree: true,
  },
  {
    id: "nvidia-llama-8b",
    name: "Llama 3.1 8B (NVIDIA)",
    provider: "nvidia",
    model: "meta/llama-3.1-8b-instruct",
    baseURL: NVIDIA_BASE_URL,
    apiKey: NVIDIA_API_KEY,
    description: "轻量快速",
    costPer1kTokens: 0,
    isFree: true,
  },
  {
    id: "nvidia-nemotron-super",
    name: "Nemotron Super 49B (NVIDIA)",
    provider: "nvidia",
    model: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
    baseURL: NVIDIA_BASE_URL,
    apiKey: NVIDIA_API_KEY,
    description: "NVIDIA 自研 49B",
    costPer1kTokens: 0,
    isFree: true,
  },
  {
    id: "nvidia-nemotron-120b",
    name: "Nemotron 3 Super 120B (NVIDIA)",
    provider: "nvidia",
    model: "nvidia/nemotron-3-super-120b-a12b",
    baseURL: NVIDIA_BASE_URL,
    apiKey: NVIDIA_API_KEY,
    description: "NVIDIA 120B 混合专家",
    costPer1kTokens: 0,
    isFree: true,
  },
  {
    id: "nvidia-mistral-large",
    name: "Mistral Large 675B (NVIDIA)",
    provider: "nvidia",
    model: "mistralai/mistral-large-3-675b-instruct-2512",
    baseURL: NVIDIA_BASE_URL,
    apiKey: NVIDIA_API_KEY,
    description: "Mistral 675B 旗舰",
    costPer1kTokens: 0,
    isFree: true,
  },
  {
    id: "nvidia-qwen-397b",
    name: "Qwen 3.5 397B (NVIDIA)",
    provider: "nvidia",
    model: "qwen/qwen3.5-397b-a17b",
    baseURL: NVIDIA_BASE_URL,
    apiKey: NVIDIA_API_KEY,
    description: "通义千问 397B",
    costPer1kTokens: 0,
    isFree: true,
  },
  {
    id: "nvidia-gemma-4",
    name: "Gemma 4 31B (NVIDIA)",
    provider: "nvidia",
    model: "google/gemma-4-31b-it",
    baseURL: NVIDIA_BASE_URL,
    apiKey: NVIDIA_API_KEY,
    description: "Google Gemma 4",
    costPer1kTokens: 0,
    isFree: true,
  },
  {
    id: "nvidia-glm-5",
    name: "GLM 5.1 (NVIDIA)",
    provider: "nvidia",
    model: "z-ai/glm-5.1",
    baseURL: NVIDIA_BASE_URL,
    apiKey: NVIDIA_API_KEY,
    description: "智谱 GLM 5.1",
    costPer1kTokens: 0,
    isFree: true,
  },
  // MiMo (免费)
  {
    id: "mimo-pro",
    name: "MiMo V2.5 Pro",
    provider: "mimo",
    model: "mimo-v2.5-pro",
    baseURL: MIMO_BASE_URL,
    apiKey: MIMO_API_KEY,
    description: "小米旗舰，中文优化",
    costPer1kTokens: 0,
    isFree: true,
  },
].filter(m => !["nvidia-mistral-large", "nvidia-qwen-397b", "nvidia-glm-5"].includes(m.id));

// ========== JD 生成 Prompt ==========

const JD_PROMPT = ChatPromptTemplate.fromMessages([
  ["system", "你是资深 HR 专家。请为以下岗位撰写完整的 JD（职位描述）。\n\n要求：\n1. 包含岗位职责（5-8条，每条有具体数字）\n2. 任职要求（必须+加分项）\n3. 薪资福利\n4. 公司介绍\n5. 总字数 800-1500 字\n\n风格：专业、真诚、有吸引力。"],
  ["human", "岗位：{role}\n城市：{city}\n级别：{level}\n描述：{description}\n\n请输出完整 JD。"],
]);

// ========== 测试函数 ==========

interface TestResult {
  modelId: string;
  modelName: string;
  isFree: boolean;
  jdText: string;
  charCount: number;
  duration: number;
  evalScore: number;
  evalPassed: boolean;
  error?: string;
}

async function testModel(model: ModelConfig, testCase: any): Promise<TestResult> {
  const startTime = Date.now();

  try {
    const llm = new ChatOpenAI({
      model: model.model,
      apiKey: model.apiKey,
      configuration: { baseURL: model.baseURL },
      temperature: 0.7,
      maxTokens: 3000,
    });

    const chain = JD_PROMPT.pipe(llm).pipe(new StringOutputParser());

    const jdText = await chain.invoke({
      role: testCase.role,
      city: testCase.city,
      level: testCase.level,
      description: testCase.description,
    });

    // 评估
    const evalReport = await runEvaluation(
      jdText,
      {
        must_contain: ["职责", "要求"],
        must_not_contain: ["996"],
        structure_required: ["title", "responsibilities", "requirements"],
      },
      {}
    );

    return {
      modelId: model.id,
      modelName: model.name,
      isFree: model.isFree,
      jdText,
      charCount: jdText.length,
      duration: Date.now() - startTime,
      evalScore: evalReport.overallScore,
      evalPassed: evalReport.passed,
    };
  } catch (err) {
    return {
      modelId: model.id,
      modelName: model.name,
      isFree: model.isFree,
      jdText: "",
      charCount: 0,
      duration: Date.now() - startTime,
      evalScore: 0,
      evalPassed: false,
      error: (err as Error).message,
    };
  }
}

// ========== 主函数 ==========

const TEST_CASE = {
  role: "前端开发工程师",
  city: "上海",
  level: "中级",
  description: "招一个前端开发，做公寓管理系统后台",
};

async function main() {
  console.log("🚀 模型策略优化测试");
  console.log("=".repeat(60));
  console.log(`📋 测试场景: ${TEST_CASE.description}`);
  console.log(`📊 测试模型: ${MODELS.length} 个`);
  console.log("");

  // 过滤有效模型
  const validModels = MODELS.filter((m) => m.apiKey);
  console.log(`✅ 有效模型: ${validModels.length} 个`);
  for (const m of validModels) {
    console.log(`   - ${m.name} (${m.isFree ? "免费" : "付费"})`);
  }

  // 串行测试（避免并发问题）
  const results: TestResult[] = [];
  for (const model of validModels) {
    console.log(`\n⏳ 测试 ${model.name}...`);
    const result = await testModel(model, TEST_CASE);
    results.push(result);
    console.log(`   ${result.error ? "❌ " + result.error.substring(0, 50) : "✅ " + result.evalScore + "分, " + result.charCount + "字, " + result.duration + "ms"}`);
  }

  // ========== 汇总报告 ==========
  console.log("\n\n" + "=".repeat(60));
  console.log("📊 模型策略优化结果");
  console.log("=".repeat(60));

  // 排序
  const sorted = [...results]
    .filter((r) => !r.error)
    .sort((a, b) => b.evalScore - a.evalScore);

  console.log("\n🏆 排名 (按质量):");
  console.log("");
  console.log("| 排名 | 模型 | 免费 | 得分 | 字数 | 耗时 | 状态 |");
  console.log("| --- | --- | --- | --- | --- | --- | --- |");

  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "  ";
    const free = r.isFree ? "✅" : "💰";
    console.log(
      `| ${medal} ${i + 1} | ${r.modelName.substring(0, 20)} | ${free} | ${r.evalScore} | ${r.charCount}字 | ${Math.round(r.duration / 1000)}秒 | ${r.evalPassed ? "✅" : "❌"} |`
    );
  }

  // 免费模型排名
  const freeModels = sorted.filter((r) => r.isFree);
  if (freeModels.length > 0) {
    console.log("\n💰 免费模型排名:");
    console.log("");
    for (let i = 0; i < freeModels.length; i++) {
      const r = freeModels[i];
      console.log(`  ${i + 1}. ${r.modelName}: ${r.evalScore}分, ${r.charCount}字, ${Math.round(r.duration / 1000)}秒`);
    }
  }

  // 策略建议
  console.log("\n💡 策略建议:");
  
  if (sorted.length > 0) {
    const best = sorted[0];
    const bestFree = freeModels[0];
    
    console.log(`  🏆 最佳质量: ${best.modelName} (${best.evalScore}分)`);
    
    if (bestFree) {
      console.log(`  💰 最佳免费: ${bestFree.modelName} (${bestFree.evalScore}分)`);
      
      const qualityDiff = best.evalScore - bestFree.evalScore;
      if (qualityDiff <= 5) {
        console.log(`  ✅ 推荐: 使用免费模型（质量差距仅 ${qualityDiff} 分）`);
      } else if (qualityDiff <= 15) {
        console.log(`  ⚖️ 权衡: 免费模型质量差距 ${qualityDiff} 分，可根据场景选择`);
      } else {
        console.log(`  💡 建议: 关键任务用付费模型，日常任务用免费模型`);
      }
    }
  }

  // 保存结果
  const reportPath = `results/model-strategy-${new Date().toISOString().split("T")[0]}.json`;
  const report = {
    timestamp: new Date().toISOString(),
    testCase: TEST_CASE,
    results: sorted.map((r) => ({
      modelId: r.modelId,
      modelName: r.modelName,
      isFree: r.isFree,
      score: r.evalScore,
      passed: r.evalPassed,
      charCount: r.charCount,
      duration: r.duration,
    })),
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n💾 报告已保存: ${reportPath}`);
}

main().catch(console.error);
