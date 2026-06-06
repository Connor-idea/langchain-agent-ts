/**
 * 测试：JD 上下文完整性评估
 *
 * 用当前的数据输入，评估覆盖了哪些维度、缺了什么
 */
import { evaluateContext, formatEvaluation } from "../hr-agent/context-evaluator.js";

// 当前 HR Agent 的输入数据
const currentInput = {
  requirement: {
    title: "前端开发工程师",
    rawNeed: "需要一个前端做管理后台和数据大屏，React，3年经验，15-25K，急招",
    budget: { min: 15, max: 25 },
    urgency: "紧急",
  },
  department: {
    name: "技术部",
    mission: "负责餐饮 SaaS 产品的技术研发",
    team: [
      { role: "后端开发", level: "高级", yearsOfExp: 5, keySkills: ["Java", "微服务"], replaceable: false },
      { role: "后端开发", level: "中级", yearsOfExp: 3, keySkills: ["Java", "Spring Boot"], replaceable: false },
      { role: "后端开发", level: "中级", yearsOfExp: 2, keySkills: ["Java", "MySQL"], replaceable: true },
      { role: "后端开发", level: "初级", yearsOfExp: 1, keySkills: ["Java"], replaceable: true },
      { role: "测试", level: "中级", yearsOfExp: 2, keySkills: ["接口测试"], replaceable: true },
    ],
    managementStyle: "扁平",
    culture: ["务实", "结果导向", "快速迭代"],
    collaboration: "小团队，需求和技术直接对接",
    topChallenge: "没有前端，后端兼做前端，进度慢质量差",
  },
  business: {
    companyName: "星宝科技",
    industry: "餐饮数字化",
    stage: "成长",
    bossExpectation: "前端来了要把管理后台和数据大屏做出来，让客户看到产品是专业的",
    strategy: "从项目制转向产品制，标准化交付",
    businessGoals: ["Q3 管理后台 V1.0 上线", "Q4 数据大屏模块", "年底前 10 个付费客户"],
    budgetConstraint: "紧张",
    implicitRequirements: "最好能带团队前端水平，不要只会切图的",
  },
};

// 理想状态的输入数据（对比用）
const idealInput = {
  requirement: {
    title: "前端开发工程师",
    rawNeed: "需要一个前端做管理后台和数据大屏",
    budget: { min: 15, max: 25 },
    urgency: "紧急",
    firstQuarterTasks: [
      "搭建 React 项目框架和 CI/CD",
      "完成管理后台核心页面（用户管理、数据概览）",
      "建立前端代码规范和组件库基础",
    ],
    successMetrics: [
      "管理后台 V1.0 按时上线",
      "首屏加载 < 2s",
      "代码测试覆盖 > 60%",
    ],
    workDistribution: "70% 开发 + 20% 技术方案 + 10% 团队协作",
    decisionScope: "前端技术选型、组件库设计、性能优化方案",
    dealbreakers: ["不接受完全远程", "不接受没有 React 实战经验"],
    previousHolder: "无（新岗位）",
  },
  department: {
    name: "技术部",
    mission: "负责餐饮 SaaS 产品的技术研发",
    team: currentInput.department.team,
    managementStyle: "扁平",
    culture: ["务实", "结果导向", "快速迭代"],
    collaboration: "小团队，需求和技术直接对接",
    topChallenge: "没有前端，后端兼做前端",
    growthPath: "前端负责人 → 技术经理 → 技术总监",
  },
  business: currentInput.business,
  market: {
    salaryP50: "20K",
    salaryP75: "28K",
    supply: "充足",
    hotSkills: ["React", "TypeScript", "Next.js"],
    avgHireCycle: "3-4 周",
    competitorJDs: ["A公司: 前端 18-30K", "B公司: 前端 15-25K"],
  },
  candidate: {
    targetProfile: "在中小公司做了 2-3 年前端，想找个成长性好的团队",
    motivation: "当前公司技术栈老旧，想用新技术",
    decisionFactors: ["技术氛围", "成长空间", "薪酬"],
    channels: ["BOSS直聘", "脉脉", "GitHub"],
  },
  constraints: {
    location: "深圳",
    remote: "混合（每周 2 天远程）",
    headcount: 1,
  },
};

async function main() {
  console.log("📊 JD 上下文完整性评估\n");
  console.log("=".repeat(60));

  // 评估当前输入
  console.log("📋 当前输入数据评估：\n");
  const currentEval = evaluateContext(currentInput);
  console.log(formatEvaluation(currentEval));

  console.log("\n" + "=".repeat(60));

  // 评估理想输入
  console.log("\n📋 理想输入数据评估（对比）：\n");
  const idealEval = evaluateContext(idealInput);
  console.log(formatEvaluation(idealEval));

  // 对比
  console.log("\n" + "=".repeat(60));
  console.log("\n📊 对比：\n");
  console.log(`当前: ${currentEval.grade} (${Math.round(currentEval.completeness * 100)}%) — ${currentEval.totalScore}/${currentEval.maxScore}`);
  console.log(`理想: ${idealEval.grade} (${Math.round(idealEval.completeness * 100)}%) — ${idealEval.totalScore}/${idealEval.maxScore}`);
  console.log(`差距: +${idealEval.totalScore - currentEval.totalScore} 分`);

  console.log("\n当前缺失的关键维度：");
  currentEval.dimensions
    .filter((d) => d.actualScore / d.maxScore < 0.3)
    .forEach((d) => {
      console.log(`  🔴 ${d.dimension}: ${d.gaps.length} 项缺失`);
      d.gaps.slice(0, 3).forEach((g) => console.log(`     - ${g}`));
    });
}

main().catch(console.error);
