/**
 * 测试：需求访谈 Agent
 */
import { config } from "dotenv";
config();

import {
  generateInterviewQuestions,
  generateInterviewOpening,
  generateFollowUp,
  structureRequirement,
  type InterviewInput,
  type InterviewAnswer,
} from "../hr-agent/needs-interview.js";

const input: InterviewInput = {
  rawDescription:
    "我们需要一个前端，主要做客户管理后台和数据大屏。后端用 Java，前端打算用 React。最好 3 年以上经验，能独立负责模块。薪资 15-25K。急招，现在前端活都是后端兼着做的，质量不行。",
  knownInfo: {
    title: "前端开发工程师",
    department: "技术部",
    budget: { min: 15, max: 25 },
    urgency: "紧急",
    industry: "餐饮数字化",
  },
};

async function main() {
  console.log("🎤 需求访谈 Agent 测试\n");
  console.log("=".repeat(60));

  // 1. 生成访谈问题
  console.log("📋 Step 1: 分析缺失维度，生成访谈问题\n");
  const questions = generateInterviewQuestions(input);

  console.log(`共 ${questions.length} 个问题：`);
  questions.forEach((q, i) => {
    console.log(`\n  ${i + 1}. [${q.priority}] ${q.dimension} - ${q.id}`);
    console.log(`     Q: ${q.question}`);
    console.log(`     提示: ${q.hint}`);
    if (q.options) {
      console.log(`     选项: ${q.options.join(" | ")}`);
    }
  });

  // 2. 模拟访谈
  console.log("\n\n" + "=".repeat(60));
  console.log("🎤 Step 2: 模拟访谈\n");

  const opening = generateInterviewOpening(input);
  console.log(`Agent: ${opening}`);

  // 模拟用户回答
  const mockAnswers: InterviewAnswer[] = [
    {
      questionId: "first_quarter",
      answer: "前 3 个月主要是搭建前端项目框架，用 React + TypeScript，然后把管理后台的核心页面做出来——用户管理、数据概览这两个模块先上线。",
    },
    {
      questionId: "success_metrics",
      answer: "主要看能不能按时交付。Q3 管理后台 V1.0 要上线，这是硬指标。代码质量也看，但不是第一位的。",
    },
    {
      questionId: "salary_range",
      answer: "15-25K，预算比较紧。如果特别优秀可以到 28K，但需要老板审批。",
    },
    {
      questionId: "dealbreakers",
      answer: "频繁跳槽的不要，2 年换了 3 份工作的直接 pass。还有就是不能接受加班的也不行，我们创业公司，项目紧的时候肯定要加班。",
    },
    {
      questionId: "target_profile",
      answer: "最好在中小公司做过 2-3 年，有 B 端 SaaS 的经验。大厂出来的也行，但要能适应小团队的节奏。",
    },
    {
      questionId: "motivation",
      answer: "我觉得主要是技术成长空间。我们是 0 前端，TA 来了就是前端负责人，以后可以带团队。还有就是业务前景，餐饮数字化是个大赛道。",
    },
    {
      questionId: "location",
      answer: "深圳南山，不支持远程。偶尔可以 WFH，但大部分时间要到岗。",
    },
  ];

  for (const answer of mockAnswers) {
    const q = questions.find((q) => q.id === answer.questionId);
    if (q) {
      console.log(`Agent: ${q.question}`);
      console.log(`用户: ${answer.answer}\n`);
    }
  }

  // 3. 结构化输出
  console.log("=".repeat(60));
  console.log("📄 Step 3: 整理为结构化需求\n");

  try {
    const result = await structureRequirement(input, mockAnswers);

    console.log("结构化需求：");
    console.log(JSON.stringify(result, null, 2).substring(0, 3000) + "...\n");

    if (result.evaluation) {
      console.log("上下文完整性评估：");
      console.log(`  等级: ${result.evaluation.grade}`);
      console.log(`  完成度: ${Math.round(result.evaluation.completeness * 100)}%`);
      result.evaluation.dimensions.forEach((d) => {
        const pct = Math.round((d.actualScore / d.maxScore) * 100);
        console.log(`  ${d.dimension}: ${pct}%`);
      });
    }
  } catch (e: any) {
    console.log(`结构化失败: ${e.message}`);
  }
}

main().catch(console.error);
