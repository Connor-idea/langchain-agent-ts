/**
 * 通用岗位分类系统
 *
 * 支持 10+ 行业、100+ 岗位类型
 * 用于：岗位识别、评估维度调整、市场数据匹配
 */

// ========== 岗位类型定义 ==========

export type JobCategory =
  | "tech"           // 技术研发
  | "product"        // 产品
  | "design"         // 设计
  | "operation"      // 运营
  | "marketing"      // 市场/营销
  | "sales"          // 销售
  | "finance"        // 财务
  | "hr"             // 人力资源
  | "admin"          // 行政
  | "service"        // 服务/客服
  | "food"           // 餐饮
  | "retail"         // 零售
  | "education"      // 教育
  | "medical"        // 医疗
  | "manufacturing"  // 制造
  | "logistics"      // 物流
  | "legal"          // 法务
  | "other";         // 其他

export interface JobInfo {
  category: JobCategory;
  roleName: string;       // 标准岗位名
  industry?: string;      // 行业
  isManagement: boolean;  // 是否管理岗
  level?: string;         // 级别
}

// ========== 岗位关键词映射 ==========

const JOB_KEYWORDS: Record<JobCategory, string[]> = {
  tech: [
    "工程师", "开发", "前端", "后端", "全栈", "架构师", "运维", "测试",
    "算法", "数据", "AI", "人工智能", "机器学习", "深度学习", "NLP",
    "Python", "Java", "Go", "Rust", "React", "Vue", "Node",
    "DevOps", "SRE", "DBA", "安全", "区块链", "嵌入式", "硬件",
    "CTO", "技术总监", "技术负责人",
  ],
  product: [
    "产品经理", "产品总监", "产品设计", "需求分析", "用户研究",
    "产品运营", "产品专家", "高级产品", "产品VP",
  ],
  design: [
    "设计师", "UI", "UX", "交互", "视觉", "平面", "美术",
    "插画", "动效", "品牌", "工业设计", "室内设计", "空间设计",
    "Figma", "Sketch", "Photoshop", "AI设计",
  ],
  operation: [
    "运营", "内容运营", "用户运营", "活动运营", "社群运营",
    "新媒体", "短视频", "直播", "电商运营", "店铺运营",
    "私域", "增长", "数据运营", "策略运营", "商业化",
  ],
  marketing: [
    "市场", "营销", "品牌", "公关", "PR", "媒介", "广告",
    "SEM", "SEO", "投放", "增长", "获客", "传播",
    "CMO", "市场总监", "品牌总监",
  ],
  sales: [
    "销售", "客户经理", "大客户", "商务", "BD", "渠道",
    "区域经理", "城市经理", "销售总监", "销售VP",
    "顾问", "客户成功", "Account",
  ],
  finance: [
    "财务", "会计", "出纳", "审计", "税务", "CFO",
    "财务经理", "财务总监", "成本", "预算", "资金",
    "CPA", "ACCA", "财务分析", "投融资",
  ],
  hr: [
    "HR", "人力", "招聘", "培训", "薪酬", "绩效",
    "HRBP", "HRD", "CHO", "组织发展", "OD",
    "猎头", "人才", "员工关系",
  ],
  admin: [
    "行政", "前台", "文秘", "助理", "秘书", "总务",
    "办公室", "综合", "后勤",
  ],
  service: [
    "客服", "客户", "售后", "投诉", "咨询", "接线",
    "服务员", "接待", "导播", "导购",
  ],
  food: [
    "厨师", "炒锅", "切配", "打荷", "面点", "烘焙",
    "甜品", "咖啡", "调酒", "茶艺", "餐饮",
    "店长", "店员", "收银", "传菜", "洗碗",
    "后厨", "前厅", "配菜", "凉菜", "热菜",
    "烧烤", "火锅", "日料", "西餐", "中餐",
    "扬州炒饭", "蛋炒饭", "炸货", "卤味", "双皮奶", "冰粉",
  ],
  retail: [
    "导购", "促销", "理货", "仓管", "收银",
    "店长", "区域", "督导", "采购",
  ],
  education: [
    "老师", "教师", "培训", "讲师", "导师", "教研",
    "课程", "教学", "班主任", "辅导", "校长",
    "幼教", "中小学", "大学", "职业", "在线教育",
  ],
  medical: [
    "医生", "护士", "药师", "医技", "检验", "影像",
    "护理", "康复", "中医", "西医", "口腔",
    "院长", "科室主任", "主治", "住院医",
  ],
  manufacturing: [
    "生产", "制造", "工艺", "品质", "质检", "QC",
    "厂长", "车间", "设备", "维修", "电工",
    "焊工", "钳工", "数控", "注塑", "模具",
  ],
  logistics: [
    "物流", "仓储", "配送", "快递", "外卖", "骑手",
    "分拣", "打包", "调度", "车队", "供应链",
  ],
  legal: [
    "法务", "律师", "合规", "知识产权", "风控",
    "合同", "诉讼", "法律顾问",
  ],
  other: [],
};

// ========== 行业映射 ==========

const INDUSTRY_KEYWORDS: Record<string, string[]> = {
  "互联网": ["互联网", "IT", "软件", "SaaS", "PaaS", "平台", "APP"],
  "电商": ["电商", "淘宝", "京东", "拼多多", "直播带货", "跨境"],
  "餐饮": ["餐饮", "连锁", "快餐", "正餐", "小吃", "奶茶", "咖啡", "火锅"],
  "零售": ["零售", "超市", "便利店", "百货", "专卖"],
  "金融": ["金融", "银行", "保险", "证券", "基金", "支付", "P2P"],
  "教育": ["教育", "培训", "学校", "在线教育", "K12", "职教"],
  "医疗": ["医疗", "医院", "诊所", "医药", "器械", "健康"],
  "制造": ["制造", "工厂", "生产", "加工", "代工"],
  "房地产": ["房地产", "地产", "物业", "公寓", "写字楼"],
  "游戏": ["游戏", "手游", "端游", "游戏开发"],
  "媒体": ["媒体", "新闻", "出版", "影视", "综艺", "MCN"],
  "汽车": ["汽车", "车", "出行", "网约车", "新能源"],
  "物流": ["物流", "快递", "供应链", "仓储"],
  "旅游": ["旅游", "酒店", "民宿", "OTA", "景区"],
  "农业": ["农业", "养殖", "种植", "农产品"],
};

// ========== 岗位识别函数 ==========

/**
 * 从文本中识别岗位类型
 */
export function identifyJobType(text: string): JobInfo {
  const textLower = text.toLowerCase();

  // 1. 识别岗位类别
  let category: JobCategory = "other";
  let roleName = "岗位";
  let matchedKeywords: string[] = [];

  for (const [cat, keywords] of Object.entries(JOB_KEYWORDS)) {
    for (const kw of keywords) {
      if (textLower.includes(kw.toLowerCase())) {
        category = cat as JobCategory;
        matchedKeywords.push(kw);
      }
    }
    if (matchedKeywords.length > 0) break;
  }

  // 2. 提取岗位名称（优先使用匹配到的关键词）
  if (matchedKeywords.length > 0) {
    // 使用第一个匹配到的关键词作为岗位名
    roleName = matchedKeywords[0];
  } else {
    // 如果没有匹配到关键词，使用模式匹配
    const rolePatterns = [
      /招[个一名]?\s*([^，,。.、\s]+)/,
      /需要[个一名]?\s*([^，,。.、\s]+)/,
      /缺[个一名]?\s*([^，,。.、\s]+)/,
      /找[个一名]?\s*([^，,。.、\s]+)/,
    ];

    for (const pattern of rolePatterns) {
      const match = text.match(pattern);
      if (match) {
        roleName = match[1].replace(/^[个一名]+/, "").trim();
        break;
      }
    }
  }

  // 3. 识别是否管理岗
  const managementKeywords = [
    "经理", "总监", "主管", "负责人", "VP", "CXO", "CEO", "CTO", "CFO",
    "首席", "院长", "校长", "厂长", "店长", "区长",
  ];
  const isManagement = managementKeywords.some((kw) => text.includes(kw));

  // 4. 识别行业
  let industry: string | undefined;
  for (const [ind, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
    if (keywords.some((kw) => textLower.includes(kw.toLowerCase()))) {
      industry = ind;
      break;
    }
  }

  // 5. 识别级别（排除否定语境）
  let level: string | undefined;
  const hasNegation = /不需要|不要|非|不是/.test(text);
  if (!hasNegation && /资深|高级|专家|总监|首席/.test(text)) level = "高级";
  else if (/中级|主管|3-5年/.test(text)) level = "中级";
  else if (/初级|应届|实习|助理/.test(text)) level = "初级";

  return {
    category,
    roleName,
    industry,
    isManagement,
    level,
  };
}

// ========== 评估维度定义 ==========

export interface DimensionConfig {
  name: string;
  weight: number;
  checks: {
    item: string;
    key: string;
    score: number;
  }[];
}

/**
 * 根据岗位类型获取评估维度配置
 */
export function getDimensionsForCategory(category: JobCategory): DimensionConfig[] {
  // 通用维度（所有岗位都适用）
  const commonDimensions: DimensionConfig[] = [
    {
      name: "业务维度",
      weight: 0.25,
      checks: [
        { item: "业务阶段", key: "stage", score: 1 },
        { item: "业务目标", key: "businessGoals", score: 2 },
        { item: "老板期望", key: "bossExpectation", score: 2 },
        { item: "业务痛点", key: "painPoints", score: 1 },
      ],
    },
    {
      name: "岗位维度",
      weight: 0.25,
      checks: [
        { item: "岗位职责", key: "responsibilities", score: 3 },
        { item: "任职要求", key: "requirements", score: 2 },
        { item: "工作时间", key: "workHours", score: 1 },
        { item: "工作地点", key: "location", score: 1 },
      ],
    },
    {
      name: "约束维度",
      weight: 0.2,
      checks: [
        { item: "薪资范围", key: "salaryRange", score: 3 },
        { item: "到岗时间", key: "urgency", score: 1 },
        { item: "硬性门槛", key: "hardRequirements", score: 2 },
      ],
    },
  ];

  // 岗位类型特定维度
  const categoryDimensions: Record<JobCategory, DimensionConfig[]> = {
    tech: [
      {
        name: "技术维度",
        weight: 0.2,
        checks: [
          { item: "技术栈", key: "techStack", score: 3 },
          { item: "项目经验", key: "projectExperience", score: 2 },
          { item: "技术深度", key: "techDepth", score: 2 },
        ],
      },
    ],
    food: [
      {
        name: "技能维度",
        weight: 0.2,
        checks: [
          { item: "烹饪技能", key: "cookingSkills", score: 3 },
          { item: "菜品经验", key: "dishExperience", score: 2 },
          { item: "食品安全", key: "foodSafety", score: 2 },
          { item: "SOP熟悉度", key: "sopFamiliarity", score: 1 },
        ],
      },
    ],
    sales: [
      {
        name: "销售维度",
        weight: 0.2,
        checks: [
          { item: "销售经验", key: "salesExperience", score: 3 },
          { item: "客户资源", key: "clientResources", score: 2 },
          { item: "行业经验", key: "industryExperience", score: 2 },
        ],
      },
    ],
    finance: [
      {
        name: "财务维度",
        weight: 0.2,
        checks: [
          { item: "证书资质", key: "certifications", score: 3 },
          { item: "财务系统", key: "financeSystems", score: 2 },
          { item: "行业经验", key: "industryExperience", score: 1 },
        ],
      },
    ],
    design: [
      {
        name: "设计维度",
        weight: 0.2,
        checks: [
          { item: "设计工具", key: "designTools", score: 2 },
          { item: "作品集", key: "portfolio", score: 3 },
          { item: "设计风格", key: "designStyle", score: 1 },
        ],
      },
    ],
    operation: [
      {
        name: "运营维度",
        weight: 0.2,
        checks: [
          { item: "运营经验", key: "operationExperience", score: 3 },
          { item: "数据能力", key: "dataSkills", score: 2 },
          { item: "内容能力", key: "contentSkills", score: 1 },
        ],
      },
    ],
    // 其他类型使用通用维度
    product: [],
    marketing: [],
    hr: [],
    admin: [],
    service: [],
    retail: [],
    education: [],
    medical: [],
    manufacturing: [],
    logistics: [],
    legal: [],
    other: [],
  };

  const specific = categoryDimensions[category] || [];
  return [...commonDimensions, ...specific];
}

// ========== 市场数据基准 ==========

export interface MarketBenchmark {
  salaryRange: { min: number; max: number; median: number };
  supplyLevel: "紧缺" | "平衡" | "充裕";
  commonBenefits: string[];
  typicalRequirements: string[];
}

/**
 * 获取岗位的市场基准数据
 */
export function getMarketBenchmark(
  category: JobCategory,
  level: string,
  city: string
): MarketBenchmark {
  // 城市系数
  const cityFactor: Record<string, number> = {
    "上海": 1.2,
    "北京": 1.2,
    "深圳": 1.15,
    "广州": 1.1,
    "杭州": 1.1,
    "成都": 0.9,
    "武汉": 0.85,
    "南京": 1.0,
    "西安": 0.85,
    "苏州": 0.95,
  };
  const factor = cityFactor[city] || 1.0;

  // 级别系数
  const levelFactor: Record<string, number> = {
    "初级": 0.7,
    "中级": 1.0,
    "高级": 1.5,
    "专家/总监": 2.0,
  };
  const lFactor = levelFactor[level] || 1.0;

  // 岗位基准（月薪，单位K）
  const benchmarks: Record<JobCategory, MarketBenchmark> = {
    tech: {
      salaryRange: { min: 10, max: 50, median: 25 },
      supplyLevel: "平衡",
      commonBenefits: ["五险一金", "年终奖", "股票期权", "弹性工作"],
      typicalRequirements: ["计算机相关专业", "3年以上经验", "相关技术栈"],
    },
    food: {
      salaryRange: { min: 4, max: 15, median: 7 },
      supplyLevel: "充裕",
      commonBenefits: ["包吃包住", "月休4天", "节日福利", "年终奖"],
      typicalRequirements: ["健康证", "1年以上经验", "基本烹饪技能"],
    },
    sales: {
      salaryRange: { min: 5, max: 20, median: 10 },
      supplyLevel: "充裕",
      commonBenefits: ["底薪+提成", "五险一金", "带薪培训"],
      typicalRequirements: ["沟通能力强", "有销售经验", "抗压能力"],
    },
    finance: {
      salaryRange: { min: 6, max: 30, median: 12 },
      supplyLevel: "平衡",
      commonBenefits: ["五险一金", "年终奖", "补充医疗"],
      typicalRequirements: ["财务相关专业", "CPA优先", "熟练使用财务软件"],
    },
    design: {
      salaryRange: { min: 6, max: 25, median: 12 },
      supplyLevel: "平衡",
      commonBenefits: ["五险一金", "弹性工作", "设计工具补贴"],
      typicalRequirements: ["设计相关专业", "作品集", "熟练使用设计工具"],
    },
    operation: {
      salaryRange: { min: 6, max: 25, median: 12 },
      supplyLevel: "平衡",
      commonBenefits: ["五险一金", "年终奖", "弹性工作"],
      typicalRequirements: ["数据分析能力", "内容创作能力", "用户思维"],
    },
    product: {
      salaryRange: { min: 10, max: 40, median: 20 },
      supplyLevel: "平衡",
      commonBenefits: ["五险一金", "年终奖", "股票期权"],
      typicalRequirements: ["产品思维", "数据分析", "项目管理"],
    },
    marketing: {
      salaryRange: { min: 6, max: 30, median: 15 },
      supplyLevel: "平衡",
      commonBenefits: ["五险一金", "年终奖", "营销预算"],
      typicalRequirements: ["市场洞察", "创意能力", "数据分析"],
    },
    hr: {
      salaryRange: { min: 5, max: 25, median: 10 },
      supplyLevel: "充裕",
      commonBenefits: ["五险一金", "年终奖", "弹性工作"],
      typicalRequirements: ["人力资源相关专业", "沟通能力", "劳动法知识"],
    },
    admin: {
      salaryRange: { min: 4, max: 10, median: 6 },
      supplyLevel: "充裕",
      commonBenefits: ["五险一金", "带薪年假", "节日福利"],
      typicalRequirements: ["办公软件熟练", "细心认真", "沟通能力"],
    },
    service: {
      salaryRange: { min: 4, max: 12, median: 6 },
      supplyLevel: "充裕",
      commonBenefits: ["包吃包住", "月休4天", "节日福利"],
      typicalRequirements: ["服务意识", "沟通能力", "抗压能力"],
    },
    retail: {
      salaryRange: { min: 4, max: 12, median: 6 },
      supplyLevel: "充裕",
      commonBenefits: ["底薪+提成", "五险一金", "员工折扣"],
      typicalRequirements: ["销售技巧", "亲和力", "抗压能力"],
    },
    education: {
      salaryRange: { min: 5, max: 20, median: 10 },
      supplyLevel: "平衡",
      commonBenefits: ["五险一金", "寒暑假", "培训机会"],
      typicalRequirements: ["教师资格证", "相关专业", "教学经验"],
    },
    medical: {
      salaryRange: { min: 6, max: 30, median: 15 },
      supplyLevel: "紧缺",
      commonBenefits: ["五险一金", "职称晋升", "继续教育"],
      typicalRequirements: ["执业资格", "相关学历", "临床经验"],
    },
    manufacturing: {
      salaryRange: { min: 4, max: 15, median: 7 },
      supplyLevel: "充裕",
      commonBenefits: ["包吃包住", "加班费", "社保"],
      typicalRequirements: ["相关技能证书", "安全意识", "体力"],
    },
    logistics: {
      salaryRange: { min: 4, max: 12, median: 6 },
      supplyLevel: "充裕",
      commonBenefits: ["包吃包住", "计件工资", "社保"],
      typicalRequirements: ["体力", "责任心", "会骑电动车"],
    },
    legal: {
      salaryRange: { min: 8, max: 40, median: 18 },
      supplyLevel: "平衡",
      commonBenefits: ["五险一金", "年终奖", "培训机会"],
      typicalRequirements: ["法律职业资格", "相关专业", "逻辑思维"],
    },
    other: {
      salaryRange: { min: 5, max: 15, median: 8 },
      supplyLevel: "平衡",
      commonBenefits: ["五险一金", "带薪年假"],
      typicalRequirements: ["相关经验", "沟通能力"],
    },
  };

  const base = benchmarks[category] || benchmarks.other;

  return {
    salaryRange: {
      min: Math.round(base.salaryRange.min * factor * lFactor),
      max: Math.round(base.salaryRange.max * factor * lFactor),
      median: Math.round(base.salaryRange.median * factor * lFactor),
    },
    supplyLevel: base.supplyLevel,
    commonBenefits: base.commonBenefits,
    typicalRequirements: base.typicalRequirements,
  };
}

// ========== 格式化输出 ==========

export function formatJobInfo(info: JobInfo): string {
  const categoryNames: Record<JobCategory, string> = {
    tech: "技术研发",
    product: "产品",
    design: "设计",
    operation: "运营",
    marketing: "市场/营销",
    sales: "销售",
    finance: "财务",
    hr: "人力资源",
    admin: "行政",
    service: "服务/客服",
    food: "餐饮",
    retail: "零售",
    education: "教育",
    medical: "医疗",
    manufacturing: "制造",
    logistics: "物流",
    legal: "法务",
    other: "其他",
  };

  return `岗位: ${info.roleName} | 类别: ${categoryNames[info.category]}${info.industry ? " | 行业: " + info.industry : ""}${info.isManagement ? " | 管理岗" : ""}`;
}
