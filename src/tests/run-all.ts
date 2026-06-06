/**
 * 运行所有测试
 */
import { config } from "dotenv";
config();

const tests = [
  { name: "基础 Chain", file: "./01-basic-chain.ts" },
  { name: "工具调用", file: "./02-tool-calling.ts" },
  { name: "完整 Agent", file: "./03-agent.ts" },
  { name: "评估", file: "./04-evaluation.ts" },
  { name: "LangSmith 追踪", file: "./05-tracing.ts" },
];

async function runAll() {
  console.log("🚀 开始运行所有测试\n");
  console.log("=".repeat(50));

  const results: Array<{ name: string; passed: boolean; error?: string }> = [];

  for (const test of tests) {
    try {
      // Dynamic import
      await import(test.file);
      results.push({ name: test.name, passed: true });
    } catch (e: any) {
      console.error(`❌ ${test.name} 失败: ${e.message}\n`);
      results.push({ name: test.name, passed: false, error: e.message });
    }
  }

  console.log("=".repeat(50));
  console.log("\n📊 测试汇总:\n");
  results.forEach((r) => {
    console.log(`  ${r.passed ? "✅" : "❌"} ${r.name}${r.error ? ` (${r.error})` : ""}`);
  });
  console.log(`\n  总计: ${results.length} | 通过: ${results.filter((r) => r.passed).length} | 失败: ${results.filter((r) => !r.passed).length}`);
}

runAll().catch(console.error);
