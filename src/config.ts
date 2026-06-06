import "dotenv/config";

export const config = {
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY!,
    baseUrl: "https://api.deepseek.com",
    models: {
      // 快速模型：审查、结构化、简单任务
      flash: "deepseek-v4-flash",
      // 推理模型：诊断、生成、修订
      pro: "deepseek-v4-pro",
    },
  },
  langsmith: {
    apiKey: process.env.LANGSMITH_API_KEY!,
    project: process.env.LANGCHAIN_PROJECT || "connor-agent-dev",
  },
  proxy: process.env.https_proxy || "http://192.168.64.1:7897",
};
