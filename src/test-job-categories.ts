import { identifyJobType, getMarketBenchmark, formatJobInfo } from "./hr-agent/job-categories.js";

const testCases = [
  "我想找一个厨师，做扬州炒饭",
  "招一个前端开发，做公寓管理系统后台",
  "需要一个财务经理，要有CPA证书",
  "找一个销售代表，做B端客户",
  "招一个UI设计师",
  "需要一个幼儿园老师",
];

for (const text of testCases) {
  const info = identifyJobType(text);
  const benchmark = getMarketBenchmark(info.category, "中级", "上海");
  console.log("---");
  console.log("输入:", text);
  console.log(formatJobInfo(info));
  console.log("薪资:", benchmark.salaryRange.min + "-" + benchmark.salaryRange.max + "K (中位数 " + benchmark.salaryRange.median + "K)");
  console.log("供给:", benchmark.supplyLevel);
}
