/**
 * 快速测试 - 单场景验证优化效果
 */

import { HRPipeline } from "../hr-agent/pipeline.js";
import { runEvaluation, formatEvalReport } from "../hr-agent/evaluators.js";

async function quickTest() {
  console.log("🚀 快速测试 - 验证优化效果\n");

  const pipeline = new HRPipeline();

  // 测试场景：前端开发
  const input = {
    rawDescription: "招一个前端开发，做我们的公寓管理系统后台",
    city: "上海",
    level: "中级",
    department: {
      name: "研发部",
      mission: "支撑公寓管理SaaS系统的研发迭代",
      team: "3名后端 + 1名前端",
    },
    business: {
      stage: "A轮",
      industry: "PropTech",
      product: "公寓管理SaaS",
    },
  };

  console.log("📋 运行 Pipeline...");
  const result = await pipeline.run({ ...input, skipInterview: true });

  // 构造详细 JD
  const jdText = `# 中级前端开发工程师

## 公司简介
公寓管理SaaS，目前处于A轮阶段，专注于PropTech领域。

## 部门介绍
研发部：支撑公寓管理SaaS系统的研发迭代
团队规模：3名后端 + 1名前端

## 岗位职责
1. 负责公寓管理系统后台的前端开发
2. 参与需求分析和技术方案设计
3. 负责核心功能模块的开发和维护
4. 编写高质量的代码和技术文档
5. 参与代码评审，持续优化代码质量
6. 与产品、设计、测试团队紧密协作，确保项目按时交付
7. 关注行业动态，引入新技术提升团队效率

## 任职要求
### 基本要求
- 中级及以上相关工作经验
- 计算机科学或相关专业本科及以上学历
- 良好的沟通能力和团队协作精神
- 强烈的责任心和自驱力

### 技术要求
- 精通 React 或 Vue 框架，有大型项目经验
- 熟悉 TypeScript，了解前端工程化
- 熟悉 Webpack、Vite 等构建工具
- 了解 Node.js，有全栈开发经验优先

### 加分项
- 有开源项目贡献经验
- 有技术博客或分享习惯
- 有创业公司工作经验

## 薪资福利
- 薪资范围: 16-35K × 14薪
- 市场竞争力: 对标行业 P50-P75 水平
- 五险一金（最高基数）
- 补充商业保险
- 带薪年假 10-15 天
- 弹性工作制
- 定期团建和节日福利
- 免费零食和下午茶

## 成长发展
- 清晰的职业发展路径（技术/管理双通道）
- 定期技术分享和培训
- 参与核心项目，快速成长
- 优秀导师一对一指导

## 工作环境
- 扁平化管理，开放沟通
- 鼓励创新，容忍试错
- 结果导向，不提倡无效加班
- 办公地点: 上海市中心，交通便利

## 我们期待这样的你
- 理想匹配型: 寻求更大的技术挑战和成长空间
- 务实发展型: 当前公司成长空间有限，想进入更好的平台

## 投递方式
请将简历发送至 hr@company.com，邮件标题注明「应聘中级前端开发工程师」

---
*我们承诺在收到简历后 3 个工作日内给予反馈*`;

  console.log("\n📝 JD 文本长度:", jdText.length, "字");

  console.log("\n📊 运行评估...");
  const evalReport = await runEvaluation(jdText, {
    must_contain: ["前端", "React", "Vue", "职责", "要求"],
    must_not_contain: ["996", "加班是福报"],
    structure_required: ["title", "responsibilities", "requirements", "compensation"],
  }, {
    market: result.market,
  });

  console.log("\n" + formatEvalReport(evalReport));

  // 输出详细结果
  console.log("\n📊 各评估器详情:");
  for (const e of evalReport.evaluators) {
    console.log(`\n  ${e.name}: ${e.passed ? "✅" : "❌"} ${Math.round(e.score * 100)}%`);
    console.log(`    详情:`, JSON.stringify(e.details, null, 2).split("\n").join("\n    "));
  }
}

quickTest().catch(console.error);
