import "dotenv/config";

export const config = {
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY!,
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
  },
  langsmith: {
    apiKey: process.env.LANGSMITH_API_KEY!,
    project: process.env.LANGCHAIN_PROJECT || "connor-agent-dev",
  },
  proxy: process.env.https_proxy || "http://192.168.64.1:7897",
};
