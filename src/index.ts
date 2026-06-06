/**
 * LangChain Agent TypeScript - 入口文件
 *
 * 5 个测试方向：
 * 1. 基础 Chain - LLM 调用和链式组合
 * 2. 工具调用 - Agent 使用外部工具
 * 3. 完整 Agent - LangGraph 推理-行动循环
 * 4. 评估 - 自动化质量评估
 * 5. 追踪 - LangSmith 可观测性
 */
import { config } from "dotenv";
config();

export { createLLM } from "./agents/llm.js";

console.log("LangChain Agent TypeScript 项目");
console.log("运行测试: npm test");
console.log("单独运行: npm run test:basic | test:tools | test:agent | test:eval | test:trace");
