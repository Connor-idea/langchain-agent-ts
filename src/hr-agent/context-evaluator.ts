/**
 * JD 上下文完整性评估器
 *
 * 在生成 JD 之前，先评估输入数据的完整性
 * 指出哪些维度缺失、哪些不够深入
 * 给出补全建议
 */

// ========== 维度定义 ==========

export interface DimensionScore {
  dimension: string;
  weight: number;
  maxScore: number;
  actualScore: number;
  checks: CheckResult[];
  gaps: string[];
  suggestions: string[];
}

export interface CheckResult {
  item: string;
  passed: boolean;
  score: number;
  detail: string;
}

export interface ContextEvaluation {
  totalScore: number;
  maxScore: number;
  completeness: number; // 0-1
  grade: "A" | "B" | "C" | "D" | "F";
  dimensions: DimensionScore[];
  criticalGaps: string[];
  recommendations: string[];
}

// ========== 评估函数 ==========

export function evaluateContext(input: {
  requirement?: Record<string, any>;
  department?: Record<string, any>;
  business?: Record<string, any>;
}): ContextEvaluation {
  const dimensions: DimensionScore[] = [];

  // 1. 业务维度
  dimensions.push(evaluateBusinessDimension(input.business));

  // 2. 组织维度
  dimensions.push(evaluateOrgDimension(input.department));

  // 3. 岗位维度
  dimensions.push(evaluateJobDimension(input.requirement));

  // 4. 市场维度
  dimensions.push(evaluateMarketDimension(input.requirement));

  // 5. 候选人维度
  dimensions.push(evaluateCandidateDimension(input.requirement, input.business));

  // 6. 约束维度
  dimensions.push(evaluateConstraintDimension(input.requirement, input.business));

  const totalScore = dimensions.reduce((s, d) => s + d.actualScore, 0);
  const maxScore = dimensions.reduce((s, d) => s + d.maxScore, 0);
  const completeness = totalScore / maxScore;

  let grade: ContextEvaluation["grade"];
  if (completeness >= 0.85) grade = "A";
  else if (completeness >= 0.7) grade = "B";
  else if (completeness >= 0.5) grade = "C";
  else if (completeness >= 0.3) grade = "D";
  else grade = "F";

  const criticalGaps = dimensions
    .flatMap((d) => d.gaps)
    .filter((_, i) => dimensions[Math.floor(i / 2)]?.weight >= 0.2);

  const recommendations = generateRecommendations(dimensions, grade);

  return {
    totalScore,
    maxScore,
    completeness,
    grade,
    dimensions,
    criticalGaps,
    recommendations,
  };
}

// ========== 维度评估 ==========

function evaluateBusinessDimension(biz?: Record<string, any>): DimensionScore {
  const checks: CheckResult[] = [];
  const bizData = biz || {};

  checks.push({
    item: "战略方向",
    passed: !!bizData.strategy,
    score: bizData.strategy ? 2 : 0,
    detail: bizData.strategy || "缺失：公司未来 1-3 年的战略方向",
  });

  checks.push({
    item: "业务阶段",
    passed: !!bizData.stage,
    score: bizData.stage ? 1 : 0,
    detail: bizData.stage || "缺失：初创/成长/成熟/转型",
  });

  checks.push({
    item: "业务目标",
    passed: Array.isArray(bizData.businessGoals) && bizData.businessGoals.length > 0,
    score: Array.isArray(bizData.businessGoals) && bizData.businessGoals.length > 0 ? 2 : 0,
    detail: bizData.businessGoals?.join("; ") || "缺失：未来 12 个月的业务目标",
  });

  checks.push({
    item: "老板期望",
    passed: !!bizData.bossExpectation,
    score: bizData.bossExpectation ? 2 : 0,
    detail: bizData.bossExpectation || "缺失：老板/高管对这个岗位的期望",
  });

  checks.push({
    item: "业务痛点",
    passed: !!bizData.implicitRequirements,
    score: bizData.implicitRequirements ? 1 : 0,
    detail: bizData.implicitRequirements || "缺失：隐性需求/业务痛点",
  });

  const actualScore = checks.reduce((s, c) => s + c.score, 0);
  const gaps = checks.filter((c) => !c.passed).map((c) => `业务维度 - ${c.item}: ${c.detail}`);

  return {
    dimension: "业务维度",
    weight: 0.25,
    maxScore: 8,
    actualScore,
    checks,
    gaps,
    suggestions: gaps.map((g) => `补充: ${g}`),
  };
}

function evaluateOrgDimension(dept?: Record<string, any>): DimensionScore {
  const checks: CheckResult[] = [];
  const deptData = dept || {};

  checks.push({
    item: "团队成员",
    passed: Array.isArray(deptData.team) && deptData.team.length > 0,
    score: Array.isArray(deptData.team) && deptData.team.length > 0 ? 3 : 0,
    detail: deptData.team ? `${deptData.team.length} 人` : "缺失：团队成员列表",
  });

  checks.push({
    item: "技能缺口",
    passed: !!deptData.topChallenge,
    score: deptData.topChallenge ? 2 : 0,
    detail: deptData.topChallenge || "缺失：团队当前最大挑战/技能缺口",
  });

  checks.push({
    item: "管理风格",
    passed: !!deptData.managementStyle,
    score: deptData.managementStyle ? 1 : 0,
    detail: deptData.managementStyle || "缺失：扁平/层级/矩阵/项目制",
  });

  checks.push({
    item: "协作模式",
    passed: !!deptData.collaboration,
    score: deptData.collaboration ? 1 : 0,
    detail: deptData.collaboration || "缺失：团队协作模式",
  });

  checks.push({
    item: "团队文化",
    passed: Array.isArray(deptData.culture) && deptData.culture.length > 0,
    score: Array.isArray(deptData.culture) && deptData.culture.length > 0 ? 1 : 0,
    detail: deptData.culture?.join("、") || "缺失：团队文化关键词",
  });

  checks.push({
    item: "部门职能",
    passed: !!deptData.mission,
    score: deptData.mission ? 1 : 0,
    detail: deptData.mission || "缺失：部门职能定位",
  });

  checks.push({
    item: "成长路径",
    passed: false,
    score: 0,
    detail: "缺失：这个岗位的 1 年/3 年成长路径",
  });

  const actualScore = checks.reduce((s, c) => s + c.score, 0);
  const gaps = checks.filter((c) => !c.passed).map((c) => `组织维度 - ${c.item}: ${c.detail}`);

  return {
    dimension: "组织维度",
    weight: 0.25,
    maxScore: 10,
    actualScore,
    checks,
    gaps,
    suggestions: gaps.map((g) => `补充: ${g}`),
  };
}

function evaluateJobDimension(req?: Record<string, any>): DimensionScore {
  const checks: CheckResult[] = [];
  const reqData = req || {};

  checks.push({
    item: "原始需求",
    passed: !!reqData.rawNeed,
    score: reqData.rawNeed ? 2 : 0,
    detail: reqData.rawNeed ? `${reqData.rawNeed.substring(0, 50)}...` : "缺失：用人部门的原始需求描述",
  });

  checks.push({
    item: "前3个月任务",
    passed: false,
    score: 0,
    detail: "缺失：这个人来了之后前 3 个月具体要做什么",
  });

  checks.push({
    item: "成功标准",
    passed: false,
    score: 0,
    detail: "缺失：怎么衡量这个人干得好不好",
  });

  checks.push({
    item: "工作内容占比",
    passed: false,
    score: 0,
    detail: "缺失：70% 做什么 + 20% 做什么 + 10% 做什么",
  });

  checks.push({
    item: "决策权限",
    passed: false,
    score: 0,
    detail: "缺失：能决定什么、不能决定什么",
  });

  checks.push({
    item: "一票否决",
    passed: false,
    score: 0,
    detail: "缺失：有什么情况绝对不能接受",
  });

  checks.push({
    item: "岗位历史",
    passed: false,
    score: 0,
    detail: "缺失：这个岗位之前有人吗？为什么离开？",
  });

  const actualScore = checks.reduce((s, c) => s + c.score, 0);
  const gaps = checks.filter((c) => !c.passed).map((c) => `岗位维度 - ${c.item}: ${c.detail}`);

  return {
    dimension: "岗位维度",
    weight: 0.2,
    maxScore: 10,
    actualScore,
    checks,
    gaps,
    suggestions: gaps.map((g) => `补充: ${g}`),
  };
}

function evaluateMarketDimension(req?: Record<string, any>): DimensionScore {
  const checks: CheckResult[] = [];
  const reqData = req || {};

  // 检查是否通过 evaluator-integration 注入了市场数据
  const hasMarketData = !!reqData.marketData;
  const hasSalaryRange = !!reqData.salaryRange || !!reqData.marketBenchmark;
  const hasTalentSupply = !!reqData.talentSupply;
  const hasCompetitorAnalysis = !!reqData.competitorAnalysis;
  const hasRecruitmentCycle = !!reqData.recruitmentCycle;
  const hasHotSkills = Array.isArray(reqData.hotSkills) && reqData.hotSkills.length > 0;

  checks.push({
    item: "市场薪酬",
    passed: hasSalaryRange,
    score: hasSalaryRange ? 2 : 0,
    detail: reqData.salaryRange || (hasMarketData ? "已通过市场模块获取" : "缺失：这个级别的市场薪酬数据（25/50/75 分位）"),
  });

  checks.push({
    item: "人才供给",
    passed: hasTalentSupply,
    score: hasTalentSupply ? 2 : 0,
    detail: reqData.talentSupply || (hasMarketData ? "已通过市场模块获取" : "缺失：这类人才在市场上的供给情况"),
  });

  checks.push({
    item: "竞品 JD",
    passed: hasCompetitorAnalysis,
    score: hasCompetitorAnalysis ? 2 : 0,
    detail: hasCompetitorAnalysis ? "已通过市场模块获取" : "缺失：竞争对手怎么写类似岗位的 JD",
  });

  checks.push({
    item: "招聘周期",
    passed: hasRecruitmentCycle,
    score: hasRecruitmentCycle ? 2 : 0,
    detail: reqData.recruitmentCycle || (hasMarketData ? "已通过市场模块获取" : "缺失：这类岗位平均多久能招到"),
  });

  checks.push({
    item: "热门技能",
    passed: hasHotSkills,
    score: hasHotSkills ? 1 : 0,
    detail: hasHotSkills ? reqData.hotSkills.join("、") : "缺失：当前市场上最抢手的技能趋势",
  });

  const actualScore = checks.reduce((s, c) => s + c.score, 0);
  const gaps = checks.filter((c) => !c.passed).map((c) => `市场维度 - ${c.item}: ${c.detail}`);

  return {
    dimension: "市场维度",
    weight: 0.15,
    maxScore: 9,
    actualScore,
    checks,
    gaps,
    suggestions: gaps.map((g) => `补充: ${g}（可通过 L2 搜索获取）`),
  };
}

function evaluateCandidateDimension(req?: Record<string, any>, biz?: Record<string, any>): DimensionScore {
  const checks: CheckResult[] = [];
  const reqData = req || {};

  // 检查是否通过 evaluator-integration 注入了候选人数据
  const hasCandidatePersona = !!reqData.candidatePersona;
  const hasTargetBackground = !!reqData.targetCandidateBackground;
  const hasMotivation = !!reqData.candidateMotivation;
  const hasDecisionFactors = !!reqData.candidateDecisionFactors;
  const hasChannels = Array.isArray(reqData.candidateChannels) && reqData.candidateChannels.length > 0;

  checks.push({
    item: "目标候选人画像",
    passed: hasCandidatePersona || hasTargetBackground,
    score: (hasCandidatePersona || hasTargetBackground) ? 2 : 0,
    detail: reqData.targetCandidateBackground || (hasCandidatePersona ? "已通过画像模块生成" : "缺失：理想候选人现在在哪里工作、什么背景"),
  });

  checks.push({
    item: "求职动机",
    passed: hasMotivation,
    score: hasMotivation ? 2 : 0,
    detail: reqData.candidateMotivation || (hasCandidatePersona ? "已通过画像模块生成" : "缺失：这类人为什么想换工作"),
  });

  checks.push({
    item: "决策因素",
    passed: hasDecisionFactors,
    score: hasDecisionFactors ? 2 : 0,
    detail: hasDecisionFactors ? "已通过画像模块生成" : "缺失：这类人选择工作时最看重什么（薪酬/成长/文化/...）",
  });

  checks.push({
    item: "信息渠道",
    passed: hasChannels,
    score: hasChannels ? 1 : 0,
    detail: hasChannels ? reqData.candidateChannels.join("、") : "缺失：这类人在哪里看 JD（BOSS/猎聘/脉脉/...）",
  });

  const actualScore = checks.reduce((s, c) => s + c.score, 0);
  const gaps = checks.filter((c) => !c.passed).map((c) => `候选人维度 - ${c.item}: ${c.detail}`);

  return {
    dimension: "候选人维度",
    weight: 0.1,
    maxScore: 7,
    actualScore,
    checks,
    gaps,
    suggestions: gaps.map((g) => `补充: ${g}`),
  };
}

function evaluateConstraintDimension(req?: Record<string, any>, biz?: Record<string, any>): DimensionScore {
  const checks: CheckResult[] = [];
  const reqData = req || {};

  checks.push({
    item: "薪酬范围",
    passed: !!reqData.budget,
    score: reqData.budget ? 3 : 0,
    detail: reqData.budget ? `${reqData.budget.min}-${reqData.budget.max}K` : "缺失：薪酬预算范围",
  });

  checks.push({
    item: "到岗时间",
    passed: !!reqData.urgency,
    score: reqData.urgency ? 1 : 0,
    detail: reqData.urgency || "缺失：紧急程度/到岗时间",
  });

  checks.push({
    item: "硬性门槛",
    passed: false,
    score: 0,
    detail: "缺失：学历/年龄/证书/背景等硬性条件",
  });

  checks.push({
    item: "工作地点",
    passed: false,
    score: 0,
    detail: "缺失：必须在哪个城市？远程？混合？",
  });

  checks.push({
    item: "HC 数量",
    passed: false,
    score: 0,
    detail: "缺失：招 1 个还是多个？",
  });

  checks.push({
    item: "预算弹性",
    passed: !!biz?.budgetConstraint,
    score: biz?.budgetConstraint ? 1 : 0,
    detail: biz?.budgetConstraint || "缺失：预算弹性（宽松/适中/紧张）",
  });

  const actualScore = checks.reduce((s, c) => s + c.score, 0);
  const gaps = checks.filter((c) => !c.passed).map((c) => `约束维度 - ${c.item}: ${c.detail}`);

  return {
    dimension: "约束维度",
    weight: 0.05,
    maxScore: 8,
    actualScore,
    checks,
    gaps,
    suggestions: gaps.map((g) => `补充: ${g}`),
  };
}

// ========== 建议生成 ==========

function generateRecommendations(dimensions: DimensionScore[], grade: string): string[] {
  const recs: string[] = [];

  if (grade === "F" || grade === "D") {
    recs.push("⚠️ 上下文严重不足，建议先做需求访谈再生成 JD");
  }

  // 找出权重高但分数低的维度
  const weakDimensions = dimensions
    .filter((d) => d.actualScore / d.maxScore < 0.5)
    .sort((a, b) => b.weight - a.weight);

  for (const d of weakDimensions.slice(0, 3)) {
    recs.push(`🔴 ${d.dimension}（完成度 ${Math.round((d.actualScore / d.maxScore) * 100)}%）: ${d.gaps[0] || "需要补充"}`);
  }

  // 市场维度特殊建议
  const marketDim = dimensions.find((d) => d.dimension === "市场维度");
  if (marketDim && marketDim.actualScore === 0) {
    recs.push("💡 市场数据完全缺失，建议启用 L2 搜索获取实时薪酬和供给数据");
  }

  // 候选人维度特殊建议
  const candDim = dimensions.find((d) => d.dimension === "候选人维度");
  if (candDim && candDim.actualScore === 0) {
    recs.push("💡 候选人画像缺失，JD 可能缺乏针对性。建议描述目标候选人的特征和求职动机");
  }

  if (grade === "A") {
    recs.push("✅ 上下文充分，可以生成高质量 JD");
  }

  return recs;
}

// ========== 格式化输出 ==========

function gradeColor(grade: string): string {
  switch (grade) {
    case "A": return "🟢";
    case "B": return "🔵";
    case "C": return "🟡";
    case "D": return "🟠";
    case "F": return "🔴";
    default: return "⚪";
  }
}

export function formatEvaluation(evalResult: ContextEvaluation): string {
  let output = "";
  output += `${gradeColor(evalResult.grade)} 上下文完整性: ${evalResult.grade} (${Math.round(evalResult.completeness * 100)}%)\n`;
  output += `总分: ${evalResult.totalScore}/${evalResult.maxScore}\n\n`;

  for (const dim of evalResult.dimensions) {
    const pct = Math.round((dim.actualScore / dim.maxScore) * 100);
    const bar = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
    output += `  ${dim.dimension} [${bar}] ${pct}% (${dim.actualScore}/${dim.maxScore})\n`;

    for (const check of dim.checks) {
      output += `    ${check.passed ? "✅" : "❌"} ${check.item}: ${check.detail}\n`;
    }
  }

  if (evalResult.recommendations.length > 0) {
    output += "\n建议:\n";
    evalResult.recommendations.forEach((r) => (output += `  ${r}\n`));
  }

  return output;
}
