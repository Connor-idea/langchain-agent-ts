/**
 * 上传评估数据集到 LangSmith
 *
 * 使用方法：
 * npx tsx src/scripts/upload-dataset.ts
 */

import { Client } from "langsmith";
import * as fs from "fs";
import * as path from "path";

// LangSmith 配置
const LANGSMITH_API_KEY = process.env.LANGSMITH_API_KEY;
const DATASET_NAME = "hr-agent-quality-v1";

async function uploadDataset() {
  if (!LANGSMITH_API_KEY) {
    console.error("❌ 请设置 LANGSMITH_API_KEY 环境变量");
    process.exit(1);
  }

  const client = new Client({ apiKey: LANGSMITH_API_KEY });

  // 读取数据集
  const datasetPath = path.join(
    process.cwd(),
    "datasets",
    "hr-agent-eval-v1.json"
  );

  if (!fs.existsSync(datasetPath)) {
    console.error(`❌ 数据集文件不存在: ${datasetPath}`);
    process.exit(1);
  }

  const dataset = JSON.parse(fs.readFileSync(datasetPath, "utf-8"));
  console.log(`📂 加载数据集: ${dataset.dataset_name}`);
  console.log(`   描述: ${dataset.description}`);
  console.log(`   用例数: ${dataset.examples.length}`);

  // 创建或获取数据集
  let datasetId: string;

  try {
    // 尝试获取现有数据集
    const existingDatasets = client.listDatasets({
      datasetName: DATASET_NAME,
    });

    let existingDataset = null;
    for await (const ds of existingDatasets) {
      existingDataset = ds;
      break;
    }

    if (existingDataset) {
      datasetId = existingDataset.id;
      console.log(`📦 使用现有数据集: ${datasetId}`);
    } else {
      // 创建新数据集
      const newDataset = await client.createDataset(DATASET_NAME, {
        description: dataset.description,
      });
      datasetId = newDataset.id;
      console.log(`✨ 创建新数据集: ${datasetId}`);
    }
  } catch (err) {
    console.error("❌ 创建/获取数据集失败:", (err as Error).message);
    process.exit(1);
  }

  // 上传示例
  console.log("\n📤 上传评估用例...");

  let uploaded = 0;
  let skipped = 0;

  for (const example of dataset.examples) {
    try {
      // 检查是否已存在
      const existingExamples = client.listExamples({
        datasetId,
        asOf: example.id,
      });

      let exists = false;
      for await (const ex of existingExamples) {
        exists = true;
        break;
      }

      if (exists) {
        skipped++;
        continue;
      }

      // 上传新示例
      await client.createExample({
        datasetId,
        inputs: example.input,
        outputs: example.expected_output,
        metadata: {
          ...example.metadata,
          example_id: example.id,
          description: example.metadata?.scenario || example.id,
        },
      });

      uploaded++;
      console.log(`  ✅ ${example.id}: ${example.metadata?.scenario}`);
    } catch (err) {
      console.error(
        `  ❌ ${example.id}: ${(err as Error).message}`
      );
    }
  }

  console.log("\n📊 上传完成:");
  console.log(`  - 新增: ${uploaded}`);
  console.log(`  - 跳过: ${skipped}`);
  console.log(`  - 总计: ${dataset.examples.length}`);
  console.log(`\n🔗 查看数据集: https://smith.langchain.com/datasets/${datasetId}`);
}

// 运行
uploadDataset().catch(console.error);
