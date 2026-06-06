# LangChain.js Agent 开发 + LangSmith 测试

基于 TypeScript 的 LangChain Agent 开发项目，集成 DeepSeek API 和 LangSmith 追踪。

## 环境要求

- Node.js 18+
- DeepSeek API Key
- LangSmith API Key（可选，用于追踪）

## 快速开始

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入你的 API Key

# 运行测试
npm test              # 运行所有测试
npm run test:basic    # 基础 Chain
npm run test:tools    # 工具调用
npm run test:agent    # 完整 Agent
npm run test:eval     # 评估
npm run test:trace    # LangSmith 追踪
```

## 5 个测试方向

### 1. 基础 Chain (`01-basic-chain.ts`)
- 简单 LLM 调用
- 多轮对话 Chain
- 结构化输出（JSON Schema）

### 2. 工具调用 (`02-tool-calling.ts`)
- 定义工具（搜索、计算器）
- LLM 自动选择工具
- 工具结果解析

### 3. 完整 Agent (`03-agent.ts`)
- ReAct 推理-行动循环
- 多步工具调用链
- 基于工具结果的最终回答

### 4. 评估 (`04-evaluation.ts`)
- 自动化质量评估
- 正确性评分
- 测试用例管理

### 5. LangSmith 追踪 (`05-tracing.ts`)
- Trace 上传验证
- 自定义追踪（traceable）
- Trace 统计查看

## 技术栈

- **LangChain.js** - LLM 应用框架
- **LangSmith** - 可观测性平台
- **DeepSeek** - LLM 模型
- **TypeScript** - 类型安全
- **Zod** - Schema 验证
