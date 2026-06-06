/**
 * 测试厨师场景
 */
import { HRPipeline, formatPipelineResult } from "./hr-agent/pipeline.js";

async function main() {
  const pipeline = new HRPipeline();
  
  console.log("🍳 测试厨师场景\n");
  
  const result = await pipeline.run({
    rawDescription: "我想找一个厨师，做扬州炒饭，不需要特别资深，我们有统一的SOP但是基础的翻锅、切配、打荷还是需要会的",
    city: "上海",
    department: {
      name: "营运部",
      mission: "负责蛋炒饭、炸货、双皮奶、冰粉、卤味的研发",
      team: "3人",
    },
    business: {
      stage: "天使轮",
      industry: "连锁餐饮",
      product: "蛋炒饭、炸货、双皮奶、冰粉、卤味",
    },
    skipInterview: true,
  });

  console.log("\n" + formatPipelineResult(result));
}

main().catch(console.error);
